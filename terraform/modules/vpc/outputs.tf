# VPC Module Outputs

output "network_id" {
  description = "VPC network ID"
  value       = google_compute_network.main.id
}

output "network_name" {
  description = "VPC network name"
  value       = google_compute_network.main.name
}

output "network_self_link" {
  description = "VPC network self link"
  value       = google_compute_network.main.self_link
}

output "subnet_id" {
  description = "Main subnet ID"
  value       = google_compute_subnetwork.main.id
}

output "subnet_name" {
  description = "Main subnet name"
  value       = google_compute_subnetwork.main.name
}

output "subnet_self_link" {
  description = "Main subnet self link"
  value       = google_compute_subnetwork.main.self_link
}

output "vpc_connector_id" {
  description = "VPC Access connector ID"
  value       = google_vpc_access_connector.main.id
}

output "vpc_connector_name" {
  description = "VPC Access connector name"
  value       = google_vpc_access_connector.main.name
}

output "private_services_connection" {
  description = "Private services connection for Cloud SQL/Memorystore"
  value       = google_service_networking_connection.private_services.id
}

output "router_name" {
  description = "Cloud Router name"
  value       = google_compute_router.main.name
}

output "nat_name" {
  description = "Cloud NAT name"
  value       = google_compute_router_nat.main.name
}
