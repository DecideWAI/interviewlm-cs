# Networking Outputs
output "vpc_id" {
  description = "ID of the shared VPC"
  value       = module.networking.vpc_id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = module.networking.vpc_cidr
}

# ECR Output
output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = aws_ecr_repository.app.repository_url
}

#
# STAGING OUTPUTS
#
output "staging_alb_dns" {
  description = "DNS name of the staging Application Load Balancer"
  value       = module.staging.alb_dns_name
}

output "staging_alb_url" {
  description = "URL of the staging application"
  value       = "https://${module.staging.alb_dns_name}"
}

output "staging_db_endpoint" {
  description = "Endpoint of the staging RDS database"
  value       = module.staging.db_endpoint
  sensitive   = true
}

output "staging_redis_endpoint" {
  description = "Endpoint of the staging Redis cluster"
  value       = module.staging.redis_endpoint
  sensitive   = true
}

output "staging_s3_bucket" {
  description = "Name of the staging S3 bucket for session recordings"
  value       = module.staging.s3_bucket_name
}

output "staging_ecs_cluster_name" {
  description = "Name of the staging ECS cluster"
  value       = module.staging.ecs_cluster_name
}

#
# PRODUCTION OUTPUTS
#
output "production_alb_dns" {
  description = "DNS name of the production Application Load Balancer"
  value       = module.production.alb_dns_name
}

output "production_alb_url" {
  description = "URL of the production application"
  value       = "https://${module.production.alb_dns_name}"
}

output "production_db_endpoint" {
  description = "Endpoint of the production RDS database"
  value       = module.production.db_endpoint
  sensitive   = true
}

output "production_redis_endpoint" {
  description = "Endpoint of the production Redis cluster"
  value       = module.production.redis_endpoint
  sensitive   = true
}

output "production_s3_bucket" {
  description = "Name of the production S3 bucket for session recordings"
  value       = module.production.s3_bucket_name
}

output "production_ecs_cluster_name" {
  description = "Name of the production ECS cluster"
  value       = module.production.ecs_cluster_name
}

#
# CONNECTION STRINGS (Secrets Manager ARNs)
#
output "staging_database_secret_arn" {
  description = "ARN of Secrets Manager secret containing staging database credentials"
  value       = module.staging.database_secret_arn
  sensitive   = true
}

output "production_database_secret_arn" {
  description = "ARN of Secrets Manager secret containing production database credentials"
  value       = module.production.database_secret_arn
  sensitive   = true
}
