# IAM Module Variables

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

# CI/CD Service Account
variable "create_cicd_service_account" {
  description = "Create CI/CD service account"
  type        = bool
  default     = true
}

# Workload Identity
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

# Artifact Registry
variable "create_artifact_registry" {
  description = "Create Artifact Registry repository"
  type        = bool
  default     = true
}

# Labels
variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
