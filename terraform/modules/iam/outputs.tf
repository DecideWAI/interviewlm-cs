# IAM Module Outputs

output "cloud_run_service_account_email" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloud_run.email
}

output "cloud_run_service_account_id" {
  description = "Cloud Run service account ID"
  value       = google_service_account.cloud_run.id
}

output "cicd_service_account_email" {
  description = "CI/CD service account email"
  value       = var.create_cicd_service_account ? google_service_account.cicd[0].email : null
}

output "cicd_service_account_id" {
  description = "CI/CD service account ID"
  value       = var.create_cicd_service_account ? google_service_account.cicd[0].id : null
}

output "workload_identity_pool_id" {
  description = "Workload Identity Pool ID"
  value       = var.enable_workload_identity ? google_iam_workload_identity_pool.github[0].workload_identity_pool_id : null
}

output "workload_identity_provider_name" {
  description = "Workload Identity Provider full name"
  value       = var.enable_workload_identity ? google_iam_workload_identity_pool_provider.github[0].name : null
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = var.create_artifact_registry ? "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.main[0].repository_id}" : null
}

output "artifact_registry_id" {
  description = "Artifact Registry repository ID"
  value       = var.create_artifact_registry ? google_artifact_registry_repository.main[0].id : null
}
