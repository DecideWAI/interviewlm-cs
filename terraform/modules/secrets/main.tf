# Secrets Module - Secret Manager
# Provides: Secret Manager secrets for application credentials

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Application Secrets
# -----------------------------------------------------------------------------

# NextAuth Secret
resource "google_secret_manager_secret" "nextauth_secret" {
  secret_id = "${var.name_prefix}-nextauth-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "auth"
  })
}

# Anthropic API Key
resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "${var.name_prefix}-anthropic-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "api-key"
  })
}

# Modal Token ID
resource "google_secret_manager_secret" "modal_token_id" {
  secret_id = "${var.name_prefix}-modal-token-id"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "api-key"
  })
}

# Modal Token Secret
resource "google_secret_manager_secret" "modal_token_secret" {
  secret_id = "${var.name_prefix}-modal-token-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "api-key"
  })
}

# Resend API Key (Email)
resource "google_secret_manager_secret" "resend_api_key" {
  count = var.create_email_secrets ? 1 : 0

  secret_id = "${var.name_prefix}-resend-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "api-key"
  })
}

# Paddle API Key (Payments)
resource "google_secret_manager_secret" "paddle_api_key" {
  count = var.create_payment_secrets ? 1 : 0

  secret_id = "${var.name_prefix}-paddle-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "api-key"
  })
}

# Paddle Webhook Secret
resource "google_secret_manager_secret" "paddle_webhook_secret" {
  count = var.create_payment_secrets ? 1 : 0

  secret_id = "${var.name_prefix}-paddle-webhook-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "webhook"
  })
}

# LangSmith API Key (Observability)
resource "google_secret_manager_secret" "langsmith_api_key" {
  count = var.create_observability_secrets ? 1 : 0

  secret_id = "${var.name_prefix}-langsmith-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "api-key"
  })
}

# GitHub OAuth Client Secret (Optional)
resource "google_secret_manager_secret" "github_client_secret" {
  count = var.create_oauth_secrets ? 1 : 0

  secret_id = "${var.name_prefix}-github-client-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "oauth"
  })
}

# Google OAuth Client Secret (Optional)
resource "google_secret_manager_secret" "google_client_secret" {
  count = var.create_oauth_secrets ? 1 : 0

  secret_id = "${var.name_prefix}-google-client-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "secret-type" = "oauth"
  })
}

# -----------------------------------------------------------------------------
# IAM - Service Account Access to Secrets
# -----------------------------------------------------------------------------

# Use statically-known secret names for for_each to avoid plan-time unknowns
locals {
  # Build secret names statically using the name_prefix
  static_secret_names = concat(
    [
      "${var.name_prefix}-nextauth-secret",
      "${var.name_prefix}-anthropic-api-key",
      "${var.name_prefix}-modal-token-id",
      "${var.name_prefix}-modal-token-secret",
    ],
    var.create_email_secrets ? ["${var.name_prefix}-resend-api-key"] : [],
    var.create_payment_secrets ? [
      "${var.name_prefix}-paddle-api-key",
      "${var.name_prefix}-paddle-webhook-secret",
    ] : [],
    var.create_observability_secrets ? ["${var.name_prefix}-langsmith-api-key"] : [],
    var.create_oauth_secrets ? [
      "${var.name_prefix}-github-client-secret",
      "${var.name_prefix}-google-client-secret",
    ] : []
  )
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each = var.grant_service_account_access ? toset(local.static_secret_names) : toset([])

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.service_account_email}"

  depends_on = [
    google_secret_manager_secret.nextauth_secret,
    google_secret_manager_secret.anthropic_api_key,
    google_secret_manager_secret.modal_token_id,
    google_secret_manager_secret.modal_token_secret,
    google_secret_manager_secret.resend_api_key,
    google_secret_manager_secret.paddle_api_key,
    google_secret_manager_secret.paddle_webhook_secret,
    google_secret_manager_secret.langsmith_api_key,
    google_secret_manager_secret.github_client_secret,
    google_secret_manager_secret.google_client_secret,
  ]
}
