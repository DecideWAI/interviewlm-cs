# Memorystore Module - Redis Cache
# Provides: Memorystore for Redis instance for caching and job queues

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
# Memorystore for Redis
# -----------------------------------------------------------------------------

resource "google_redis_instance" "main" {
  name           = "${var.name_prefix}-redis"
  project        = var.project_id
  region         = var.region
  display_name   = "InterviewLM Redis - ${var.environment}"

  tier           = var.tier
  memory_size_gb = var.memory_size_gb
  redis_version  = var.redis_version

  # Networking
  authorized_network = var.network_id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  # Persistence (for job queue durability)
  persistence_config {
    persistence_mode    = var.persistence_mode
    rdb_snapshot_period = var.persistence_mode == "RDB" ? var.rdb_snapshot_period : null
  }

  # Maintenance
  maintenance_policy {
    weekly_maintenance_window {
      day = var.maintenance_day
      start_time {
        hours   = var.maintenance_hour
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  # High availability (Standard tier only)
  replica_count       = var.tier == "STANDARD_HA" ? var.replica_count : null
  read_replicas_mode  = var.tier == "STANDARD_HA" ? "READ_REPLICAS_ENABLED" : "READ_REPLICAS_DISABLED"

  # Auth
  auth_enabled = var.auth_enabled

  # Transit encryption
  transit_encryption_mode = var.transit_encryption_mode

  labels = merge(var.labels, {
    "app"         = "interviewlm"
    "component"   = "cache"
    "environment" = var.environment
  })

  depends_on = [var.private_services_connection]

  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Store Redis URL in Secret Manager
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret" "redis_url" {
  count = var.store_url_in_secret_manager ? 1 : 0

  secret_id = "${var.name_prefix}-redis-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret_version" "redis_url" {
  count = var.store_url_in_secret_manager ? 1 : 0

  secret = google_secret_manager_secret.redis_url[0].id
  # Use rediss:// for TLS connections (when transit_encryption_mode is not DISABLED)
  secret_data = var.auth_enabled ? "${var.transit_encryption_mode != "DISABLED" ? "rediss" : "redis"}://:${google_redis_instance.main.auth_string}@${google_redis_instance.main.host}:${google_redis_instance.main.port}" : "${var.transit_encryption_mode != "DISABLED" ? "rediss" : "redis"}://${google_redis_instance.main.host}:${google_redis_instance.main.port}"
}
