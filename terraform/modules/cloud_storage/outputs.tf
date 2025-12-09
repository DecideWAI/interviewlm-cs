# Cloud Storage Module Outputs

output "sessions_bucket_name" {
  description = "Sessions bucket name"
  value       = google_storage_bucket.sessions.name
}

output "sessions_bucket_url" {
  description = "Sessions bucket URL"
  value       = google_storage_bucket.sessions.url
}

output "sessions_bucket_self_link" {
  description = "Sessions bucket self link"
  value       = google_storage_bucket.sessions.self_link
}

output "artifacts_bucket_name" {
  description = "Artifacts bucket name"
  value       = var.create_artifacts_bucket ? google_storage_bucket.artifacts[0].name : null
}

output "artifacts_bucket_url" {
  description = "Artifacts bucket URL"
  value       = var.create_artifacts_bucket ? google_storage_bucket.artifacts[0].url : null
}

output "all_bucket_names" {
  description = "All created bucket names"
  value = compact([
    google_storage_bucket.sessions.name,
    var.create_artifacts_bucket ? google_storage_bucket.artifacts[0].name : null
  ])
}
