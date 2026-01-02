# Secrets Module Outputs

output "nextauth_secret_id" {
  description = "NextAuth secret ID"
  value       = google_secret_manager_secret.nextauth_secret.secret_id
}

output "anthropic_api_key_secret_id" {
  description = "Anthropic API key secret ID"
  value       = google_secret_manager_secret.anthropic_api_key.secret_id
}

output "modal_token_id_secret_id" {
  description = "Modal token ID secret ID"
  value       = google_secret_manager_secret.modal_token_id.secret_id
}

output "modal_token_secret_secret_id" {
  description = "Modal token secret secret ID"
  value       = google_secret_manager_secret.modal_token_secret.secret_id
}

output "resend_api_key_secret_id" {
  description = "Resend API key secret ID"
  value       = var.create_email_secrets ? google_secret_manager_secret.resend_api_key[0].secret_id : null
}

output "paddle_api_key_secret_id" {
  description = "Paddle API key secret ID"
  value       = var.create_payment_secrets ? google_secret_manager_secret.paddle_api_key[0].secret_id : null
}

output "paddle_webhook_secret_id" {
  description = "Paddle webhook secret secret ID"
  value       = var.create_payment_secrets ? google_secret_manager_secret.paddle_webhook_secret[0].secret_id : null
}

output "langsmith_api_key_secret_id" {
  description = "LangSmith API key secret ID"
  value       = var.create_observability_secrets ? google_secret_manager_secret.langsmith_api_key[0].secret_id : null
}

output "github_client_secret_id" {
  description = "GitHub OAuth client secret ID"
  value       = var.create_oauth_secrets ? google_secret_manager_secret.github_client_secret[0].secret_id : null
}

output "google_client_secret_id" {
  description = "Google OAuth client secret ID"
  value       = var.create_oauth_secrets ? google_secret_manager_secret.google_client_secret[0].secret_id : null
}

output "turnstile_secret_key_secret_id" {
  description = "Cloudflare Turnstile secret key ID"
  value       = var.create_security_secrets ? google_secret_manager_secret.turnstile_secret_key[0].secret_id : null
}

# Map of all secrets for easy reference
output "all_secret_ids" {
  description = "Map of all secret IDs"
  value = {
    nextauth_secret       = google_secret_manager_secret.nextauth_secret.secret_id
    anthropic_api_key     = google_secret_manager_secret.anthropic_api_key.secret_id
    modal_token_id        = google_secret_manager_secret.modal_token_id.secret_id
    modal_token_secret    = google_secret_manager_secret.modal_token_secret.secret_id
    resend_api_key        = var.create_email_secrets ? google_secret_manager_secret.resend_api_key[0].secret_id : null
    paddle_api_key        = var.create_payment_secrets ? google_secret_manager_secret.paddle_api_key[0].secret_id : null
    paddle_webhook        = var.create_payment_secrets ? google_secret_manager_secret.paddle_webhook_secret[0].secret_id : null
    langsmith_api_key     = var.create_observability_secrets ? google_secret_manager_secret.langsmith_api_key[0].secret_id : null
    github_client_secret  = var.create_oauth_secrets ? google_secret_manager_secret.github_client_secret[0].secret_id : null
    google_client_secret  = var.create_oauth_secrets ? google_secret_manager_secret.google_client_secret[0].secret_id : null
    turnstile_secret_key  = var.create_security_secrets ? google_secret_manager_secret.turnstile_secret_key[0].secret_id : null
  }
}
