output "replication_group_id" {
  description = "ID of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.main.id
}

output "primary_endpoint_address" {
  description = "Address of the primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "reader_endpoint_address" {
  description = "Address of the reader endpoint (for read replicas)"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
  sensitive   = true
}

output "port" {
  description = "Port number for Redis"
  value       = 6379
}

output "connection_string" {
  description = "Redis connection string"
  value = var.transit_encryption_enabled ? (
    "rediss://:${random_password.redis_auth[0].result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  ) : (
    "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  )
  sensitive = true
}

output "auth_token_secret_arn" {
  description = "ARN of Secrets Manager secret containing Redis AUTH token"
  value       = var.transit_encryption_enabled ? aws_secretsmanager_secret.redis_auth[0].arn : null
  sensitive   = true
}

output "security_group_id" {
  description = "ID of the Redis security group"
  value       = aws_security_group.redis.id
}

output "configuration" {
  description = "Redis configuration details"
  value = {
    engine_version       = aws_elasticache_replication_group.main.engine_version
    node_type            = var.node_type
    num_cache_nodes      = var.num_cache_nodes
    multi_az_enabled     = var.num_cache_nodes > 1
    encryption_at_rest   = true
    encryption_in_transit = var.transit_encryption_enabled
  }
}
