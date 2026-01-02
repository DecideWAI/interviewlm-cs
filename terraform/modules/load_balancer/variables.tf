# Load Balancer Module Variables

# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for regional resources (NEG)"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names (e.g., 'interviewlm-prod')"
  type        = string
}

variable "cloud_run_service_name" {
  description = "The name of the Cloud Run service to route traffic to"
  type        = string
}

variable "ssl_domains" {
  description = "List of domains for the managed SSL certificate"
  type        = list(string)

  validation {
    condition     = length(var.ssl_domains) > 0
    error_message = "At least one domain must be specified for SSL certificate."
  }
}

# -----------------------------------------------------------------------------
# Optional Variables
# -----------------------------------------------------------------------------

variable "enable_cdn" {
  description = "Enable Cloud CDN for caching static assets"
  type        = bool
  default     = false
}

variable "enable_quic" {
  description = "Enable QUIC protocol for faster connections"
  type        = bool
  default     = false
}

variable "enable_ddos_protection" {
  description = "Enable Cloud Armor Layer 7 DDoS protection"
  type        = bool
  default     = true
}

variable "log_sample_rate" {
  description = "Fraction of requests to log (0.0 to 1.0)"
  type        = number
  default     = 1.0

  validation {
    condition     = var.log_sample_rate >= 0 && var.log_sample_rate <= 1
    error_message = "Log sample rate must be between 0.0 and 1.0."
  }
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
