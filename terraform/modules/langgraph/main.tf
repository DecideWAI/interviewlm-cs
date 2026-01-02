# LangGraph Module - Cloud Run Service
# Main deployment configuration for LangGraph agents

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 5.0.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Cloud Run Service for LangGraph Agents
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "langgraph" {
  name     = "${var.name_prefix}-langgraph"
  location = var.region
  project  = var.project_id

  # Security: Internal traffic only (no public access)
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.langgraph.email

    # Scaling: Keep at least 1 instance to avoid cold starts
    # LangGraph should not scale to zero - it needs persistent connections
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # VPC Access for private connectivity to Cloud SQL and Redis
    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.langgraph_image

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = false # Keep CPU allocated for consistent performance
        startup_cpu_boost = true
      }

      # ---------------------------------------------------------------------
      # Environment Variables (non-sensitive)
      # ---------------------------------------------------------------------

      env {
        name  = "PYTHONPATH"
        value = "/app"
      }

      env {
        name  = "PYTHONUNBUFFERED"
        value = "1"
      }

      # LangSmith/Observability
      env {
        name  = "LANGCHAIN_TRACING_V2"
        value = var.langsmith_tracing_enabled ? "true" : "false"
      }

      env {
        name  = "LANGSMITH_PROJECT"
        value = "${var.langsmith_project}-${var.environment}"
      }

      env {
        name  = "LANGSMITH_ENDPOINT"
        value = "https://api.smith.langchain.com"
      }

      # Modal Service URLs
      env {
        name  = "MODAL_EXECUTE_URL"
        value = var.modal_execute_url
      }

      env {
        name  = "MODAL_WRITE_FILE_URL"
        value = var.modal_write_file_url
      }

      env {
        name  = "MODAL_READ_FILE_URL"
        value = var.modal_read_file_url
      }

      env {
        name  = "MODAL_LIST_FILES_URL"
        value = var.modal_list_files_url
      }

      env {
        name  = "MODAL_EXECUTE_COMMAND_URL"
        value = var.modal_execute_command_url
      }

      # Next.js Internal URL (for SSE callbacks)
      env {
        name  = "NEXTJS_INTERNAL_URL"
        value = var.nextjs_internal_url
      }

      # Agent Configuration
      env {
        name  = "MAX_AGENT_ITERATIONS"
        value = "25"
      }

      env {
        name  = "TOOL_TIMEOUT_SECONDS"
        value = "30"
      }

      env {
        name  = "BASH_TIMEOUT_SECONDS"
        value = "60"
      }

      env {
        name  = "ENABLE_PROMPT_CACHING"
        value = "true"
      }

      # ---------------------------------------------------------------------
      # Secret Environment Variables
      # ---------------------------------------------------------------------

      # Database URI (LangGraph expects DATABASE_URI, not DATABASE_URL)
      env {
        name = "DATABASE_URI"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      # Redis URI (LangGraph expects REDIS_URI, not REDIS_URL)
      env {
        name = "REDIS_URI"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_url.secret_id
            version = "latest"
          }
        }
      }

      # Internal API Key (for custom auth middleware)
      env {
        name = "INTERNAL_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.internal_api_key.secret_id
            version = "latest"
          }
        }
      }

      # Anthropic API Key
      env {
        name = "ANTHROPIC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.anthropic_api_key_secret_id
            version = "latest"
          }
        }
      }

      # LangSmith API Key (optional)
      dynamic "env" {
        for_each = var.langsmith_api_key_secret_id != "" ? [1] : []
        content {
          name = "LANGSMITH_API_KEY"
          value_source {
            secret_key_ref {
              secret  = var.langsmith_api_key_secret_id
              version = "latest"
            }
          }
        }
      }

      # Modal Token ID
      env {
        name = "MODAL_TOKEN_ID"
        value_source {
          secret_key_ref {
            secret  = var.modal_token_id_secret_id
            version = "latest"
          }
        }
      }

      # Modal Token Secret
      env {
        name = "MODAL_TOKEN_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.modal_token_secret_secret_id
            version = "latest"
          }
        }
      }

      # ---------------------------------------------------------------------
      # Health Checks
      # ---------------------------------------------------------------------

      startup_probe {
        http_get {
          path = "/ok"
          port = 8000
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 6 # Allow up to 60s for startup
      }

      liveness_probe {
        http_get {
          path = "/ok"
          port = 8000
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    timeout = var.timeout

    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    labels = merge(var.labels, {
      "app"         = "langgraph"
      "component"   = "agents"
      "environment" = var.environment
    })
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_sql_database_instance.langgraph,
    google_redis_instance.langgraph,
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.redis_url,
    google_secret_manager_secret_version.internal_api_key,
    google_secret_manager_secret_iam_member.langgraph_database_url,
    google_secret_manager_secret_iam_member.langgraph_redis_url,
    google_secret_manager_secret_iam_member.langgraph_internal_api_key,
    google_secret_manager_secret_iam_member.langgraph_anthropic,
  ]
}
