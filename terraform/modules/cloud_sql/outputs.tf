# Cloud SQL Module Outputs

output "instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.main.name
}

output "instance_connection_name" {
  description = "Cloud SQL instance connection name"
  value       = google_sql_database_instance.main.connection_name
}

output "private_ip_address" {
  description = "Private IP address of the instance"
  value       = google_sql_database_instance.main.private_ip_address
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.main.name
}

output "database_user" {
  description = "Database username"
  value       = google_sql_user.main.name
}

output "database_password" {
  description = "Database password (sensitive)"
  value       = random_password.db_password.result
  sensitive   = true
}

output "database_url" {
  description = "Full database connection URL (sensitive)"
  value       = "postgresql://${google_sql_user.main.name}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${google_sql_database.main.name}?schema=public"
  sensitive   = true
}

output "database_url_secret_id" {
  description = "Secret Manager secret ID for DATABASE_URL"
  value       = var.store_password_in_secret_manager ? google_secret_manager_secret.database_url[0].secret_id : null
}

output "database_password_secret_id" {
  description = "Secret Manager secret ID for database password"
  value       = var.store_password_in_secret_manager ? google_secret_manager_secret.db_password[0].secret_id : null
}

output "self_link" {
  description = "Cloud SQL instance self link"
  value       = google_sql_database_instance.main.self_link
}
