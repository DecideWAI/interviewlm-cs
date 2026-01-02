# Cloud Storage Module - Object Storage
# Provides: GCS buckets for session recordings and artifacts

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Random suffix for globally unique bucket names
# -----------------------------------------------------------------------------

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# -----------------------------------------------------------------------------
# Session Recordings Bucket
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "sessions" {
  name          = "${var.name_prefix}-sessions-${random_id.bucket_suffix.hex}"
  project       = var.project_id
  location      = var.location
  storage_class = var.storage_class

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Versioning for data protection
  versioning {
    enabled = var.versioning_enabled
  }

  # Lifecycle rules
  dynamic "lifecycle_rule" {
    for_each = var.lifecycle_rules
    content {
      action {
        type          = lifecycle_rule.value.action_type
        storage_class = lookup(lifecycle_rule.value, "storage_class", null)
      }
      condition {
        age                   = lookup(lifecycle_rule.value, "age_days", null)
        num_newer_versions    = lookup(lifecycle_rule.value, "num_newer_versions", null)
        with_state            = lookup(lifecycle_rule.value, "with_state", null)
        matches_storage_class = lookup(lifecycle_rule.value, "matches_storage_class", null)
      }
    }
  }

  # CORS configuration for direct uploads
  dynamic "cors" {
    for_each = var.enable_cors ? [1] : []
    content {
      origin          = var.cors_origins
      method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
      response_header = ["*"]
      max_age_seconds = 3600
    }
  }

  # Soft delete for recovery
  soft_delete_policy {
    retention_duration_seconds = var.soft_delete_retention_seconds
  }

  # Encryption
  dynamic "encryption" {
    for_each = var.kms_key_name != "" ? [1] : []
    content {
      default_kms_key_name = var.kms_key_name
    }
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "component"   = "storage"
    "bucket-type" = "sessions"
    "environment" = var.environment
  })

  force_destroy = var.force_destroy
}

# -----------------------------------------------------------------------------
# Artifacts Bucket (code snapshots, test results, etc.)
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "artifacts" {
  count = var.create_artifacts_bucket ? 1 : 0

  name          = "${var.name_prefix}-artifacts-${random_id.bucket_suffix.hex}"
  project       = var.project_id
  location      = var.location
  storage_class = var.storage_class

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = false # Artifacts don't need versioning
  }

  # Lifecycle: delete old artifacts
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = var.artifacts_retention_days
    }
  }

  soft_delete_policy {
    retention_duration_seconds = 604800 # 7 days
  }

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "component"   = "storage"
    "bucket-type" = "artifacts"
    "environment" = var.environment
  })

  force_destroy = var.force_destroy
}

# -----------------------------------------------------------------------------
# IAM - Service Account Access
# -----------------------------------------------------------------------------

resource "google_storage_bucket_iam_member" "sessions_admin" {
  count = var.service_account_email != "" ? 1 : 0

  bucket = google_storage_bucket.sessions.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.service_account_email}"
}

resource "google_storage_bucket_iam_member" "artifacts_admin" {
  count = var.create_artifacts_bucket && var.service_account_email != "" ? 1 : 0

  bucket = google_storage_bucket.artifacts[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.service_account_email}"
}
