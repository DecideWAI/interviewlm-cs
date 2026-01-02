variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "interviewlm"
}

variable "domain_name" {
  description = "Root domain name for the application"
  type        = string
  default     = "interviewlm.com" # Update with your domain
}

# VPC Configuration (shared between environments)
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

# Environment-specific configurations
variable "environments" {
  description = "Environment configurations"
  type = map(object({
    # Database
    db_instance_class         = string
    db_allocated_storage      = number
    db_max_allocated_storage  = number
    db_backup_retention_days  = number
    db_multi_az               = bool
    db_skip_final_snapshot    = bool

    # Cache (Redis)
    redis_node_type                = string
    redis_num_cache_nodes          = number
    redis_engine_version           = string
    redis_parameter_group_family   = string
    redis_encryption_in_transit    = bool
    redis_persistence_enabled      = bool
    redis_snapshot_retention_days  = number

    # Compute (ECS)
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

    # Storage
    enable_s3_versioning       = bool
    recordings_retention_days  = number

    # Monitoring
    log_retention_days         = number

    # Backup & DR
    enable_deletion_protection = bool
  }))

  default = {
    staging = {
      # Database - Smaller for staging
      db_instance_class         = "db.t4g.micro"
      db_allocated_storage      = 20
      db_max_allocated_storage  = 50
      db_backup_retention_days  = 7
      db_multi_az               = false
      db_skip_final_snapshot    = true

      # Cache - Single node for staging, no encryption for cost savings
      redis_node_type                = "cache.t4g.micro"
      redis_num_cache_nodes          = 1
      redis_engine_version           = "7.0"
      redis_parameter_group_family   = "redis7"
      redis_encryption_in_transit    = false
      redis_persistence_enabled      = false
      redis_snapshot_retention_days  = 1

      # Compute - Minimal for staging, use Fargate Spot for cost savings
      ecs_task_cpu              = 256
      ecs_task_memory           = 512
      ecs_desired_count         = 1
      ecs_min_capacity          = 1
      ecs_max_capacity          = 2
      ecs_cpu_target_value      = 75
      ecs_memory_target_value   = 80
      use_fargate_spot          = true
      enable_container_insights = false
      enable_ecs_exec           = true  # Useful for debugging

      # Storage - No versioning, shorter retention
      enable_s3_versioning       = false
      recordings_retention_days  = 90

      # Monitoring - Shorter retention
      log_retention_days        = 7

      # Backup & DR - Disabled for faster teardown
      enable_deletion_protection = false
    }

    production = {
      # Database - Production-grade
      db_instance_class         = "db.t4g.small"
      db_allocated_storage      = 100
      db_max_allocated_storage  = 500
      db_backup_retention_days  = 30
      db_multi_az               = true
      db_skip_final_snapshot    = false

      # Cache - Multi-node cluster with encryption and persistence
      redis_node_type                = "cache.t4g.small"
      redis_num_cache_nodes          = 2
      redis_engine_version           = "7.0"
      redis_parameter_group_family   = "redis7"
      redis_encryption_in_transit    = true
      redis_persistence_enabled      = true
      redis_snapshot_retention_days  = 7

      # Compute - Production capacity on regular Fargate
      ecs_task_cpu              = 512
      ecs_task_memory           = 1024
      ecs_desired_count         = 2
      ecs_min_capacity          = 2
      ecs_max_capacity          = 10
      ecs_cpu_target_value      = 70
      ecs_memory_target_value   = 80
      use_fargate_spot          = false
      enable_container_insights = true
      enable_ecs_exec           = false  # Disabled for security

      # Storage - Versioning enabled, longer retention
      enable_s3_versioning       = true
      recordings_retention_days  = 365

      # Monitoring - Longer retention
      log_retention_days        = 30

      # Backup & DR - Enabled
      enable_deletion_protection = true
    }
  }
}

# Database configuration
variable "db_name" {
  description = "Database name"
  type        = string
  default     = "interviewlm"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "interviewlm_admin"
  sensitive   = true
}

# Container image configuration (ECR)
variable "container_image_staging" {
  description = "Full container image URI for staging (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm:staging)"
  type        = string
  default     = "public.ecr.aws/docker/library/nginx:latest"  # Placeholder - update after ECR push
}

variable "container_image_production" {
  description = "Full container image URI for production (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm:production)"
  type        = string
  default     = "public.ecr.aws/docker/library/nginx:latest"  # Placeholder - update after ECR push
}

# SSL Certificate ARNs (must be created manually in ACM)
variable "ssl_certificate_arn_staging" {
  description = "ARN of ACM certificate for staging HTTPS (optional)"
  type        = string
  default     = null
}

variable "ssl_certificate_arn_production" {
  description = "ARN of ACM certificate for production HTTPS"
  type        = string
  default     = null  # Update with your ACM certificate ARN
}

# Application URLs
variable "app_url_staging" {
  description = "Application URL for staging"
  type        = string
  default     = "http://staging.interviewlm.com"  # Will use ALB DNS if no custom domain
}

variable "app_url_production" {
  description = "Application URL for production"
  type        = string
  default     = "https://interviewlm.com"
}

# CORS allowed origins
variable "allowed_origins_staging" {
  description = "Allowed CORS origins for staging"
  type        = list(string)
  default     = ["http://localhost:3000", "http://staging.interviewlm.com"]
}

variable "allowed_origins_production" {
  description = "Allowed CORS origins for production"
  type        = list(string)
  default     = ["https://interviewlm.com", "https://www.interviewlm.com"]
}
