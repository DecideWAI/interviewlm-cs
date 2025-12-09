# Secrets Module Variables

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

# Feature flags
variable "create_email_secrets" {
  description = "Create email service secrets (Resend)"
  type        = bool
  default     = true
}

variable "create_payment_secrets" {
  description = "Create payment service secrets (Paddle)"
  type        = bool
  default     = true
}

variable "create_observability_secrets" {
  description = "Create observability secrets (LangSmith)"
  type        = bool
  default     = true
}

variable "create_oauth_secrets" {
  description = "Create OAuth secrets (GitHub, Google)"
  type        = bool
  default     = false
}

# IAM
variable "service_account_email" {
  description = "Service account email for secret access"
  type        = string
  default     = ""
}

# Labels
variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
