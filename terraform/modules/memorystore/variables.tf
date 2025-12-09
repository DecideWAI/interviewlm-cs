# Memorystore Module Variables

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
  description = "VPC network ID"
  type        = string
}

variable "private_services_connection" {
  description = "Private services connection (dependency)"
  type        = string
}

# Redis configuration
variable "tier" {
  description = "Service tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"

  validation {
    condition     = contains(["BASIC", "STANDARD_HA"], var.tier)
    error_message = "Tier must be BASIC or STANDARD_HA."
  }
}

variable "memory_size_gb" {
  description = "Memory size in GB"
  type        = number
  default     = 1
}

variable "redis_version" {
  description = "Redis version"
  type        = string
  default     = "REDIS_7_0"
}

# High availability
variable "replica_count" {
  description = "Number of replicas (STANDARD_HA tier only)"
  type        = number
  default     = 1
}

# Persistence
variable "persistence_mode" {
  description = "Persistence mode (DISABLED, RDB)"
  type        = string
  default     = "RDB"

  validation {
    condition     = contains(["DISABLED", "RDB"], var.persistence_mode)
    error_message = "Persistence mode must be DISABLED or RDB."
  }
}

variable "rdb_snapshot_period" {
  description = "RDB snapshot period"
  type        = string
  default     = "ONE_HOUR"

  validation {
    condition     = contains(["ONE_HOUR", "SIX_HOURS", "TWELVE_HOURS", "TWENTY_FOUR_HOURS"], var.rdb_snapshot_period)
    error_message = "Invalid RDB snapshot period."
  }
}

# Maintenance
variable "maintenance_day" {
  description = "Day of week for maintenance"
  type        = string
  default     = "SUNDAY"
}

variable "maintenance_hour" {
  description = "Hour of day for maintenance (0-23, UTC)"
  type        = number
  default     = 4
}

# Security
variable "auth_enabled" {
  description = "Enable Redis AUTH"
  type        = bool
  default     = true
}

variable "transit_encryption_mode" {
  description = "Transit encryption mode"
  type        = string
  default     = "DISABLED"

  validation {
    condition     = contains(["DISABLED", "SERVER_AUTHENTICATION"], var.transit_encryption_mode)
    error_message = "Transit encryption mode must be DISABLED or SERVER_AUTHENTICATION."
  }
}

variable "store_url_in_secret_manager" {
  description = "Store Redis URL in Secret Manager"
  type        = bool
  default     = true
}

# Labels
variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
