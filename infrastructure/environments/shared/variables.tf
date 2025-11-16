variable "environment" {
  description = "Environment name (staging or production)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "app_url" {
  description = "Application URL (e.g., https://staging.interviewlm.com)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

# Networking
variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "private_subnet_ids" {
  description = "IDs of private subnets"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "IDs of public subnets"
  type        = list(string)
}

# Environment-specific configuration
variable "config" {
  description = "Environment-specific resource sizing configuration"
  type = object({
    # Database configuration
    db_instance_class         = string
    db_allocated_storage      = number
    db_max_allocated_storage  = number
    db_backup_retention_days  = number
    db_multi_az               = bool
    db_skip_final_snapshot    = bool

    # Redis configuration
    redis_node_type                = string
    redis_num_cache_nodes          = number
    redis_engine_version           = string
    redis_parameter_group_family   = string
    redis_encryption_in_transit    = bool
    redis_persistence_enabled      = bool
    redis_snapshot_retention_days  = number

    # ECS configuration
    ecs_task_cpu               = number
    ecs_task_memory            = number
    ecs_desired_count          = number
    ecs_min_capacity           = number
    ecs_max_capacity           = number
    ecs_cpu_target_value       = number
    ecs_memory_target_value    = number
    use_fargate_spot           = bool
    enable_container_insights  = bool
    enable_ecs_exec            = bool

    # Storage configuration
    enable_s3_versioning       = bool
    recordings_retention_days  = number

    # General configuration
    log_retention_days         = number
    enable_deletion_protection = bool
  })
}

# Database
variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_username" {
  description = "Database master username"
  type        = string
  sensitive   = true
}

# Container image
variable "container_image" {
  description = "Full Docker image URI with tag (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com/app:latest)"
  type        = string
}

# SSL Certificate
variable "ssl_certificate_arn" {
  description = "ARN of ACM certificate for HTTPS (optional for staging)"
  type        = string
  default     = null
}

# CORS allowed origins
variable "allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
}

# Tags
variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
