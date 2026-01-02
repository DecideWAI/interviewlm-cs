# Load Balancer Module Outputs

output "load_balancer_ip" {
  description = "The external IP address of the load balancer"
  value       = google_compute_global_address.lb.address
}

output "load_balancer_ip_name" {
  description = "The name of the reserved IP address resource"
  value       = google_compute_global_address.lb.name
}

output "ssl_certificate_id" {
  description = "The ID of the managed SSL certificate"
  value       = google_compute_managed_ssl_certificate.app.id
}

output "ssl_certificate_name" {
  description = "The name of the managed SSL certificate"
  value       = google_compute_managed_ssl_certificate.app.name
}

output "ssl_certificate_domains" {
  description = "The domains covered by the SSL certificate"
  value       = google_compute_managed_ssl_certificate.app.managed[0].domains
}

output "backend_service_id" {
  description = "The ID of the backend service"
  value       = google_compute_backend_service.app.id
}

output "security_policy_id" {
  description = "The ID of the Cloud Armor security policy"
  value       = google_compute_security_policy.cloudflare_only.id
}

output "security_policy_name" {
  description = "The name of the Cloud Armor security policy"
  value       = google_compute_security_policy.cloudflare_only.name
}

output "neg_id" {
  description = "The ID of the serverless network endpoint group"
  value       = google_compute_region_network_endpoint_group.cloudrun_neg.id
}

output "url_map_id" {
  description = "The ID of the URL map"
  value       = google_compute_url_map.app.id
}

# Helpful output for DNS configuration
output "dns_instructions" {
  description = "Instructions for configuring DNS in Cloudflare"
  value       = <<-EOT
    Configure your DNS in Cloudflare Dashboard:

    1. Go to your domain's DNS settings
    2. Create/update an A record:
       - Name: @ (or your subdomain)
       - Content: ${google_compute_global_address.lb.address}
       - Proxy status: Proxied (orange cloud)
       - TTL: Auto

    3. SSL/TLS settings:
       - Mode: Full (strict)
       - Always Use HTTPS: On

    Note: SSL certificate provisioning may take 15-60 minutes.
  EOT
}
