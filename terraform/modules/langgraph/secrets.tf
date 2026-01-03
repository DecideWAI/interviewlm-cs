# LangGraph Module - Secret Manager Configuration (Aegra-based)
# Manages LangGraph-specific secrets for Aegra server

# -----------------------------------------------------------------------------
# Database URL Secret (Aegra requires postgresql+asyncpg:// format)
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${var.name_prefix}-langgraph-database-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"       = "langgraph"
    "component" = "secret"
  })
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  # Aegra uses SQLAlchemy async with asyncpg driver
  # LangGraph checkpoint uses psycopg3
  # Password must be URL-encoded to handle special characters
  # Note: No SSL params in URL - asyncpg uses 'ssl', psycopg uses 'sslmode' (incompatible)
  # Cloud SQL private IP within VPC doesn't require SSL
  secret_data = "postgresql+asyncpg://${google_sql_user.langgraph.name}:${urlencode(random_password.db_password.result)}@${google_sql_database_instance.langgraph.private_ip_address}:5432/${google_sql_database.langgraph.name}"
}

# -----------------------------------------------------------------------------
# Redis URL Secret
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret" "redis_url" {
  secret_id = "${var.name_prefix}-langgraph-redis-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"       = "langgraph"
    "component" = "secret"
  })
}

resource "google_secret_manager_secret_version" "redis_url" {
  secret = google_secret_manager_secret.redis_url.id
  # Use rediss:// for TLS connections with proper certificate verification
  # Google Memorystore uses valid TLS certificates that should be verified
  secret_data = "rediss://:${google_redis_instance.langgraph.auth_string}@${google_redis_instance.langgraph.host}:${google_redis_instance.langgraph.port}"
}

# -----------------------------------------------------------------------------
# Internal API Key Secret (for service-to-service auth)
# -----------------------------------------------------------------------------

resource "random_password" "internal_api_key" {
  length  = 64
  special = false # Alphanumeric only for easier handling in headers
}

resource "google_secret_manager_secret" "internal_api_key" {
  secret_id = "${var.name_prefix}-langgraph-internal-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, {
    "app"       = "langgraph"
    "component" = "secret"
  })
}

resource "google_secret_manager_secret_version" "internal_api_key" {
  secret      = google_secret_manager_secret.internal_api_key.id
  secret_data = random_password.internal_api_key.result
}

# -----------------------------------------------------------------------------
# Grant Secret Access to LangGraph Service Account
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret_iam_member" "langgraph_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.langgraph.email}"
}

resource "google_secret_manager_secret_iam_member" "langgraph_redis_url" {
  secret_id = google_secret_manager_secret.redis_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.langgraph.email}"
}

resource "google_secret_manager_secret_iam_member" "langgraph_internal_api_key" {
  secret_id = google_secret_manager_secret.internal_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.langgraph.email}"
}

# Grant access to shared secrets (Anthropic, LangSmith, Modal)
resource "google_secret_manager_secret_iam_member" "langgraph_anthropic" {
  secret_id = var.anthropic_api_key_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.langgraph.email}"
}

resource "google_secret_manager_secret_iam_member" "langgraph_langsmith" {
  count     = var.langsmith_api_key_secret_id != "" ? 1 : 0
  secret_id = var.langsmith_api_key_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.langgraph.email}"
}

resource "google_secret_manager_secret_iam_member" "langgraph_modal_token_id" {
  secret_id = var.modal_token_id_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.langgraph.email}"
}

resource "google_secret_manager_secret_iam_member" "langgraph_modal_token_secret" {
  secret_id = var.modal_token_secret_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.langgraph.email}"
}

# Grant main app access to internal API key (so it can call LangGraph)
resource "google_secret_manager_secret_iam_member" "main_app_internal_api_key" {
  secret_id = google_secret_manager_secret.internal_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.main_app_service_account_email}"
}
