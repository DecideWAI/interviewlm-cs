# Cloud SQL Module Variables

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

variable "network_id" {
  description = "VPC network ID for private IP"
  type        = string
}

variable "private_services_connection" {
  description = "Private services connection (dependency)"
  type        = string
}

# Database configuration
variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_16"
}

variable "tier" {
  description = "Machine tier for Cloud SQL instance"
  type        = string
  default     = "db-f1-micro"

  validation {
    condition     = can(regex("^db-", var.tier))
    error_message = "Tier must start with 'db-' prefix."
  }
}

variable "availability_type" {
  description = "Availability type (ZONAL or REGIONAL for HA)"
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.availability_type)
    error_message = "Availability type must be ZONAL or REGIONAL."
  }
}

variable "disk_type" {
  description = "Disk type (PD_SSD or PD_HDD)"
  type        = string
  default     = "PD_SSD"
}

variable "disk_size" {
  description = "Disk size in GB"
  type        = number
  default     = 10
}

variable "disk_autoresize" {
  description = "Enable disk autoresize"
  type        = bool
  default     = true
}

variable "database_name" {
  description = "Name of the database to create"
  type        = string
  default     = "interviewlm"
}

variable "database_user" {
  description = "Database username"
  type        = string
  default     = "interviewlm"
}

# Backup configuration
variable "backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_start_time" {
  description = "Backup start time (HH:MM format, UTC)"
  type        = string
  default     = "03:00"
}

variable "point_in_time_recovery" {
  description = "Enable point-in-time recovery"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Transaction log retention in days"
  type        = number
  default     = 7
}

variable "retained_backups" {
  description = "Number of backups to retain"
  type        = number
  default     = 7
}

# Maintenance configuration
variable "maintenance_day" {
  description = "Day of week for maintenance (1-7, Monday=1)"
  type        = number
  default     = 7 # Sunday
}

variable "maintenance_hour" {
  description = "Hour of day for maintenance (0-23, UTC)"
  type        = number
  default     = 4
}

variable "maintenance_update_track" {
  description = "Maintenance update track"
  type        = string
  default     = "stable"
}

# Performance configuration
variable "database_flags" {
  description = "Database flags for PostgreSQL"
  type = list(object({
    name  = string
    value = string
  }))
  default = [
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
    }
  ]
}

variable "query_insights_enabled" {
  description = "Enable query insights"
  type        = bool
  default     = true
}

# Security
variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

variable "store_password_in_secret_manager" {
  description = "Store database password in Secret Manager"
  type        = bool
  default     = true
}

variable "require_ssl" {
  description = "Require SSL connections to the database"
  type        = bool
  default     = true
}

variable "ssl_mode" {
  description = "SSL mode for connections (ALLOW_UNENCRYPTED_AND_ENCRYPTED, ENCRYPTED_ONLY, TRUSTED_CLIENT_CERTIFICATE_REQUIRED)"
  type        = string
  default     = "ENCRYPTED_ONLY"

  validation {
    condition     = contains(["ALLOW_UNENCRYPTED_AND_ENCRYPTED", "ENCRYPTED_ONLY", "TRUSTED_CLIENT_CERTIFICATE_REQUIRED"], var.ssl_mode)
    error_message = "SSL mode must be one of: ALLOW_UNENCRYPTED_AND_ENCRYPTED, ENCRYPTED_ONLY, TRUSTED_CLIENT_CERTIFICATE_REQUIRED."
  }
}

# Labels
variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
