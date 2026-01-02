# Cloud SQL Module - PostgreSQL Database
# Provides: Cloud SQL PostgreSQL instance with high availability options

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
# Random suffix for unique naming
# -----------------------------------------------------------------------------

resource "random_id" "db_suffix" {
  byte_length = 4
}

# -----------------------------------------------------------------------------
# Cloud SQL PostgreSQL Instance
# -----------------------------------------------------------------------------

resource "google_sql_database_instance" "main" {
  name             = "${var.name_prefix}-pg-${random_id.db_suffix.hex}"
  project          = var.project_id
  region           = var.region
  database_version = var.database_version

  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    availability_type = var.availability_type
    disk_type         = var.disk_type
    disk_size         = var.disk_size
    disk_autoresize   = var.disk_autoresize

    # Private IP configuration with SSL enforcement
    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.network_id
      enable_private_path_for_google_cloud_services = true
      # Security: Use ssl_mode for SSL enforcement (require_ssl is deprecated)
      # When ssl_mode is set, require_ssl must be false (or omitted)
      ssl_mode = var.ssl_mode
    }

    # Backup configuration
    backup_configuration {
      enabled                        = var.backup_enabled
      start_time                     = var.backup_start_time
      point_in_time_recovery_enabled = var.point_in_time_recovery
      transaction_log_retention_days = var.backup_retention_days

      backup_retention_settings {
        retained_backups = var.retained_backups
        retention_unit   = "COUNT"
      }
    }

    # Maintenance window
    maintenance_window {
      day          = var.maintenance_day
      hour         = var.maintenance_hour
      update_track = var.maintenance_update_track
    }

    # Database flags for performance
    dynamic "database_flags" {
      for_each = var.database_flags
      content {
        name  = database_flags.value.name
        value = database_flags.value.value
      }
    }

    # Insights for query performance
    insights_config {
      query_insights_enabled  = var.query_insights_enabled
      query_plans_per_minute  = var.query_insights_enabled ? 5 : 0
      query_string_length     = var.query_insights_enabled ? 1024 : 0
      record_application_tags = var.query_insights_enabled
      record_client_address   = var.query_insights_enabled
    }

    user_labels = merge(var.labels, {
      "app"         = "interviewlm"
      "component"   = "database"
      "environment" = var.environment
    })
  }

  depends_on = [var.private_services_connection]

  lifecycle {
    prevent_destroy = false # Set to true in production via variable
  }
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

resource "google_sql_database" "main" {
  name     = var.database_name
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  charset  = "UTF8"
}

# -----------------------------------------------------------------------------
# Database User
# -----------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = true
  # Exclude problematic characters for connection strings
  override_special = "!#$%&*()-_=+[]{}|:,.<>?"
}

resource "google_sql_user" "main" {
  name     = var.database_user
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
  type     = "BUILT_IN"

  deletion_policy = "ABANDON"
}

# -----------------------------------------------------------------------------
# Store password in Secret Manager
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret" "db_password" {
  count = var.store_password_in_secret_manager ? 1 : 0

  secret_id = "${var.name_prefix}-db-password"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret_version" "db_password" {
  count = var.store_password_in_secret_manager ? 1 : 0

  secret      = google_secret_manager_secret.db_password[0].id
  secret_data = random_password.db_password.result
}

# Store full DATABASE_URL in Secret Manager
resource "google_secret_manager_secret" "database_url" {
  count = var.store_password_in_secret_manager ? 1 : 0

  secret_id = "${var.name_prefix}-database-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret_version" "database_url" {
  count = var.store_password_in_secret_manager ? 1 : 0

  secret = google_secret_manager_secret.database_url[0].id
  # Include sslmode=require when SSL is enforced (ENCRYPTED_ONLY or TRUSTED_CLIENT_CERTIFICATE_REQUIRED)
  secret_data = var.ssl_mode != "ALLOW_UNENCRYPTED_AND_ENCRYPTED" ? "postgresql://${var.database_user}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${var.database_name}?schema=public&sslmode=require" : "postgresql://${var.database_user}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${var.database_name}?schema=public"
}
