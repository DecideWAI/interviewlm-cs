# InterviewLM - Development Environment
# Terraform configuration for dev environment

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "gcs" {
    # Configure in backend.tfvars or via -backend-config
    # bucket = "interviewlm-terraform-state-PROJECT_ID"
    # prefix = "dev"
  }
}

# -----------------------------------------------------------------------------
# Providers
# -----------------------------------------------------------------------------

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Local Variables
# -----------------------------------------------------------------------------

locals {
  environment = "dev"
  name_prefix = "interviewlm-${local.environment}"

  labels = {
    project     = "interviewlm"
    environment = local.environment
    managed_by  = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Enable Required APIs
# -----------------------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "artifactregistry.googleapis.com",
    "iamcredentials.googleapis.com",
  ])

  project = var.project_id
  service = each.value

  disable_on_destroy = false
}

# -----------------------------------------------------------------------------
# IAM Module
# -----------------------------------------------------------------------------

module "iam" {
  source = "../../modules/iam"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  create_cicd_service_account = true
  enable_workload_identity    = var.enable_workload_identity
  github_repo                 = var.github_repo
  create_artifact_registry    = true

  labels = local.labels

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# VPC Module
# -----------------------------------------------------------------------------

module "vpc" {
  source = "../../modules/vpc"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  subnet_cidr                 = "10.0.0.0/20"
  vpc_connector_cidr          = "10.8.0.0/28"
  vpc_connector_min_instances = 2
  vpc_connector_max_instances = 3
  vpc_connector_machine_type  = "e2-micro"

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# Cloud SQL Module
# -----------------------------------------------------------------------------

module "cloud_sql" {
  source = "../../modules/cloud_sql"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  network_id                  = module.vpc.network_id
  private_services_connection = module.vpc.private_services_connection

  # Dev: minimal resources
  tier              = "db-f1-micro"
  availability_type = "ZONAL"
  disk_size         = 10
  disk_autoresize   = true

  # Backups still enabled for safety
  backup_enabled         = true
  point_in_time_recovery = false
  retained_backups       = 3

  # Relaxed deletion protection for dev
  deletion_protection              = false
  store_password_in_secret_manager = true

  query_insights_enabled = true

  labels = local.labels

  depends_on = [module.vpc]
}

# -----------------------------------------------------------------------------
# Memorystore Module
# -----------------------------------------------------------------------------

module "memorystore" {
  source = "../../modules/memorystore"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  network_id                  = module.vpc.network_id
  private_services_connection = module.vpc.private_services_connection

  # Dev: basic tier, minimal memory
  tier           = "BASIC"
  memory_size_gb = 1
  redis_version  = "REDIS_7_0"

  persistence_mode = "RDB"
  auth_enabled     = true

  store_url_in_secret_manager = true

  labels = local.labels

  depends_on = [module.vpc]
}

# -----------------------------------------------------------------------------
# Cloud Storage Module
# -----------------------------------------------------------------------------

module "cloud_storage" {
  source = "../../modules/cloud_storage"

  project_id  = var.project_id
  location    = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  storage_class            = "STANDARD"
  versioning_enabled       = true
  create_artifacts_bucket  = true
  artifacts_retention_days = 30

  # Simplified lifecycle for dev
  lifecycle_rules = [
    {
      action_type = "Delete"
      age_days    = 90
    }
  ]

  force_destroy         = true # Allow destruction in dev
  service_account_email = module.iam.cloud_run_service_account_email

  labels = local.labels

  depends_on = [module.iam]
}

# -----------------------------------------------------------------------------
# Secrets Module
# -----------------------------------------------------------------------------

module "secrets" {
  source = "../../modules/secrets"

  project_id  = var.project_id
  environment = local.environment
  name_prefix = local.name_prefix

  create_email_secrets         = true
  create_payment_secrets       = false # Disable payments in dev
  create_observability_secrets = true
  create_oauth_secrets         = false

  service_account_email = module.iam.cloud_run_service_account_email

  labels = local.labels

  depends_on = [module.iam]
}

# -----------------------------------------------------------------------------
# Cloud Run Module
# -----------------------------------------------------------------------------

module "cloud_run" {
  source = "../../modules/cloud_run"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  vpc_connector_id      = module.vpc.vpc_connector_id
  service_account_email = module.iam.cloud_run_service_account_email

  # Dev: minimal resources, scale to zero
  app_image         = var.app_image
  app_cpu           = "1"
  app_memory        = "512Mi"
  app_min_instances = 0
  app_max_instances = 2

  # Workers disabled by default in dev
  enable_workers       = false
  worker_min_instances = 0
  worker_max_instances = 1

  allow_public_access = true
  custom_domain       = ""

  # Environment variables
  app_env_vars = {
    NODE_ENV                 = "development"
    NEXTAUTH_URL             = "" # Will be set after deployment
    GCS_BUCKET_SESSIONS      = module.cloud_storage.sessions_bucket_name
    GCS_BUCKET_ARTIFACTS     = module.cloud_storage.artifacts_bucket_name
    ENABLE_CODE_STREAMING    = "true"
    MODAL_UNIVERSAL_IMAGE_ID = var.modal_universal_image_id
  }

  # Secret references
  app_secret_env_vars = {
    DATABASE_URL = {
      secret_id = module.cloud_sql.database_url_secret_id
      version   = "latest"
    }
    REDIS_URL = {
      secret_id = module.memorystore.redis_url_secret_id
      version   = "latest"
    }
    NEXTAUTH_SECRET = {
      secret_id = module.secrets.nextauth_secret_id
      version   = "latest"
    }
    ANTHROPIC_API_KEY = {
      secret_id = module.secrets.anthropic_api_key_secret_id
      version   = "latest"
    }
    MODAL_TOKEN_ID = {
      secret_id = module.secrets.modal_token_id_secret_id
      version   = "latest"
    }
    MODAL_TOKEN_SECRET = {
      secret_id = module.secrets.modal_token_secret_secret_id
      version   = "latest"
    }
  }

  labels = local.labels

  depends_on_resources = [
    module.cloud_sql.instance_name,
    module.memorystore.instance_name,
    module.secrets.all_secret_ids,
  ]

  depends_on = [
    module.vpc,
    module.cloud_sql,
    module.memorystore,
    module.secrets,
  ]
}

# -----------------------------------------------------------------------------
# Monitoring Module
# -----------------------------------------------------------------------------

module "monitoring" {
  source = "../../modules/monitoring"

  project_id  = var.project_id
  environment = local.environment
  name_prefix = local.name_prefix

  alert_email_addresses = var.alert_email_addresses
  app_url               = module.cloud_run.app_url

  # Relaxed thresholds for dev
  error_rate_threshold   = 10
  latency_threshold_ms   = 5000
  database_cpu_threshold = 90

  database_instance_name = module.cloud_sql.instance_name

  # Disable alerts in dev by default
  alerts_enabled = var.enable_alerts

  labels = local.labels

  depends_on = [module.cloud_run, module.cloud_sql]
}
