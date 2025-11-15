# Application URL
output "app_url" {
  description = "Application URL"
  value       = module.compute.app_url
}

# ALB Outputs
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.compute.alb_dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = module.compute.alb_zone_id
}

# Database Outputs
output "db_endpoint" {
  description = "RDS database endpoint"
  value       = module.database.address
  sensitive   = true
}

output "db_port" {
  description = "RDS database port"
  value       = module.database.port
}

output "db_name" {
  description = "Database name"
  value       = module.database.database_name
}

# Cache Outputs
output "redis_endpoint" {
  description = "Redis cluster primary endpoint"
  value       = module.cache.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "Redis cluster port"
  value       = module.cache.port
}

# Storage Outputs
output "recordings_bucket_name" {
  description = "Name of the S3 bucket for session recordings"
  value       = module.storage.recordings_bucket_id
}

output "uploads_bucket_name" {
  description = "Name of the S3 bucket for user uploads"
  value       = module.storage.uploads_bucket_id
}

# ECS Outputs
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.compute.cluster_name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = module.compute.service_name
}

output "ecs_security_group_id" {
  description = "ID of the ECS tasks security group"
  value       = module.compute.ecs_security_group_id
}

# Secrets Outputs
output "api_secrets_arn" {
  description = "ARN of Secrets Manager secret containing API keys"
  value       = module.secrets.api_secrets_arn
  sensitive   = true
}

output "database_password_secret_arn" {
  description = "ARN of Secrets Manager secret containing database password"
  value       = module.secrets.database_password_secret_arn
  sensitive   = true
}
