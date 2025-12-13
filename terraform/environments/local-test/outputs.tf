# Local Test Environment Outputs

output "bucket_name" {
  description = "GCS bucket name for session files"
  value       = google_storage_bucket.sessions.name
}

output "bucket_url" {
  description = "GCS bucket URL"
  value       = google_storage_bucket.sessions.url
}

output "service_account_email" {
  description = "Service account email for local development"
  value       = google_service_account.local_dev.email
}

output "project_id" {
  description = "GCP project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP region"
  value       = var.region
}

output "setup_instructions" {
  description = "Instructions for setting up local development"
  value       = <<-EOF

    ============================================
    Local GCS Setup Complete!
    ============================================

    Bucket: ${google_storage_bucket.sessions.name}
    Region: ${var.region}
    Service Account: ${google_service_account.local_dev.email}

    To configure your local environment, run:

      cd terraform/environments/local-test
      ./setup-local-credentials.sh

    Or manually add to your .env.local:

      GOOGLE_CLOUD_PROJECT=${var.project_id}
      GCS_BUCKET=${google_storage_bucket.sessions.name}
      GOOGLE_APPLICATION_CREDENTIALS=/path/to/.gcs-credentials.json

    To test the connection:

      npx ts-node -e "import { testConnection } from './lib/services/gcs'; testConnection().then(console.log)"

  EOF
}

# Sensitive output for credentials (use with caution)
output "service_account_key_base64" {
  description = "Base64-encoded service account key (sensitive)"
  value       = google_service_account_key.local_dev_key.private_key
  sensitive   = true
}
