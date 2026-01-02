# LangGraph Module - Outputs
# Exposes resource information for use by other modules

# -----------------------------------------------------------------------------
# Cloud Run Service
# -----------------------------------------------------------------------------

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.langgraph.name
}

output "service_url" {
  description = "URL of the Cloud Run service (internal only)"
  value       = google_cloud_run_v2_service.langgraph.uri
}

output "service_account_email" {
  description = "Email of the LangGraph service account"
  value       = google_service_account.langgraph.email
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

output "database_instance_name" {
  description = "Name of the Cloud SQL instance"
  value       = google_sql_database_instance.langgraph.name
}

output "database_connection_name" {
  description = "Connection name for Cloud SQL"
  value       = google_sql_database_instance.langgraph.connection_name
}

output "database_private_ip" {
  description = "Private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.langgraph.private_ip_address
}

output "database_name" {
  description = "Name of the database"
  value       = google_sql_database.langgraph.name
}

# -----------------------------------------------------------------------------
# Redis
# -----------------------------------------------------------------------------

output "redis_instance_name" {
  description = "Name of the Redis instance"
  value       = google_redis_instance.langgraph.name
}

output "redis_host" {
  description = "Host address of the Redis instance"
  value       = google_redis_instance.langgraph.host
}

output "redis_port" {
  description = "Port of the Redis instance"
  value       = google_redis_instance.langgraph.port
}

# -----------------------------------------------------------------------------
# Secrets
# -----------------------------------------------------------------------------

output "database_url_secret_id" {
  description = "Secret ID for the database URL"
  value       = google_secret_manager_secret.database_url.secret_id
}

output "redis_url_secret_id" {
  description = "Secret ID for the Redis URL"
  value       = google_secret_manager_secret.redis_url.secret_id
}

output "internal_api_key_secret_id" {
  description = "Secret ID for the internal API key"
  value       = google_secret_manager_secret.internal_api_key.secret_id
}

# -----------------------------------------------------------------------------
# For Main App Integration
# -----------------------------------------------------------------------------

output "langgraph_api_url" {
  description = "URL for the main app to use when calling LangGraph"
  value       = google_cloud_run_v2_service.langgraph.uri
}

output "langgraph_internal_api_key_secret_id" {
  description = "Secret ID for internal API key (for main app to use)"
  value       = google_secret_manager_secret.internal_api_key.secret_id
}
