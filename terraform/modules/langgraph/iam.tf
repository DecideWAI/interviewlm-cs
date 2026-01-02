# LangGraph Module - IAM Configuration
# Service accounts and permissions for LangGraph deployment

# -----------------------------------------------------------------------------
# LangGraph Service Account
# -----------------------------------------------------------------------------

resource "google_service_account" "langgraph" {
  account_id   = "${var.name_prefix}-langgraph"
  display_name = "LangGraph Agents Service Account"
  description  = "Service account for LangGraph agents Cloud Run service"
  project      = var.project_id
}

# -----------------------------------------------------------------------------
# Cloud SQL Client Role (for database access)
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "langgraph_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.langgraph.email}"
}

# -----------------------------------------------------------------------------
# Secret Manager Access (for reading secrets)
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "langgraph_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.langgraph.email}"
}

# -----------------------------------------------------------------------------
# Cloud Trace Agent (for distributed tracing)
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "langgraph_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.langgraph.email}"
}

# -----------------------------------------------------------------------------
# Cloud Logging Writer (for logging)
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "langgraph_logging_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.langgraph.email}"
}

# -----------------------------------------------------------------------------
# Allow Main App to Invoke LangGraph (Cloud Run IAM)
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service_iam_member" "main_app_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.langgraph.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.main_app_service_account_email}"

  depends_on = [google_cloud_run_v2_service.langgraph]
}

# -----------------------------------------------------------------------------
# Allow LangGraph to call back to Main App (if needed)
# This may need to be configured in the main app module instead
# -----------------------------------------------------------------------------

# Note: If LangGraph needs to call back to the main Next.js app,
# the main app module should grant roles/run.invoker to this service account.
# Example (in main app module):
# resource "google_cloud_run_v2_service_iam_member" "langgraph_invoker" {
#   name   = google_cloud_run_v2_service.app.name
#   role   = "roles/run.invoker"
#   member = "serviceAccount:${var.langgraph_service_account_email}"
# }
