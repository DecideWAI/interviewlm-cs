# Production Environment Variables (Budget-Optimized)
# These defaults are configured for ~$135-165/month target

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "storage_location" {
  description = "GCS bucket location (region or multi-region)"
  type        = string
  default     = "US" # Multi-region for durability
}

# -----------------------------------------------------------------------------
# Application Configuration (Budget defaults)
# -----------------------------------------------------------------------------

variable "app_image" {
  description = "Container image for the application"
  type        = string
}

variable "custom_domain" {
  description = "Custom domain for Cloud Run"
  type        = string
}

variable "app_cpu" {
  description = "CPU for app containers"
  type        = string
  default     = "1"  # Budget: 1 vCPU (was 4)
}

variable "app_memory" {
  description = "Memory for app containers"
  type        = string
  default     = "1Gi"  # Budget: 1GB (was 2Gi)
}

variable "app_min_instances" {
  description = "Minimum app instances (0 for scale-to-zero)"
  type        = number
  default     = 0  # Budget: Scale-to-zero (was 2)
}

variable "app_max_instances" {
  description = "Maximum app instances"
  type        = number
  default     = 10  # Budget: Max 10 (was 20)
}

# -----------------------------------------------------------------------------
# Workers Configuration (Budget defaults)
# -----------------------------------------------------------------------------

variable "worker_cpu" {
  description = "CPU for worker containers"
  type        = string
  default     = "1"  # Budget: 1 vCPU (was 2)
}

variable "worker_memory" {
  description = "Memory for worker containers"
  type        = string
  default     = "1Gi"  # Budget: 1GB (was 2Gi)
}

variable "worker_min_instances" {
  description = "Minimum worker instances (0 for scale-to-zero)"
  type        = number
  default     = 0  # Budget: Scale-to-zero (was 2)
}

variable "worker_max_instances" {
  description = "Maximum worker instances"
  type        = number
  default     = 5  # Budget: Max 5 (was 10)
}

# -----------------------------------------------------------------------------
# Database Configuration (Budget defaults)
# -----------------------------------------------------------------------------

variable "database_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-g1-small"  # Budget: ~$25/month (was db-custom-2-4096)
}

# -----------------------------------------------------------------------------
# Redis Configuration (Budget defaults)
# -----------------------------------------------------------------------------

variable "redis_memory_gb" {
  description = "Redis memory in GB"
  type        = number
  default     = 1  # Budget: 1GB (was 5)
}

# -----------------------------------------------------------------------------
# Security Configuration
# -----------------------------------------------------------------------------

variable "cloud_run_ingress" {
  description = "Cloud Run ingress setting. Use INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING for Cloudflare setup"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"

  validation {
    condition     = contains(["INGRESS_TRAFFIC_ALL", "INGRESS_TRAFFIC_INTERNAL_ONLY", "INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING"], var.cloud_run_ingress)
    error_message = "Ingress must be one of: INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING."
  }
}

# -----------------------------------------------------------------------------
# Alerting Configuration
# -----------------------------------------------------------------------------

variable "alert_email_addresses" {
  description = "Email addresses for alert notifications"
  type        = list(string)
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for alerts"
  type        = string
  default     = ""
  sensitive   = true
}

variable "slack_channel_name" {
  description = "Slack channel name"
  type        = string
  default     = "#interviewlm-alerts"
}

variable "slack_auth_token" {
  description = "Slack auth token"
  type        = string
  default     = ""
  sensitive   = true
}

# -----------------------------------------------------------------------------
# CI/CD Configuration
# -----------------------------------------------------------------------------

variable "enable_workload_identity" {
  description = "Enable Workload Identity for GitHub Actions"
  type        = bool
  default     = true
}

variable "github_repo" {
  description = "GitHub repository (owner/repo format)"
  type        = string
}

variable "enable_oauth" {
  description = "Enable OAuth secrets (GitHub, Google)"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Payment Configuration (Paddle)
# NOTE: Product IDs are now stored in the database (PricingPlan model)
# Only API credentials are configured here as secrets
# See: prisma/schema.prisma (PricingPlan), prisma/seed.ts
# -----------------------------------------------------------------------------

variable "paddle_vendor_id" {
  description = "Paddle vendor ID (displayed in checkout, not secret)"
  type        = string
  default     = ""
}

# REMOVED: paddle_product_single, paddle_product_medium, paddle_product_enterprise
# These are now managed in the database for dynamic configuration without redeployment

# -----------------------------------------------------------------------------
# Email Configuration
# -----------------------------------------------------------------------------

variable "resend_from_email" {
  description = "From email address for Resend"
  type        = string
  default     = "noreply@interviewlm.com"
}
