# Load Balancer Module - Global HTTP(S) Load Balancer for Cloud Run
# Provides: External Application Load Balancer with Cloud Armor protection
#
# Architecture:
#   Cloudflare -> Load Balancer -> Cloud Armor (CF IPs only) -> Cloud Run
#
# This module creates:
#   - Static external IP address
#   - Serverless Network Endpoint Group (NEG) for Cloud Run
#   - Backend service with Cloud Armor policy
#   - URL map and HTTPS proxy
#   - Managed SSL certificate
#   - HTTPS and HTTP (redirect) forwarding rules

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
  }
}

# -----------------------------------------------------------------------------
# Static External IP Address
# -----------------------------------------------------------------------------

resource "google_compute_global_address" "lb" {
  name         = "${var.name_prefix}-lb-ip"
  project      = var.project_id
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
}

# -----------------------------------------------------------------------------
# Serverless Network Endpoint Group (NEG)
# Connects Load Balancer to Cloud Run service
# -----------------------------------------------------------------------------

resource "google_compute_region_network_endpoint_group" "cloudrun_neg" {
  name                  = "${var.name_prefix}-cloudrun-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.cloud_run_service_name
  }
}

# -----------------------------------------------------------------------------
# Backend Service
# Routes traffic to Cloud Run via NEG, protected by Cloud Armor
# -----------------------------------------------------------------------------

resource "google_compute_backend_service" "app" {
  name                  = "${var.name_prefix}-backend"
  project               = var.project_id
  protocol              = "HTTP"
  port_name             = "http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  # Note: timeout_sec is not supported for serverless NEG backends

  # Attach Cloud Armor security policy
  security_policy = google_compute_security_policy.cloudflare_only.id

  backend {
    group = google_compute_region_network_endpoint_group.cloudrun_neg.id
  }

  # Enable Cloud CDN for caching static assets (optional, can be disabled)
  enable_cdn = var.enable_cdn

  dynamic "cdn_policy" {
    for_each = var.enable_cdn ? [1] : []
    content {
      cache_mode                   = "CACHE_ALL_STATIC"
      default_ttl                  = 3600
      max_ttl                      = 86400
      client_ttl                   = 3600
      negative_caching             = true
      serve_while_stale            = 86400
      signed_url_cache_max_age_sec = 0
    }
  }

  log_config {
    enable      = true
    sample_rate = var.log_sample_rate
  }
}

# -----------------------------------------------------------------------------
# URL Map
# Routes all traffic to the backend service
# -----------------------------------------------------------------------------

resource "google_compute_url_map" "app" {
  name            = "${var.name_prefix}-url-map"
  project         = var.project_id
  default_service = google_compute_backend_service.app.id

  # Add path-based routing if needed in the future
  # host_rule { ... }
  # path_matcher { ... }
}

# -----------------------------------------------------------------------------
# Managed SSL Certificate
# Google-managed certificate for the custom domain
# -----------------------------------------------------------------------------

resource "google_compute_managed_ssl_certificate" "app" {
  name    = "${var.name_prefix}-ssl-cert"
  project = var.project_id

  managed {
    domains = var.ssl_domains
  }

  lifecycle {
    create_before_destroy = true
  }
}

# -----------------------------------------------------------------------------
# HTTPS Proxy
# Terminates SSL and forwards to URL map
# -----------------------------------------------------------------------------

resource "google_compute_target_https_proxy" "app" {
  name             = "${var.name_prefix}-https-proxy"
  project          = var.project_id
  url_map          = google_compute_url_map.app.id
  ssl_certificates = [google_compute_managed_ssl_certificate.app.id]

  # Enable QUIC for faster connections (optional)
  quic_override = var.enable_quic ? "ENABLE" : "NONE"
}

# -----------------------------------------------------------------------------
# HTTPS Forwarding Rule
# Listens on port 443 and forwards to HTTPS proxy
# -----------------------------------------------------------------------------

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${var.name_prefix}-https-rule"
  project               = var.project_id
  ip_address            = google_compute_global_address.lb.address
  ip_protocol           = "TCP"
  port_range            = "443"
  target                = google_compute_target_https_proxy.app.id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  labels = var.labels
}

# -----------------------------------------------------------------------------
# HTTP-to-HTTPS Redirect
# Redirects all HTTP traffic to HTTPS
# -----------------------------------------------------------------------------

resource "google_compute_url_map" "http_redirect" {
  name    = "${var.name_prefix}-http-redirect"
  project = var.project_id

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "${var.name_prefix}-http-proxy"
  project = var.project_id
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${var.name_prefix}-http-rule"
  project               = var.project_id
  ip_address            = google_compute_global_address.lb.address
  ip_protocol           = "TCP"
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  labels = var.labels
}
