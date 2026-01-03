# Development Environment Variables

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
  default     = "gcr.io/cloudrun/placeholder"
}

variable "alert_email_addresses" {
  description = "Email addresses for alert notifications"
  type        = list(string)
  default     = []
}

variable "enable_alerts" {
  description = "Enable monitoring alerts"
  type        = bool
  default     = false
}

variable "enable_workload_identity" {
  description = "Enable Workload Identity for GitHub Actions"
  type        = bool
  default     = false
}

variable "github_repo" {
  description = "GitHub repository (owner/repo format)"
  type        = string
  default     = ""
}

variable "modal_universal_image_id" {
  description = "Modal universal sandbox image ID (pre-built with all languages)"
  type        = string
  default     = "im-nvLRpFpK5g2XpGMWhQwbfg"
}
