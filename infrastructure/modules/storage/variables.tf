variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging or production)"
  type        = string
}

variable "enable_versioning" {
  description = "Enable versioning for recordings bucket"
  type        = bool
  default     = true
}

variable "recordings_retention_days" {
  description = "Number of days to retain session recordings"
  type        = number
  default     = 365
}

variable "uploads_retention_days" {
  description = "Number of days to retain user uploads (0 = never delete)"
  type        = number
  default     = 0  # Keep indefinitely by default
}

variable "allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
}

variable "kms_deletion_window" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 30

  validation {
    condition     = var.kms_deletion_window >= 7 && var.kms_deletion_window <= 30
    error_message = "KMS deletion window must be between 7 and 30 days."
  }
}

variable "enable_access_logging" {
  description = "Enable S3 access logging (can be expensive)"
  type        = bool
  default     = false
}

variable "enable_alarms" {
  description = "Enable CloudWatch alarms for S3 monitoring"
  type        = bool
  default     = true
}

variable "bucket_size_alarm_threshold" {
  description = "Alarm threshold for bucket size in bytes"
  type        = number
  default     = 107374182400  # 100 GB
}

variable "alarm_actions" {
  description = "List of ARNs to notify when alarms trigger"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
