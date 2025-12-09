# InterviewLM - Production Environment
# Terraform configuration for production environment

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
    # prefix = "prod"
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
  environment = "prod"
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

  subnet_cidr                 = "10.2.0.0/20"
  vpc_connector_cidr          = "10.10.0.0/28"
  vpc_connector_min_instances = 2
  vpc_connector_max_instances = 10
  vpc_connector_machine_type  = "e2-standard-4"

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

  # Production: high availability with good resources
  tier              = var.database_tier
  availability_type = "REGIONAL" # Multi-zone HA
  disk_size         = 50
  disk_autoresize   = true

  # Full backups with PITR
  backup_enabled         = true
  point_in_time_recovery = true
  backup_retention_days  = 14
  retained_backups       = 30

  # Production: strict deletion protection
  deletion_protection              = true
  store_password_in_secret_manager = true

  query_insights_enabled = true

  # Production database flags for performance
  database_flags = [
    {
      name  = "log_checkpoints"
      value = "on"
    },
    {
      name  = "log_connections"
      value = "on"
    },
    {
      name  = "log_disconnections"
      value = "on"
    },
    {
      name  = "log_lock_waits"
      value = "on"
    },
    {
      name  = "log_min_duration_statement"
      value = "1000" # Log queries > 1 second
    },
    {
      name  = "max_connections"
      value = "200"
    }
  ]

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

  # Production: Standard HA with replicas
  tier           = "STANDARD_HA"
  memory_size_gb = var.redis_memory_gb
  redis_version  = "REDIS_7_0"
  replica_count  = 1

  persistence_mode    = "RDB"
  rdb_snapshot_period = "ONE_HOUR"
  auth_enabled        = true

  # Enable transit encryption in production
  transit_encryption_mode = "SERVER_AUTHENTICATION"

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
  location    = var.storage_location
  environment = local.environment
  name_prefix = local.name_prefix

  storage_class            = "STANDARD"
  versioning_enabled       = true
  create_artifacts_bucket  = true
  artifacts_retention_days = 365

  # Production lifecycle: transition to cheaper storage over time
  lifecycle_rules = [
    {
      action_type   = "SetStorageClass"
      storage_class = "NEARLINE"
      age_days      = 30
    },
    {
      action_type   = "SetStorageClass"
      storage_class = "COLDLINE"
      age_days      = 90
    },
    {
      action_type   = "SetStorageClass"
      storage_class = "ARCHIVE"
      age_days      = 365
    },
    {
      action_type        = "Delete"
      num_newer_versions = 5
      with_state         = "ARCHIVED"
    }
  ]

  # CORS for production domain
  enable_cors = true
  cors_origins = [
    "https://${var.custom_domain}",
    "https://www.${var.custom_domain}"
  ]

  force_destroy         = false
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
  create_payment_secrets       = true
  create_observability_secrets = true
  create_oauth_secrets         = var.enable_oauth

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

  # Production: high resources with always-on instances
  app_image         = var.app_image
  app_cpu           = var.app_cpu
  app_memory        = var.app_memory
  app_min_instances = var.app_min_instances
  app_max_instances = var.app_max_instances

  # Workers enabled with guaranteed capacity
  enable_workers       = true
  worker_cpu           = var.worker_cpu
  worker_memory        = var.worker_memory
  worker_min_instances = var.worker_min_instances
  worker_max_instances = var.worker_max_instances

  allow_public_access = true
  custom_domain       = var.custom_domain

  app_env_vars = {
    NODE_ENV              = "production"
    NEXTAUTH_URL          = "https://${var.custom_domain}"
    GCS_BUCKET_SESSIONS   = module.cloud_storage.sessions_bucket_name
    GCS_BUCKET_ARTIFACTS  = module.cloud_storage.artifacts_bucket_name
    ENABLE_CODE_STREAMING = "true"
    # Payment configuration
    PADDLE_VENDOR_ID          = var.paddle_vendor_id
    PADDLE_PRODUCT_SINGLE     = var.paddle_product_single
    PADDLE_PRODUCT_MEDIUM     = var.paddle_product_medium
    PADDLE_PRODUCT_ENTERPRISE = var.paddle_product_enterprise
    # Email configuration
    RESEND_FROM_EMAIL = var.resend_from_email
    # Observability
    LANGSMITH_TRACING  = "true"
    LANGSMITH_PROJECT  = "interviewlm-prod"
    LANGSMITH_ENDPOINT = "https://api.smith.langchain.com"
  }

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
    RESEND_API_KEY = {
      secret_id = module.secrets.resend_api_key_secret_id
      version   = "latest"
    }
    PADDLE_API_KEY = {
      secret_id = module.secrets.paddle_api_key_secret_id
      version   = "latest"
    }
    PADDLE_WEBHOOK_SECRET = {
      secret_id = module.secrets.paddle_webhook_secret_id
      version   = "latest"
    }
    LANGSMITH_API_KEY = {
      secret_id = module.secrets.langsmith_api_key_secret_id
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

  alert_email_addresses  = var.alert_email_addresses
  slack_webhook_url      = var.slack_webhook_url
  slack_channel_name     = var.slack_channel_name
  slack_auth_token       = var.slack_auth_token
  app_url                = "https://${var.custom_domain}"

  # Strict thresholds for production
  error_rate_threshold   = 1
  latency_threshold_ms   = 2000
  database_cpu_threshold = 70

  database_instance_name = module.cloud_sql.instance_name

  alerts_enabled = true

  labels = local.labels

  depends_on = [module.cloud_run, module.cloud_sql]
}
