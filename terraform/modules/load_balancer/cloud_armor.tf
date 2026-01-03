# Cloud Armor Security Policy
# Restricts access to only Cloudflare IP ranges
#
# IP ranges sourced from: https://www.cloudflare.com/ips/
# Last updated: 2025-01-02
#
# Note: Cloudflare IP ranges rarely change, but should be reviewed periodically.
# Subscribe to Cloudflare updates: https://www.cloudflare.com/ips/

# -----------------------------------------------------------------------------
# Cloudflare IP Ranges (Local Variables)
# -----------------------------------------------------------------------------

locals {
  # Cloudflare IPv4 ranges - Split into groups of 10 (Cloud Armor limit)
  # Source: https://www.cloudflare.com/ips-v4
  cloudflare_ipv4_ranges_1 = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
  ]

  cloudflare_ipv4_ranges_2 = [
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]

  # Cloudflare IPv6 ranges
  # Source: https://www.cloudflare.com/ips-v6
  cloudflare_ipv6_ranges = [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ]
}

# -----------------------------------------------------------------------------
# Cloud Armor Security Policy
# -----------------------------------------------------------------------------

resource "google_compute_security_policy" "cloudflare_only" {
  name        = "${var.name_prefix}-cloudflare-only"
  project     = var.project_id
  description = "Allow traffic only from Cloudflare IP ranges"
  type        = "CLOUD_ARMOR"

  # -------------------------------------------------------------------------
  # Rule 1000: Allow Cloudflare IPv4 ranges (Part 1)
  # -------------------------------------------------------------------------
  rule {
    action   = "allow"
    priority = 1000

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = local.cloudflare_ipv4_ranges_1
      }
    }

    description = "Allow Cloudflare IPv4 ranges (Part 1)"
  }

  # -------------------------------------------------------------------------
  # Rule 1001: Allow Cloudflare IPv4 ranges (Part 2)
  # -------------------------------------------------------------------------
  rule {
    action   = "allow"
    priority = 1001

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = local.cloudflare_ipv4_ranges_2
      }
    }

    description = "Allow Cloudflare IPv4 ranges (Part 2)"
  }

  # -------------------------------------------------------------------------
  # Rule 1002: Allow Cloudflare IPv6 ranges
  # -------------------------------------------------------------------------
  rule {
    action   = "allow"
    priority = 1002

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = local.cloudflare_ipv6_ranges
      }
    }

    description = "Allow Cloudflare IPv6 ranges"
  }

  # -------------------------------------------------------------------------
  # Rule 2000: Allow health check probes (Google health checkers)
  # These IPs are used by Google's health check system
  # -------------------------------------------------------------------------
  rule {
    action   = "allow"
    priority = 2000

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = [
          "35.191.0.0/16",  # Google health checkers
          "130.211.0.0/22", # Google health checkers
        ]
      }
    }

    description = "Allow Google health check probes"
  }

  # -------------------------------------------------------------------------
  # Default Rule: Deny all other traffic
  # Priority 2147483647 is the lowest priority (default deny)
  # -------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = 2147483647

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    description = "Default deny - block all non-Cloudflare traffic"
  }

  # -------------------------------------------------------------------------
  # Adaptive Protection (DDoS mitigation)
  # -------------------------------------------------------------------------
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable          = var.enable_ddos_protection
      rule_visibility = "STANDARD"
    }
  }

  # -------------------------------------------------------------------------
  # Advanced Options (Rate Limiting, etc.)
  # These can be enabled if needed in the future
  # -------------------------------------------------------------------------

  # Uncomment to add rate limiting:
  # rule {
  #   action   = "throttle"
  #   priority = 500
  #   match {
  #     versioned_expr = "SRC_IPS_V1"
  #     config {
  #       src_ip_ranges = ["*"]
  #     }
  #   }
  #   rate_limit_options {
  #     conform_action = "allow"
  #     exceed_action  = "deny(429)"
  #     rate_limit_threshold {
  #       count        = 1000
  #       interval_sec = 60
  #     }
  #   }
  #   description = "Rate limit: 1000 requests per minute per IP"
  # }
}
