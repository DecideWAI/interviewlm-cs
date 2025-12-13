# Cloud Run Module Variables

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

variable "vpc_connector_id" {
  description = "VPC Access connector ID"
  type        = string
}

variable "service_account_email" {
  description = "Service account email for Cloud Run services"
  type        = string
}

# Application configuration
variable "app_image" {
  description = "Container image for the main application"
  type        = string
  default     = "gcr.io/cloudrun/placeholder"
}

variable "app_cpu" {
  description = "CPU limit for app containers"
  type        = string
  default     = "1"
}

variable "app_memory" {
  description = "Memory limit for app containers"
  type        = string
  default     = "512Mi"
}

variable "app_min_instances" {
  description = "Minimum instances for app (0 for scale to zero)"
  type        = number
  default     = 0
}

variable "app_max_instances" {
  description = "Maximum instances for app"
  type        = number
  default     = 10
}

variable "app_env_vars" {
  description = "Environment variables for the application"
  type        = map(string)
  default     = {}
}

variable "app_secret_env_vars" {
  description = "Secret environment variables (references to Secret Manager)"
  type = map(object({
    secret_id = string
    version   = string
  }))
  default = {}
}

# Worker configuration
variable "enable_workers" {
  description = "Enable worker service"
  type        = bool
  default     = true
}

variable "worker_image" {
  description = "Container image for workers (defaults to app_image)"
  type        = string
  default     = ""
}

variable "worker_cpu" {
  description = "CPU limit for worker containers"
  type        = string
  default     = "1"
}

variable "worker_memory" {
  description = "Memory limit for worker containers"
  type        = string
  default     = "512Mi"
}

variable "worker_min_instances" {
  description = "Minimum instances for workers"
  type        = number
  default     = 1
}

variable "worker_max_instances" {
  description = "Maximum instances for workers"
  type        = number
  default     = 5
}

# Access control
variable "allow_public_access" {
  description = "Allow public access to the application"
  type        = bool
  default     = true
}

variable "ingress" {
  description = "Ingress settings for Cloud Run (INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING)"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"

  validation {
    condition     = contains(["INGRESS_TRAFFIC_ALL", "INGRESS_TRAFFIC_INTERNAL_ONLY", "INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING"], var.ingress)
    error_message = "Ingress must be one of: INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING."
  }
}

variable "custom_domain" {
  description = "Custom domain for the application (optional)"
  type        = string
  default     = ""
}

# Labels
variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}

# Dependencies
variable "depends_on_resources" {
  description = "Resources this module depends on"
  type        = list(any)
  default     = []
}
