# Cloud Storage Module Variables

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "location" {
  description = "GCS bucket location (region or multi-region)"
  type        = string
  default     = "US"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

# Bucket configuration
variable "storage_class" {
  description = "Storage class (STANDARD, NEARLINE, COLDLINE, ARCHIVE)"
  type        = string
  default     = "STANDARD"
}

variable "versioning_enabled" {
  description = "Enable object versioning"
  type        = bool
  default     = true
}

variable "create_artifacts_bucket" {
  description = "Create separate artifacts bucket"
  type        = bool
  default     = true
}

variable "artifacts_retention_days" {
  description = "Days to retain artifacts before deletion"
  type        = number
  default     = 90
}

# Lifecycle rules
variable "lifecycle_rules" {
  description = "Lifecycle rules for session recordings bucket"
  type = list(object({
    action_type           = string
    storage_class         = optional(string)
    age_days              = optional(number)
    num_newer_versions    = optional(number)
    with_state            = optional(string)
    matches_storage_class = optional(list(string))
  }))
  default = [
    {
      action_type        = "SetStorageClass"
      storage_class      = "NEARLINE"
      age_days           = 30
    },
    {
      action_type        = "SetStorageClass"
      storage_class      = "COLDLINE"
      age_days           = 90
    },
    {
      action_type        = "SetStorageClass"
      storage_class      = "ARCHIVE"
      age_days           = 365
    },
    {
      action_type        = "Delete"
      num_newer_versions = 3
      with_state         = "ARCHIVED"
    }
  ]
}

# CORS configuration
variable "enable_cors" {
  description = "Enable CORS for direct uploads"
  type        = bool
  default     = true
}

variable "cors_origins" {
  description = "Allowed CORS origins"
  type        = list(string)
  default     = ["*"]
}

# Security
variable "soft_delete_retention_seconds" {
  description = "Soft delete retention period in seconds"
  type        = number
  default     = 604800 # 7 days
}

variable "kms_key_name" {
  description = "KMS key for encryption (optional)"
  type        = string
  default     = ""
}

variable "force_destroy" {
  description = "Force destroy bucket even if not empty"
  type        = bool
  default     = false
}

# IAM
variable "service_account_email" {
  description = "Service account email for bucket access"
  type        = string
  default     = ""
}

# Labels
variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
