# IAM Module - Service Accounts and Permissions
# Provides: Service accounts with least privilege access

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
# Cloud Run Service Account
# -----------------------------------------------------------------------------

resource "google_service_account" "cloud_run" {
  project      = var.project_id
  account_id   = "${var.name_prefix}-cloud-run"
  display_name = "InterviewLM Cloud Run Service Account - ${var.environment}"
  description  = "Service account for Cloud Run services in ${var.environment}"
}

# Cloud SQL Client (connect to database)
resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Secret Manager access
resource "google_project_iam_member" "cloud_run_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Storage access
resource "google_project_iam_member" "cloud_run_storage_object_admin" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Logging (write logs)
resource "google_project_iam_member" "cloud_run_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Trace (write traces)
resource "google_project_iam_member" "cloud_run_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Monitoring (write metrics)
resource "google_project_iam_member" "cloud_run_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# -----------------------------------------------------------------------------
# CI/CD Service Account (for deployments)
# -----------------------------------------------------------------------------

resource "google_service_account" "cicd" {
  count = var.create_cicd_service_account ? 1 : 0

  project      = var.project_id
  account_id   = "${var.name_prefix}-cicd"
  display_name = "InterviewLM CI/CD Service Account - ${var.environment}"
  description  = "Service account for CI/CD pipelines in ${var.environment}"
}

# Cloud Run Admin (deploy services)
resource "google_project_iam_member" "cicd_run_admin" {
  count = var.create_cicd_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.cicd[0].email}"
}

# Service Account User (act as Cloud Run service account)
resource "google_service_account_iam_member" "cicd_cloud_run_user" {
  count = var.create_cicd_service_account ? 1 : 0

  service_account_id = google_service_account.cloud_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd[0].email}"
}

# Artifact Registry Writer (push images)
resource "google_project_iam_member" "cicd_artifact_registry" {
  count = var.create_cicd_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cicd[0].email}"
}

# Secret Manager Viewer (read secrets during deployment)
resource "google_project_iam_member" "cicd_secret_viewer" {
  count = var.create_cicd_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/secretmanager.viewer"
  member  = "serviceAccount:${google_service_account.cicd[0].email}"
}

# Storage Admin (for Terraform state)
resource "google_project_iam_member" "cicd_storage_admin" {
  count = var.create_cicd_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.cicd[0].email}"
}

# -----------------------------------------------------------------------------
# Workload Identity (for GitHub Actions)
# -----------------------------------------------------------------------------

resource "google_iam_workload_identity_pool" "github" {
  count = var.enable_workload_identity ? 1 : 0

  project                   = var.project_id
  workload_identity_pool_id = "${var.name_prefix}-github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Workload identity pool for GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count = var.enable_workload_identity ? 1 : 0

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_condition = var.github_repo != "" ? "assertion.repository == '${var.github_repo}'" : null
}

# Allow GitHub Actions to impersonate CI/CD service account
resource "google_service_account_iam_member" "github_workload_identity" {
  count = var.enable_workload_identity && var.create_cicd_service_account ? 1 : 0

  service_account_id = google_service_account.cicd[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repo}"
}

# -----------------------------------------------------------------------------
# Artifact Registry (Container Registry)
# -----------------------------------------------------------------------------

resource "google_artifact_registry_repository" "main" {
  count = var.create_artifact_registry ? 1 : 0

  project       = var.project_id
  location      = var.region
  repository_id = "${var.name_prefix}-docker"
  format        = "DOCKER"
  description   = "Docker images for InterviewLM ${var.environment}"

  labels = merge(var.labels, {
    "environment" = var.environment
  })
}
