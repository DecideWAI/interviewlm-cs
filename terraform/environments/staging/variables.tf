# Staging Environment Variables

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "app_image" {
  description = "Container image for the application"
  type        = string
}

variable "app_url" {
  description = "Application URL (for NEXTAUTH_URL)"
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "Custom domain for Cloud Run"
  type        = string
  default     = ""
}

variable "alert_email_addresses" {
  description = "Email addresses for alert notifications"
  type        = list(string)
}

variable "enable_workload_identity" {
  description = "Enable Workload Identity for GitHub Actions"
  type        = bool
  default     = true
}

variable "github_repo" {
  description = "GitHub repository (owner/repo format)"
  type        = string
  default     = ""
}

variable "enable_oauth" {
  description = "Enable OAuth secrets (GitHub, Google)"
  type        = bool
  default     = false
}
