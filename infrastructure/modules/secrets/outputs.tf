output "database_password" {
  description = "Generated database password"
  value       = random_password.database.result
  sensitive   = true
}

output "database_password_secret_arn" {
  description = "ARN of the database password secret"
  value       = aws_secretsmanager_secret.database_password.arn
}

output "database_secret_arn" {
  description = "ARN of the combined database secret"
  value       = aws_secretsmanager_secret.database.arn
}

output "nextauth_secret_arn" {
  description = "ARN of the NextAuth secret"
  value       = aws_secretsmanager_secret.nextauth.arn
}

output "api_secrets_arn" {
  description = "ARN of the API secrets"
  value       = aws_secretsmanager_secret.api_secrets.arn
}

output "nextauth_secret" {
  description = "Generated NextAuth secret"
  value       = random_password.nextauth.result
  sensitive   = true
}
