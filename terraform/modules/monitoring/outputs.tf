# Monitoring Module Outputs

output "notification_channel_ids" {
  description = "Notification channel IDs"
  value       = [for ch in google_monitoring_notification_channel.email : ch.id]
}

output "uptime_check_id" {
  description = "Uptime check ID"
  value       = var.app_url != "" ? google_monitoring_uptime_check_config.app[0].uptime_check_id : null
}

output "dashboard_id" {
  description = "Dashboard ID"
  value       = google_monitoring_dashboard.main.id
}

output "alert_policy_ids" {
  description = "Alert policy IDs"
  value = {
    high_error_rate   = google_monitoring_alert_policy.high_error_rate.name
    high_latency      = google_monitoring_alert_policy.high_latency.name
    database_high_cpu = var.database_instance_name != "" ? google_monitoring_alert_policy.database_high_cpu[0].name : null
    uptime_failure    = var.app_url != "" ? google_monitoring_alert_policy.uptime_failure[0].name : null
  }
}
