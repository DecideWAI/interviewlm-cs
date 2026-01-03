# LangGraph Module - Cloud SQL Configuration
# Dedicated PostgreSQL instance for LangGraph state persistence

# -----------------------------------------------------------------------------
# Random suffix for unique naming
# -----------------------------------------------------------------------------

resource "random_id" "db_suffix" {
  byte_length = 4
}

# -----------------------------------------------------------------------------
# Cloud SQL PostgreSQL Instance
# -----------------------------------------------------------------------------

resource "google_sql_database_instance" "langgraph" {
  name             = "${var.name_prefix}-langgraph-pg-${random_id.db_suffix.hex}"
  project          = var.project_id
  region           = var.region
  database_version = var.database_version

  deletion_protection = var.database_deletion_protection

  settings {
    tier              = var.database_tier
    availability_type = "ZONAL" # Budget tier - upgrade to REGIONAL for HA
    disk_type         = "PD_SSD"
    disk_size         = var.database_disk_size
    disk_autoresize   = true

    # Private IP only (no public access)
    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.network_id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    # Backup configuration
    backup_configuration {
      enabled                        = var.database_backup_enabled
      start_time                     = "03:00" # 3 AM UTC
      point_in_time_recovery_enabled = var.database_backup_enabled
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    # Maintenance window (Sunday 4 AM UTC)
    maintenance_window {
      day          = 7 # Sunday
      hour         = 4
      update_track = "stable"
    }

    # Database flags for security and performance
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    # Query insights for debugging
    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }

    user_labels = merge(var.labels, {
      "app"         = "langgraph"
      "component"   = "database"
      "environment" = var.environment
    })
  }

  depends_on = [var.private_services_connection]

  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

resource "google_sql_database" "langgraph" {
  name     = "langgraph_state"
  project  = var.project_id
  instance = google_sql_database_instance.langgraph.name
  charset  = "UTF8"
}

# -----------------------------------------------------------------------------
# Database User
# -----------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = true
  # Exclude problematic characters for connection strings
  # '@' is used to separate credentials from host in PostgreSQL URIs
  # '?' is used to start query parameters
  override_special = "!#$%&*()-_=+[]{}|:,.<>"
}

resource "google_sql_user" "langgraph" {
  name     = "langgraph"
  project  = var.project_id
  instance = google_sql_database_instance.langgraph.name
  password = random_password.db_password.result
  type     = "BUILT_IN"

  deletion_policy = "ABANDON"
}
