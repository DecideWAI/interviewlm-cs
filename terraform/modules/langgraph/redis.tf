# LangGraph Module - Memorystore (Redis) Configuration
# Dedicated Redis instance for LangGraph pub-sub and streaming

# -----------------------------------------------------------------------------
# Memorystore for Redis
# -----------------------------------------------------------------------------

resource "google_redis_instance" "langgraph" {
  name         = "${var.name_prefix}-langgraph-redis"
  project      = var.project_id
  region       = var.region
  display_name = "LangGraph Redis - ${var.environment}"

  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = var.redis_version

  # Networking - Private Service Access
  authorized_network = var.network_id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  # Persistence - disabled for BASIC tier (pub-sub only, no durability needed)
  persistence_config {
    persistence_mode    = var.redis_tier == "STANDARD_HA" ? "RDB" : "DISABLED"
    rdb_snapshot_period = var.redis_tier == "STANDARD_HA" ? "TWELVE_HOURS" : null
  }

  # Maintenance window (Sunday 5 AM UTC)
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 5
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  # High availability (Standard tier only)
  replica_count      = var.redis_tier == "STANDARD_HA" ? 1 : null
  read_replicas_mode = var.redis_tier == "STANDARD_HA" ? "READ_REPLICAS_ENABLED" : "READ_REPLICAS_DISABLED"

  # Security - AUTH and transit encryption
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  labels = merge(var.labels, {
    "app"         = "langgraph"
    "component"   = "cache"
    "environment" = var.environment
  })

  depends_on = [var.private_services_connection]

  lifecycle {
    prevent_destroy = false
  }
}
