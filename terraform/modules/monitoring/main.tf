# Monitoring Module - Cloud Monitoring
# Provides: Alerting policies, uptime checks, and notification channels

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
# Notification Channels
# -----------------------------------------------------------------------------

# Email notification channel
resource "google_monitoring_notification_channel" "email" {
  for_each = toset(var.alert_email_addresses)

  project      = var.project_id
  display_name = "Email: ${each.value}"
  type         = "email"

  labels = {
    email_address = each.value
  }

  user_labels = merge(var.labels, {
    "environment" = var.environment
  })
}

# Slack notification channel (optional)
resource "google_monitoring_notification_channel" "slack" {
  count = var.slack_webhook_url != "" ? 1 : 0

  project      = var.project_id
  display_name = "Slack: ${var.name_prefix}"
  type         = "slack"

  labels = {
    channel_name = var.slack_channel_name
  }

  sensitive_labels {
    auth_token = var.slack_auth_token
  }

  user_labels = merge(var.labels, {
    "environment" = var.environment
  })
}

# -----------------------------------------------------------------------------
# Uptime Checks
# -----------------------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "app" {
  count = var.app_url != "" ? 1 : 0

  project      = var.project_id
  display_name = "${var.name_prefix}-app-uptime"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/api/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_value = 200
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(var.app_url, "https://", "")
    }
  }

  checker_type = "STATIC_IP_CHECKERS"

  selected_regions = [
    "USA",
    "EUROPE",
    "ASIA_PACIFIC"
  ]

  content_matchers {
    content = "ok"
    matcher = "CONTAINS_STRING"
  }
}

# -----------------------------------------------------------------------------
# Alert Policies
# -----------------------------------------------------------------------------

# High error rate alert
resource "google_monitoring_alert_policy" "high_error_rate" {
  project      = var.project_id
  display_name = "${var.name_prefix} - High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run Error Rate > ${var.error_rate_threshold}%"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [for ch in google_monitoring_notification_channel.email : ch.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "High error rate detected on Cloud Run service. Check logs for details."
    mime_type = "text/markdown"
  }

  user_labels = var.labels

  enabled = var.alerts_enabled
}

# High latency alert
resource "google_monitoring_alert_policy" "high_latency" {
  project      = var.project_id
  display_name = "${var.name_prefix} - High Latency"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run P99 Latency > ${var.latency_threshold_ms}ms"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.latency_threshold_ms

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.label.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [for ch in google_monitoring_notification_channel.email : ch.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "High latency detected. P99 response time exceeds ${var.latency_threshold_ms}ms."
    mime_type = "text/markdown"
  }

  user_labels = var.labels

  enabled = var.alerts_enabled
}

# Cloud SQL high CPU alert
resource "google_monitoring_alert_policy" "database_high_cpu" {
  count = var.enable_database_monitoring ? 1 : 0

  project      = var.project_id
  display_name = "${var.name_prefix} - Database High CPU"
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL CPU > ${var.database_cpu_threshold}%"

    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.database_cpu_threshold / 100

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_NONE"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [for ch in google_monitoring_notification_channel.email : ch.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Database CPU utilization is high. Consider scaling up the instance."
    mime_type = "text/markdown"
  }

  user_labels = var.labels

  enabled = var.alerts_enabled
}

# Uptime check failure alert
resource "google_monitoring_alert_policy" "uptime_failure" {
  count = var.app_url != "" ? 1 : 0

  project      = var.project_id
  display_name = "${var.name_prefix} - Uptime Check Failed"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failed for ${var.app_url}"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\""
      duration        = "60s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }

      trigger {
        count = 2
      }
    }
  }

  notification_channels = [for ch in google_monitoring_notification_channel.email : ch.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Application is down! Uptime check failed from multiple regions."
    mime_type = "text/markdown"
  }

  user_labels = var.labels

  enabled = var.alerts_enabled
}

# Log-based metric for failed jobs
resource "google_logging_metric" "failed_jobs" {
  project     = var.project_id
  name        = "${var.name_prefix}-failed-jobs"
  description = "Count of failed background jobs (BullMQ)"

  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name=~".*worker.*"
    jsonPayload.message=~"failed|error|Error processing job"
    severity>=ERROR
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key         = "queue_name"
      value_type  = "STRING"
      description = "Name of the queue"
    }
  }

  label_extractors = {
    "queue_name" = "REGEXP_EXTRACT(jsonPayload.queue, \"(.*)\")"
  }
}

# Alert for high failed job count
resource "google_monitoring_alert_policy" "failed_jobs" {
  project      = var.project_id
  display_name = "${var.name_prefix} - High Failed Job Count"
  combiner     = "OR"

  conditions {
    display_name = "Failed jobs > ${var.failed_jobs_threshold}"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.failed_jobs.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.failed_jobs_threshold

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [for ch in google_monitoring_notification_channel.email : ch.id]

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = "High number of failed background jobs detected. Check the DLQ at /api/admin/dlq for details."
    mime_type = "text/markdown"
  }

  user_labels = var.labels

  enabled = var.alerts_enabled
}

# -----------------------------------------------------------------------------
# Dashboard
# -----------------------------------------------------------------------------

resource "google_monitoring_dashboard" "main" {
  project = var.project_id
  dashboard_json = jsonencode({
    displayName = "${var.name_prefix} - Overview"
    gridLayout = {
      columns = 2
      widgets = [
        {
          title = "Cloud Run Request Count"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_RATE"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["resource.label.service_name"]
                  }
                }
              }
            }]
          }
        },
        {
          title = "Cloud Run Latency (P50, P95, P99)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_PERCENTILE_50"
                    }
                  }
                }
                legendTemplate = "P50"
              },
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_PERCENTILE_95"
                    }
                  }
                }
                legendTemplate = "P95"
              },
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_PERCENTILE_99"
                    }
                  }
                }
                legendTemplate = "P99"
              }
            ]
          }
        },
        {
          title = "Cloud SQL CPU Utilization"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Redis Memory Usage"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"redis_instance\" AND metric.type = \"redis.googleapis.com/stats/memory/usage_ratio\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        }
      ]
    }
  })
}
