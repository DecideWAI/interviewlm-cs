# Memorystore Module Outputs

output "instance_id" {
  description = "Redis instance ID"
  value       = google_redis_instance.main.id
}

output "instance_name" {
  description = "Redis instance name"
  value       = google_redis_instance.main.name
}

output "host" {
  description = "Redis instance host"
  value       = google_redis_instance.main.host
}

output "port" {
  description = "Redis instance port"
  value       = google_redis_instance.main.port
}

output "auth_string" {
  description = "Redis AUTH string (sensitive)"
  value       = google_redis_instance.main.auth_string
  sensitive   = true
}

output "redis_url" {
  description = "Full Redis connection URL (sensitive)"
  value       = var.auth_enabled ? "redis://:${google_redis_instance.main.auth_string}@${google_redis_instance.main.host}:${google_redis_instance.main.port}" : "redis://${google_redis_instance.main.host}:${google_redis_instance.main.port}"
  sensitive   = true
}

output "redis_url_secret_id" {
  description = "Secret Manager secret ID for REDIS_URL"
  value       = var.store_url_in_secret_manager ? google_secret_manager_secret.redis_url[0].secret_id : null
}

output "current_location_id" {
  description = "Current location ID of the instance"
  value       = google_redis_instance.main.current_location_id
}

output "read_endpoint" {
  description = "Read endpoint (for read replicas)"
  value       = google_redis_instance.main.read_endpoint
}

output "read_endpoint_port" {
  description = "Read endpoint port"
  value       = google_redis_instance.main.read_endpoint_port
}
