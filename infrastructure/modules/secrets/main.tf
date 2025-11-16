# Random password for database
resource "random_password" "database" {
  length  = 32
  special = true
}

# Random secret for NextAuth
resource "random_password" "nextauth" {
  length  = 32
  special = false
}

# Database Password Secret
resource "aws_secretsmanager_secret" "database_password" {
  name        = "${var.project_name}-${var.environment}/database/password"
  description = "Database password for ${var.environment} environment"

  recovery_window_in_days = var.environment == "production" ? 30 : 7

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-db-password"
  })
}

resource "aws_secretsmanager_secret_version" "database_password" {
  secret_id = aws_secretsmanager_secret.database_password.id

  secret_string = jsonencode({
    username = var.db_username
    password = random_password.database.result
  })
}

# Combined Database Secret (for connection string)
resource "aws_secretsmanager_secret" "database" {
  name        = "${var.project_name}-${var.environment}/database"
  description = "Database credentials for ${var.environment} environment"

  recovery_window_in_days = var.environment == "production" ? 30 : 7

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-database"
  })
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id

  secret_string = jsonencode({
    username = var.db_username
    password = random_password.database.result
    engine   = "postgres"
    port     = 5432
    dbname   = var.project_name
  })
}

# NextAuth Secret
resource "aws_secretsmanager_secret" "nextauth" {
  name        = "${var.project_name}-${var.environment}/nextauth"
  description = "NextAuth.js secrets for ${var.environment} environment"

  recovery_window_in_days = var.environment == "production" ? 30 : 7

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-nextauth"
  })
}

resource "aws_secretsmanager_secret_version" "nextauth" {
  secret_id = aws_secretsmanager_secret.nextauth.id

  secret_string = jsonencode({
    NEXTAUTH_SECRET = random_password.nextauth.result
  })
}

# API Secrets (placeholder - to be filled manually)
resource "aws_secretsmanager_secret" "api_secrets" {
  name        = "${var.project_name}-${var.environment}/api-secrets"
  description = "External API keys for ${var.environment} environment"

  recovery_window_in_days = var.environment == "production" ? 30 : 7

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-api-secrets"
  })
}

resource "aws_secretsmanager_secret_version" "api_secrets" {
  secret_id = aws_secretsmanager_secret.api_secrets.id

  secret_string = jsonencode({
    ANTHROPIC_API_KEY       = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    MODAL_TOKEN_ID          = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    MODAL_TOKEN_SECRET      = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    MODAL_EXECUTE_URL       = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    RESEND_API_KEY          = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    RESEND_FROM_EMAIL       = "noreply@${var.project_name}.com"
    PADDLE_VENDOR_ID        = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    PADDLE_API_KEY          = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    PADDLE_PUBLIC_KEY       = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    PADDLE_WEBHOOK_SECRET   = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    PADDLE_ENVIRONMENT      = var.environment == "production" ? "production" : "sandbox"
    PADDLE_PRODUCT_SINGLE   = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    PADDLE_PRODUCT_MEDIUM   = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    PADDLE_PRODUCT_ENTERPRISE = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    GITHUB_CLIENT_ID        = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    GITHUB_CLIENT_SECRET    = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    GOOGLE_CLIENT_ID        = "PLACEHOLDER_UPDATE_AFTER_APPLY"
    GOOGLE_CLIENT_SECRET    = "PLACEHOLDER_UPDATE_AFTER_APPLY"
  })
}
