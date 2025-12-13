# InterviewLM - Local Test Environment
# Minimal Terraform configuration for local development testing
#
# This environment creates only the resources needed for local testing:
# - GCS bucket for file storage
# - Service account with necessary permissions
#
# Usage:
#   cd terraform/environments/local-test
#   terraform init
#   terraform apply -var="project_id=your-dev-project-id"
#
# After apply, run the setup script to configure local credentials:
#   ./setup-local-credentials.sh

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Local backend for simplicity (no remote state needed for local testing)
  # backend "local" {}
}

# -----------------------------------------------------------------------------
# Providers
# -----------------------------------------------------------------------------

provider "google" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Local Variables
# -----------------------------------------------------------------------------

locals {
  environment = "local-test"
  name_prefix = "interviewlm-${local.environment}"

  labels = {
    project     = "interviewlm"
    environment = local.environment
    managed_by  = "terraform"
    purpose     = "local-development"
  }
}

# -----------------------------------------------------------------------------
# Random Suffix for Globally Unique Names
# -----------------------------------------------------------------------------

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# -----------------------------------------------------------------------------
# Enable Required APIs
# -----------------------------------------------------------------------------

resource "google_project_service" "storage" {
  project = var.project_id
  service = "storage.googleapis.com"

  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  project = var.project_id
  service = "iam.googleapis.com"

  disable_on_destroy = false
}

resource "google_project_service" "iamcredentials" {
  project = var.project_id
  service = "iamcredentials.googleapis.com"

  disable_on_destroy = false
}

# -----------------------------------------------------------------------------
# Service Account for Local Development
# -----------------------------------------------------------------------------

resource "google_service_account" "local_dev" {
  project      = var.project_id
  account_id   = "${local.name_prefix}-sa"
  display_name = "InterviewLM Local Development Service Account"
  description  = "Service account for local development and testing of GCS file storage"

  depends_on = [google_project_service.iam]
}

# Grant storage admin on the bucket
resource "google_storage_bucket_iam_member" "local_dev_storage_admin" {
  bucket = google_storage_bucket.sessions.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.local_dev.email}"
}

# Allow creating signed URLs
resource "google_project_iam_member" "local_dev_token_creator" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${google_service_account.local_dev.email}"

  depends_on = [google_project_service.iamcredentials]
}

# -----------------------------------------------------------------------------
# Service Account Key (for local development only)
# -----------------------------------------------------------------------------

resource "google_service_account_key" "local_dev_key" {
  service_account_id = google_service_account.local_dev.name
  public_key_type    = "TYPE_X509_PEM_FILE"
}

# -----------------------------------------------------------------------------
# GCS Bucket for Session Files
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "sessions" {
  name          = "${local.name_prefix}-sessions-${random_id.bucket_suffix.hex}"
  project       = var.project_id
  location      = var.region  # Regional bucket in different region from prod
  storage_class = "STANDARD"

  # Enable uniform bucket-level access (recommended)
  uniform_bucket_level_access = true

  # Block public access
  public_access_prevention = "enforced"

  # No versioning needed for local testing
  versioning {
    enabled = false
  }

  # Short retention for test data
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = var.retention_days
    }
  }

  # CORS configuration for local development
  cors {
    origin          = ["http://localhost:3000", "http://127.0.0.1:3000"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  # Soft delete disabled for dev (faster cleanup)
  soft_delete_policy {
    retention_duration_seconds = 0
  }

  # Allow destruction for testing
  force_destroy = true

  labels = local.labels

  depends_on = [google_project_service.storage]
}

# -----------------------------------------------------------------------------
# Local Setup Script
# -----------------------------------------------------------------------------

resource "local_file" "setup_script" {
  filename = "${path.module}/setup-local-credentials.sh"
  content  = <<-EOF
#!/bin/bash
# Setup script for local GCS access
# Generated by Terraform

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CREDENTIALS_FILE="$PROJECT_ROOT/.gcs-credentials.json"

echo "Setting up local GCS credentials for InterviewLM..."
echo ""
echo "Project ID: ${var.project_id}"
echo "Region: ${var.region}"
echo "Bucket: ${google_storage_bucket.sessions.name}"
echo ""

# Write credentials file
cat > "$CREDENTIALS_FILE" << 'CREDENTIALS'
${base64decode(google_service_account_key.local_dev_key.private_key)}
CREDENTIALS

chmod 600 "$CREDENTIALS_FILE"
echo "Credentials written to: $CREDENTIALS_FILE"

# Create .env.local if it doesn't exist
ENV_LOCAL="$PROJECT_ROOT/.env.local"
if [ ! -f "$ENV_LOCAL" ]; then
  touch "$ENV_LOCAL"
fi

# Update .env.local with GCS configuration
if ! grep -q "GOOGLE_CLOUD_PROJECT" "$ENV_LOCAL" 2>/dev/null; then
  echo "" >> "$ENV_LOCAL"
  echo "# GCS Configuration (added by terraform/environments/local-test)" >> "$ENV_LOCAL"
  echo "GOOGLE_CLOUD_PROJECT=${var.project_id}" >> "$ENV_LOCAL"
  echo "GCS_BUCKET=${google_storage_bucket.sessions.name}" >> "$ENV_LOCAL"
  echo "GOOGLE_APPLICATION_CREDENTIALS=$CREDENTIALS_FILE" >> "$ENV_LOCAL"
  echo "GCS configuration added to $ENV_LOCAL"
else
  echo "GCS configuration already exists in $ENV_LOCAL"
  echo "To update, manually set:"
  echo "  GOOGLE_CLOUD_PROJECT=${var.project_id}"
  echo "  GCS_BUCKET=${google_storage_bucket.sessions.name}"
  echo "  GOOGLE_APPLICATION_CREDENTIALS=$CREDENTIALS_FILE"
fi

echo ""
echo "Setup complete! You can now run 'npm run dev' to test GCS integration."
echo ""
echo "To verify the setup, run:"
echo "  npx ts-node -e \"import { testConnection } from './lib/services/gcs'; testConnection().then(console.log)\""
EOF

  file_permission = "0755"
}

# Also output the .env.local snippet for manual setup
resource "local_file" "env_snippet" {
  filename = "${path.module}/env-local-snippet.txt"
  content  = <<-EOF
# Add these to your .env.local file:

# GCS Configuration for Local Development
GOOGLE_CLOUD_PROJECT=${var.project_id}
GCS_BUCKET=${google_storage_bucket.sessions.name}
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/project/.gcs-credentials.json
EOF
}
