# Production Environment Outputs

output "app_url" {
  description = "Cloud Run application URL"
  value       = module.cloud_run.app_url
}

output "custom_domain_url" {
  description = "Custom domain URL"
  value       = "https://${var.custom_domain}"
}

output "worker_url" {
  description = "Cloud Run worker URL"
  value       = module.cloud_run.worker_url
}

output "database_connection_name" {
  description = "Cloud SQL connection name"
  value       = module.cloud_sql.instance_connection_name
}

output "database_private_ip" {
  description = "Cloud SQL private IP"
  value       = module.cloud_sql.private_ip_address
}

output "redis_host" {
  description = "Redis host"
  value       = module.memorystore.host
}

output "redis_port" {
  description = "Redis port"
  value       = module.memorystore.port
}

output "sessions_bucket" {
  description = "GCS sessions bucket name"
  value       = module.cloud_storage.sessions_bucket_name
}

output "artifacts_bucket" {
  description = "GCS artifacts bucket name"
  value       = module.cloud_storage.artifacts_bucket_name
}

output "cloud_run_service_account" {
  description = "Cloud Run service account email"
  value       = module.iam.cloud_run_service_account_email
}

output "cicd_service_account" {
  description = "CI/CD service account email"
  value       = module.iam.cicd_service_account_email
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = module.iam.artifact_registry_url
}

output "workload_identity_provider" {
  description = "Workload Identity Provider for GitHub Actions"
  value       = module.iam.workload_identity_provider_name
}

output "monitoring_dashboard_url" {
  description = "Monitoring dashboard URL"
  value       = "https://console.cloud.google.com/monitoring/dashboards?project=${var.project_id}"
}

output "cloud_run_console_url" {
  description = "Cloud Run console URL"
  value       = "https://console.cloud.google.com/run?project=${var.project_id}"
}

output "cloud_sql_console_url" {
  description = "Cloud SQL console URL"
  value       = "https://console.cloud.google.com/sql/instances?project=${var.project_id}"
}

output "secrets_to_populate" {
  description = "Secret IDs that need to be populated with values"
  value = {
    nextauth_secret       = module.secrets.nextauth_secret_id
    anthropic_api_key     = module.secrets.anthropic_api_key_secret_id
    modal_token_id        = module.secrets.modal_token_id_secret_id
    modal_token_secret    = module.secrets.modal_token_secret_secret_id
    resend_api_key        = module.secrets.resend_api_key_secret_id
    paddle_api_key        = module.secrets.paddle_api_key_secret_id
    paddle_webhook_secret = module.secrets.paddle_webhook_secret_id
    langsmith_api_key     = module.secrets.langsmith_api_key_secret_id
  }
}

# DNS configuration instructions
output "dns_configuration" {
  description = "DNS configuration instructions"
  value       = <<-EOT
    To configure your custom domain (${var.custom_domain}):

    1. Verify domain ownership in Google Cloud Console
    2. Add a CNAME record pointing to: ghs.googlehosted.com
    3. Wait for SSL certificate provisioning (can take up to 24 hours)

    For more details, see: https://cloud.google.com/run/docs/mapping-custom-domains
  EOT
}

# Security configuration summary
output "security_summary" {
  description = "Security configuration summary"
  value = {
    cloud_sql_ssl_mode        = "ENCRYPTED_ONLY"
    cloud_sql_private_ip      = true
    redis_auth_enabled        = true
    redis_transit_encryption  = "SERVER_AUTHENTICATION"
    cloud_run_ingress         = var.cloud_run_ingress
    vpc_connector_enabled     = true
    secrets_in_secret_manager = true
  }
}

# Upgrade instructions
output "upgrade_instructions" {
  description = "Instructions for upgrading from budget to full production"
  value       = <<-EOT
    To upgrade from budget to full production (~$400-800/month):

    1. Database HA: Change availability_type = "REGIONAL" in main.tf
    2. Database Size: Change database_tier = "db-custom-2-4096" in terraform.tfvars
    3. Redis HA: Change tier = "STANDARD_HA" and memory_size_gb = 5 in main.tf
    4. Cloud Run: Set app_min_instances = 2 and worker_min_instances = 2
    5. VPC Connector: Change vpc_connector_machine_type = "e2-standard-4"

    Then run: terraform apply
  EOT
}

# Cost estimate
output "estimated_monthly_cost" {
  description = "Estimated monthly cost breakdown"
  value       = <<-EOT
    Budget Configuration (~$135-165/month):
    - Cloud SQL db-g1-small (ZONAL): ~$25/month
    - Memorystore Redis 1GB (BASIC): ~$35/month
    - Cloud Run (scale-to-zero): ~$20-50/month
    - VPC Connector (e2-micro): ~$15/month
    - Cloud NAT: ~$30/month
    - Storage + Secrets: ~$10/month
  EOT
}
