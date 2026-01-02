# Local Test Environment Variables

variable "project_id" {
  description = "GCP project ID for local testing"
  type        = string
}

variable "region" {
  description = "GCP region (different from production us-central1)"
  type        = string
  default     = "us-east1" # Different from prod (us-central1)
}

variable "retention_days" {
  description = "Number of days to retain test files before auto-deletion"
  type        = number
  default     = 7 # Short retention for test data
}
