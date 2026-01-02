# Monitoring Module Variables

variable "project_id" {
  description = "GCP project ID"
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

# Notification channels
variable "alert_email_addresses" {
  description = "Email addresses for alert notifications"
  type        = list(string)
  default     = []
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "slack_channel_name" {
  description = "Slack channel name"
  type        = string
  default     = "#alerts"
}

variable "slack_auth_token" {
  description = "Slack auth token"
  type        = string
  default     = ""
  sensitive   = true
}

# Uptime check
variable "app_url" {
  description = "Application URL for uptime checks"
  type        = string
  default     = ""
}

# Alert thresholds
variable "error_rate_threshold" {
  description = "Error rate threshold (percentage)"
  type        = number
  default     = 5
}

variable "latency_threshold_ms" {
  description = "P99 latency threshold in milliseconds"
  type        = number
  default     = 2000
}

variable "database_cpu_threshold" {
  description = "Database CPU threshold (percentage)"
  type        = number
  default     = 80
}

variable "database_instance_name" {
  description = "Cloud SQL instance name for monitoring"
  type        = string
  default     = ""
}

# Feature flags
variable "alerts_enabled" {
  description = "Enable alert policies"
  type        = bool
  default     = true
}

# Labels
variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
