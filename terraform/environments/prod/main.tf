# InterviewLM - Production Environment (Budget-Optimized)
# Terraform configuration with security best practices for Cloudflare integration
#
# Estimated Monthly Cost: ~$135-165
# - Cloud SQL db-g1-small (ZONAL): ~$25
# - Memorystore Redis 1GB (BASIC): ~$35
# - Cloud Run (scale-to-zero): ~$20-50
# - VPC Connector (e2-micro): ~$15
# - Cloud NAT: ~$30
# - Storage + Secrets: ~$10

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
    cost_center = "budget-optimized"
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
# VPC Module (Budget: e2-micro connector)
# -----------------------------------------------------------------------------

module "vpc" {
  source = "../../modules/vpc"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  subnet_cidr        = "10.2.0.0/20"
  vpc_connector_cidr = "10.10.0.0/28"
  # Budget: Use smallest connector instances
  vpc_connector_min_instances = 2
  vpc_connector_max_instances = 3
  vpc_connector_machine_type  = "e2-micro"

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# Cloud SQL Module (Budget: db-g1-small, ZONAL, with SSL)
# -----------------------------------------------------------------------------

module "cloud_sql" {
  source = "../../modules/cloud_sql"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  network_id                  = module.vpc.network_id
  private_services_connection = module.vpc.private_services_connection

  # Budget: Small instance, single zone (no HA)
  tier              = var.database_tier
  availability_type = "ZONAL" # Single zone for budget (upgrade to REGIONAL for HA)
  disk_size         = 20      # Start smaller
  disk_autoresize   = true

  # Essential backups (still important even on budget)
  backup_enabled         = true
  point_in_time_recovery = true
  backup_retention_days  = 7
  retained_backups       = 7

  # Security: Enable deletion protection and SSL
  deletion_protection              = true
  store_password_in_secret_manager = true
  require_ssl                      = true
  ssl_mode                         = "ENCRYPTED_ONLY"

  query_insights_enabled = true

  # Essential database flags for security and performance
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
    }
  ]

  labels = local.labels

  depends_on = [module.vpc]
}

# -----------------------------------------------------------------------------
# Memorystore Module (Budget: 1GB BASIC with AUTH + TLS)
# -----------------------------------------------------------------------------

module "memorystore" {
  source = "../../modules/memorystore"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  network_id                  = module.vpc.network_id
  private_services_connection = module.vpc.private_services_connection

  # Budget: Basic tier (no HA, but much cheaper)
  # Upgrade to STANDARD_HA when traffic justifies it
  tier           = "BASIC"
  memory_size_gb = var.redis_memory_gb
  redis_version  = "REDIS_7_0"

  # No persistence for BASIC tier (cache only)
  persistence_mode = "DISABLED"

  # Security: AUTH and transit encryption
  auth_enabled            = true
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

  # Budget lifecycle: transition to cheaper storage over time
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
      num_newer_versions = 3
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
  create_security_secrets      = true

  service_account_email = module.iam.cloud_run_service_account_email

  labels = local.labels

  depends_on = [module.iam]
}

# -----------------------------------------------------------------------------
# Cloud Run Module (Budget: scale-to-zero, restricted ingress for Cloudflare)
# -----------------------------------------------------------------------------

module "cloud_run" {
  source = "../../modules/cloud_run"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  name_prefix = local.name_prefix

  vpc_connector_id      = module.vpc.vpc_connector_id
  service_account_email = module.iam.cloud_run_service_account_email

  # Budget: Scale-to-zero, smaller resources
  app_image         = var.app_image
  app_cpu           = var.app_cpu
  app_memory        = var.app_memory
  app_min_instances = var.app_min_instances # 0 for scale-to-zero
  app_max_instances = var.app_max_instances

  # Workers: Also scale-to-zero
  enable_workers       = true
  worker_cpu           = var.worker_cpu
  worker_memory        = var.worker_memory
  worker_min_instances = var.worker_min_instances # 0 for scale-to-zero
  worker_max_instances = var.worker_max_instances

  # Security: Restrict ingress for Cloudflare setup
  # This blocks direct access to Cloud Run URL
  # Traffic must come through Cloud Load Balancing (which Cloudflare can route to)
  allow_public_access = true
  ingress             = var.cloud_run_ingress
  custom_domain       = var.custom_domain

  app_env_vars = {
    NODE_ENV              = "production"
    NEXTAUTH_URL          = "https://${var.custom_domain}"
    GCS_BUCKET_SESSIONS   = module.cloud_storage.sessions_bucket_name
    GCS_BUCKET_ARTIFACTS  = module.cloud_storage.artifacts_bucket_name
    ENABLE_CODE_STREAMING = "true"
    # Payment configuration (product IDs are stored in database)
    PADDLE_VENDOR_ID = var.paddle_vendor_id
    # Email configuration
    RESEND_FROM_EMAIL = var.resend_from_email
    # Observability
    LANGSMITH_TRACING  = "true"
    LANGSMITH_PROJECT  = "interviewlm-prod"
    LANGSMITH_ENDPOINT = "https://api.smith.langchain.com"
    # Security (Cloudflare Turnstile)
    NEXT_PUBLIC_TURNSTILE_SITE_KEY = var.turnstile_site_key
    # Monitoring (Sentry)
    SENTRY_DSN             = var.sentry_dsn
    NEXT_PUBLIC_SENTRY_DSN = var.sentry_dsn
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
    TURNSTILE_SECRET_KEY = {
      secret_id = module.secrets.turnstile_secret_key_secret_id
      version   = "latest"
    }
  }

  labels = local.labels

  depends_on_resources = [
    module.cloud_sql.instance_name,
    module.memorystore.instance_name,
  ]

  depends_on = [
    module.vpc,
    module.cloud_sql,
    module.memorystore,
    module.secrets,
  ]
}

# -----------------------------------------------------------------------------
# Monitoring Module (Essential alerts only for budget)
# -----------------------------------------------------------------------------

module "monitoring" {
  source = "../../modules/monitoring"

  project_id  = var.project_id
  environment = local.environment
  name_prefix = local.name_prefix

  alert_email_addresses = var.alert_email_addresses
  slack_webhook_url     = var.slack_webhook_url
  slack_channel_name    = var.slack_channel_name
  slack_auth_token      = var.slack_auth_token
  app_url               = "https://${var.custom_domain}"

  # Reasonable thresholds for budget setup
  error_rate_threshold   = 5    # More tolerant for cold starts
  latency_threshold_ms   = 3000 # Cold start can be slow
  database_cpu_threshold = 80

  database_instance_name = module.cloud_sql.instance_name

  alerts_enabled = true

  labels = local.labels

  depends_on = [module.cloud_run, module.cloud_sql]
}

# Outputs are defined in outputs.tf
