# Cloud Run Module - Application and Worker services
# Provides: Cloud Run services for Next.js app and background workers

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
# Main Application Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "app" {
  name     = "${var.name_prefix}-app"
  location = var.region
  project  = var.project_id

  # Security: Control ingress traffic source
  # Use INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING for Cloudflare/LB setup
  ingress = var.ingress

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.app_min_instances
      max_instance_count = var.app_max_instances
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.app_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.app_cpu
          memory = var.app_memory
        }
        cpu_idle          = var.environment != "prod"
        startup_cpu_boost = true
      }

      # Environment variables (non-sensitive)
      dynamic "env" {
        for_each = var.app_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      # Secret environment variables
      dynamic "env" {
        for_each = var.app_secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    timeout = "300s"

    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    labels = merge(var.labels, {
      "app"         = "interviewlm"
      "component"   = "web"
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

  depends_on = [var.depends_on_resources]
}

# -----------------------------------------------------------------------------
# Worker Service (Background Jobs)
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "worker" {
  count = var.enable_workers ? 1 : 0

  name     = "${var.name_prefix}-worker"
  location = var.region
  project  = var.project_id

  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.worker_min_instances
      max_instance_count = var.worker_max_instances
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "ALL_TRAFFIC"
    }

    containers {
      image = var.worker_image != "" ? var.worker_image : var.app_image

      # Workers run via npm run workers command
      command = ["npm", "run", "workers"]

      resources {
        limits = {
          cpu    = var.worker_cpu
          memory = var.worker_memory
        }
        cpu_idle          = false # Workers need consistent CPU
        startup_cpu_boost = true
      }

      # Environment variables (non-sensitive)
      dynamic "env" {
        for_each = var.app_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      # Secret environment variables
      dynamic "env" {
        for_each = var.app_secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 5
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 60
        failure_threshold     = 3
      }
    }

    timeout = "3600s" # 1 hour for long-running jobs

    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    labels = merge(var.labels, {
      "app"         = "interviewlm"
      "component"   = "worker"
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

  depends_on = [var.depends_on_resources]
}

# -----------------------------------------------------------------------------
# IAM - Public access for main app
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service_iam_member" "app_public" {
  count = var.allow_public_access ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -----------------------------------------------------------------------------
# Custom Domain Mapping (Optional)
# -----------------------------------------------------------------------------

resource "google_cloud_run_domain_mapping" "app" {
  count = var.custom_domain != "" ? 1 : 0

  location = var.region
  name     = var.custom_domain
  project  = var.project_id

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.app.name
  }
}
