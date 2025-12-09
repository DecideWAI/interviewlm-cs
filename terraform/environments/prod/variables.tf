# Production Environment Variables

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

# Application
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
  default     = "4"
}

variable "app_memory" {
  description = "Memory for app containers"
  type        = string
  default     = "2Gi"
}

variable "app_min_instances" {
  description = "Minimum app instances (keep warm)"
  type        = number
  default     = 2
}

variable "app_max_instances" {
  description = "Maximum app instances"
  type        = number
  default     = 20
}

# Workers
variable "worker_cpu" {
  description = "CPU for worker containers"
  type        = string
  default     = "2"
}

variable "worker_memory" {
  description = "Memory for worker containers"
  type        = string
  default     = "2Gi"
}

variable "worker_min_instances" {
  description = "Minimum worker instances"
  type        = number
  default     = 2
}

variable "worker_max_instances" {
  description = "Maximum worker instances"
  type        = number
  default     = 10
}

# Database
variable "database_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-2-4096" # 2 vCPU, 4GB RAM
}

# Redis
variable "redis_memory_gb" {
  description = "Redis memory in GB"
  type        = number
  default     = 5
}

# Alerting
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

# CI/CD
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

# Payment (Paddle)
variable "paddle_vendor_id" {
  description = "Paddle vendor ID"
  type        = string
}

variable "paddle_product_single" {
  description = "Paddle product ID for single assessment"
  type        = string
}

variable "paddle_product_medium" {
  description = "Paddle product ID for medium pack"
  type        = string
}

variable "paddle_product_enterprise" {
  description = "Paddle product ID for enterprise"
  type        = string
}

# Email
variable "resend_from_email" {
  description = "From email address for Resend"
  type        = string
  default     = "noreply@interviewlm.com"
}
