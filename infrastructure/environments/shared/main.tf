locals {
  name_prefix = "${var.project_name}-${var.environment}"

  environment_tags = merge(var.tags, {
    Environment = var.environment
  })
}

# Secrets Module (Database passwords, API keys)
module "secrets" {
  source = "../../modules/secrets"

  project_name = var.project_name
  environment  = var.environment
  db_username  = var.db_username

  tags = local.environment_tags
}

# Storage Module (S3 for session recordings and uploads)
module "storage" {
  source = "../../modules/storage"

  project_name = var.project_name
  environment  = var.environment

  # Storage configuration
  enable_versioning        = var.config.enable_s3_versioning
  recordings_retention_days = var.config.recordings_retention_days
  allowed_origins          = var.allowed_origins

  tags = local.environment_tags
}

# Compute Module (ECS Fargate)
module "compute" {
  source = "../../modules/compute"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = var.vpc_id
  private_subnet_ids = var.private_subnet_ids
  public_subnet_ids  = var.public_subnet_ids

  # ECS configuration
  task_cpu                  = var.config.ecs_task_cpu
  task_memory               = var.config.ecs_task_memory
  desired_count             = var.config.ecs_desired_count
  min_capacity              = var.config.ecs_min_capacity
  max_capacity              = var.config.ecs_max_capacity
  cpu_target_value          = var.config.ecs_cpu_target_value
  memory_target_value       = var.config.ecs_memory_target_value
  use_fargate_spot          = var.config.use_fargate_spot
  enable_container_insights = var.config.enable_container_insights
  enable_ecs_exec           = var.config.enable_ecs_exec
  enable_deletion_protection = var.config.enable_deletion_protection
  log_retention_days        = var.config.log_retention_days

  # Container image
  container_image = var.container_image

  # SSL certificate
  ssl_certificate_arn = var.ssl_certificate_arn

  # Application configuration
  app_url             = var.app_url
  aws_region          = var.aws_region
  s3_recordings_bucket = module.storage.recordings_bucket_id
  s3_uploads_bucket   = module.storage.uploads_bucket_id

  # Secrets
  api_secrets_arn        = module.secrets.api_secrets_arn
  db_password_secret_arn = module.secrets.database_password_secret_arn
  redis_auth_secret_arn  = null  # Will be set by cache module if encryption enabled

  # Database connection (will be set after database module is created)
  database_url = module.database.connection_string

  # Redis connection (will be set after cache module is created)
  redis_url = module.cache.connection_string

  # S3 access policy
  s3_access_policy_arn = module.storage.s3_access_policy_arn

  tags = local.environment_tags

  depends_on = [
    module.database,
    module.cache,
    module.storage,
    module.secrets
  ]
}

# Database Module (RDS PostgreSQL)
module "database" {
  source = "../../modules/database"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = var.vpc_id
  subnet_ids   = var.private_subnet_ids

  # Database configuration
  db_name                 = var.db_name
  db_username             = var.db_username
  db_password_secret_arn  = module.secrets.database_password_secret_arn
  instance_class          = var.config.db_instance_class
  allocated_storage       = var.config.db_allocated_storage
  max_allocated_storage   = var.config.db_max_allocated_storage
  backup_retention_period = var.config.db_backup_retention_days
  multi_az                = var.config.db_multi_az
  skip_final_snapshot     = var.config.db_skip_final_snapshot
  deletion_protection     = var.config.enable_deletion_protection

  # Security groups (allow access from ECS tasks)
  allowed_security_group_ids = [module.compute.ecs_security_group_id]

  tags = local.environment_tags

  depends_on = [module.compute]
}

# Cache Module (ElastiCache Redis)
module "cache" {
  source = "../../modules/cache"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = var.vpc_id
  subnet_ids   = var.private_subnet_ids

  # Cache configuration
  node_type                   = var.config.redis_node_type
  num_cache_nodes             = var.config.redis_num_cache_nodes
  engine_version              = var.config.redis_engine_version
  parameter_group_family      = var.config.redis_parameter_group_family
  transit_encryption_enabled  = var.config.redis_encryption_in_transit
  persistence_enabled         = var.config.redis_persistence_enabled
  snapshot_retention_limit    = var.config.redis_snapshot_retention_days

  # Security groups (allow access from ECS tasks)
  allowed_security_group_ids = [module.compute.ecs_security_group_id]

  tags = local.environment_tags

  depends_on = [module.compute]
}
