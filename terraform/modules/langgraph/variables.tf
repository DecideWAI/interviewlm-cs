# LangGraph Module - Variables
# Defines all input variables for the LangGraph deployment module

# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for deployment"
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
  description = "VPC network ID for private connectivity"
  type        = string
}

variable "vpc_connector_id" {
  description = "VPC Access Connector ID for Cloud Run"
  type        = string
}

variable "private_services_connection" {
  description = "Private services connection for Cloud SQL/Memorystore"
  type        = string
}

variable "langgraph_image" {
  description = "Docker image URL for LangGraph service"
  type        = string
}

variable "main_app_service_account_email" {
  description = "Service account email of the main app (for IAM permissions)"
  type        = string
}

# -----------------------------------------------------------------------------
# Shared Secret IDs (from main app secrets module)
# -----------------------------------------------------------------------------

variable "anthropic_api_key_secret_id" {
  description = "Secret Manager secret ID for Anthropic API key"
  type        = string
}

variable "langsmith_api_key_secret_id" {
  description = "Secret Manager secret ID for LangSmith API key (optional)"
  type        = string
  default     = ""
}

variable "modal_token_id_secret_id" {
  description = "Secret Manager secret ID for Modal token ID"
  type        = string
}

variable "modal_token_secret_secret_id" {
  description = "Secret Manager secret ID for Modal token secret"
  type        = string
}

# -----------------------------------------------------------------------------
# Cloud SQL Configuration
# -----------------------------------------------------------------------------

variable "database_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-g1-small"
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_16"
}

variable "database_disk_size" {
  description = "Initial disk size in GB"
  type        = number
  default     = 10
}

variable "database_backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "database_deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Memorystore (Redis) Configuration
# -----------------------------------------------------------------------------

variable "redis_tier" {
  description = "Redis tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1
}

variable "redis_version" {
  description = "Redis version"
  type        = string
  default     = "REDIS_7_0"
}

# -----------------------------------------------------------------------------
# Cloud Run Configuration
# -----------------------------------------------------------------------------

variable "min_instances" {
  description = "Minimum number of instances (set to 1 to avoid cold starts)"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 5
}

variable "cpu" {
  description = "CPU allocation for Cloud Run"
  type        = string
  default     = "2"
}

variable "memory" {
  description = "Memory allocation for Cloud Run"
  type        = string
  default     = "2Gi"
}

variable "timeout" {
  description = "Request timeout in seconds"
  type        = string
  default     = "300s"
}

# -----------------------------------------------------------------------------
# Modal Service URLs
# -----------------------------------------------------------------------------

variable "modal_execute_url" {
  description = "Modal execute endpoint URL"
  type        = string
  default     = ""
}

variable "modal_write_file_url" {
  description = "Modal write file endpoint URL"
  type        = string
  default     = ""
}

variable "modal_read_file_url" {
  description = "Modal read file endpoint URL"
  type        = string
  default     = ""
}

variable "modal_list_files_url" {
  description = "Modal list files endpoint URL"
  type        = string
  default     = ""
}

variable "modal_execute_command_url" {
  description = "Modal execute command endpoint URL"
  type        = string
  default     = ""
}

variable "modal_universal_image_id" {
  description = "Modal universal sandbox image ID (pre-built with all languages)"
  type        = string
  default     = "im-nvLRpFpK5g2XpGMWhQwbfg"
}

# -----------------------------------------------------------------------------
# LangSmith/Observability Configuration
# -----------------------------------------------------------------------------

variable "langsmith_tracing_enabled" {
  description = "Enable LangSmith tracing"
  type        = bool
  default     = true
}

variable "langsmith_project" {
  description = "LangSmith project name"
  type        = string
  default     = "interviewlm-agents"
}

# -----------------------------------------------------------------------------
# Next.js Internal URL (for callbacks)
# -----------------------------------------------------------------------------

variable "nextjs_internal_url" {
  description = "Internal URL for Next.js app (for SSE callbacks)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Labels
# -----------------------------------------------------------------------------

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
