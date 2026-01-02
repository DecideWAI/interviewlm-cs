# Cloud Run Module Outputs

output "app_service_id" {
  description = "Cloud Run app service ID"
  value       = google_cloud_run_v2_service.app.id
}

output "app_service_name" {
  description = "Cloud Run app service name"
  value       = google_cloud_run_v2_service.app.name
}

output "app_url" {
  description = "Cloud Run app service URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "app_latest_revision" {
  description = "Latest revision of the app service"
  value       = google_cloud_run_v2_service.app.latest_ready_revision
}

output "worker_service_id" {
  description = "Cloud Run worker service ID"
  value       = var.enable_workers ? google_cloud_run_v2_service.worker[0].id : null
}

output "worker_service_name" {
  description = "Cloud Run worker service name"
  value       = var.enable_workers ? google_cloud_run_v2_service.worker[0].name : null
}

output "worker_url" {
  description = "Cloud Run worker service URL"
  value       = var.enable_workers ? google_cloud_run_v2_service.worker[0].uri : null
}

output "custom_domain_status" {
  description = "Custom domain mapping status (null when using load balancer)"
  value       = var.custom_domain != "" && !var.use_load_balancer ? google_cloud_run_domain_mapping.app[0].status : null
}
