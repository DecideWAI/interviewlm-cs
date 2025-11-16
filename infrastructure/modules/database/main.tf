# Get database password from Secrets Manager
data "aws_secretsmanager_secret_version" "database_password" {
  secret_id = var.db_password_secret_arn
}

locals {
  db_credentials = jsondecode(data.aws_secretsmanager_secret_version.database_password.secret_string)
  db_password    = local.db_credentials.password
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-db-subnet-group"
  })
}

# Security Group for RDS
resource "aws_security_group" "database" {
  name        = "${var.project_name}-${var.environment}-db-sg"
  description = "Security group for RDS PostgreSQL ${var.environment}"
  vpc_id      = var.vpc_id

  # Allow PostgreSQL from ECS tasks
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
    description     = "PostgreSQL from ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-db-sg"
  })
}

# DB Parameter Group
resource "aws_db_parameter_group" "postgres" {
  name        = "${var.project_name}-${var.environment}-postgres16"
  family      = "postgres16"
  description = "Custom parameter group for ${var.environment} PostgreSQL 16"

  # Performance tuning
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries > 1s
  }

  tags = var.tags
}

# RDS Instance
resource "aws_db_instance" "postgres" {
  identifier     = "${var.project_name}-${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "16.1"

  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = local.db_password

  # Networking
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false

  # Backup
  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00" # UTC
  copy_tags_to_snapshot   = true
  skip_final_snapshot     = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.project_name}-${var.environment}-final-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Maintenance
  maintenance_window      = "Mon:04:00-Mon:05:00" # UTC
  auto_minor_version_upgrade = true

  # High Availability
  multi_az = var.multi_az

  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.postgres.name

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = var.environment == "production" ? 60 : 0
  monitoring_role_arn             = var.environment == "production" ? aws_iam_role.rds_monitoring[0].arn : null

  # Performance Insights
  performance_insights_enabled    = var.environment == "production" ? true : false
  performance_insights_retention_period = var.environment == "production" ? 7 : null

  # Deletion protection
  deletion_protection = var.deletion_protection

  # Disable public access
  publicly_accessible = false

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-postgres"
  })

  lifecycle {
    prevent_destroy = false # Set to true in production
    ignore_changes = [
      password, # Password managed by Secrets Manager
    ]
  }
}

# IAM Role for Enhanced Monitoring (Production only)
resource "aws_iam_role" "rds_monitoring" {
  count = var.environment == "production" ? 1 : 0

  name = "${var.project_name}-${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  ]

  tags = var.tags
}
