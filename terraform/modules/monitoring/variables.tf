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
  description = "Error rate threshold (percentage) - lower for earlier detection"
  type        = number
  default     = 1  # Reduced from 5% for earlier incident detection
}

variable "latency_threshold_ms" {
  description = "P99 latency threshold in milliseconds (accounts for cold starts)"
  type        = number
  default     = 2000  # Kept at 2000ms to accommodate cold starts
}

variable "failed_jobs_threshold" {
  description = "Number of failed jobs to trigger alert"
  type        = number
  default     = 10  # Alert when DLQ has >10 failed jobs
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

variable "enable_database_monitoring" {
  description = "Enable database monitoring alerts (set true when database_instance_name is known)"
  type        = bool
  default     = true
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
