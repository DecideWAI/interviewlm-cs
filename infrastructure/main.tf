locals {
  project_name = var.project_name
  region       = var.aws_region

  # Common tags for all resources
  common_tags = {
    Project    = local.project_name
    ManagedBy  = "Terraform"
    Repository = "DecideWAI/interviewlm-cs"
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Shared VPC and Networking (used by both staging and production)
module "networking" {
  source = "./modules/networking"

  project_name       = local.project_name
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones

  tags = local.common_tags
}

# Shared ECR Repository (optional - can use existing registry)
resource "aws_ecr_repository" "app" {
  name                 = local.project_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-ecr"
  })
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 staging images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["staging"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep last 20 production images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["production"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 3
        description  = "Remove untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

#
# STAGING ENVIRONMENT
#
module "staging" {
  source = "./environments/shared"

  environment  = "staging"
  project_name = local.project_name
  app_url      = var.app_url_staging
  aws_region   = var.aws_region

  # Networking (shared VPC)
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  public_subnet_ids  = module.networking.public_subnet_ids

  # Environment-specific sizing configuration
  config = var.environments["staging"]

  # Database
  db_name     = var.db_name
  db_username = var.db_username

  # Container image
  container_image = var.container_image_staging

  # SSL Certificate (optional for staging)
  ssl_certificate_arn = var.ssl_certificate_arn_staging

  # CORS allowed origins
  allowed_origins = var.allowed_origins_staging

  tags = merge(local.common_tags, {
    Environment = "staging"
  })

  depends_on = [module.networking]
}

#
# PRODUCTION ENVIRONMENT
#
module "production" {
  source = "./environments/shared"

  environment  = "production"
  project_name = local.project_name
  app_url      = var.app_url_production
  aws_region   = var.aws_region

  # Networking (shared VPC)
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  public_subnet_ids  = module.networking.public_subnet_ids

  # Environment-specific sizing configuration
  config = var.environments["production"]

  # Database
  db_name     = var.db_name
  db_username = var.db_username

  # Container image
  container_image = var.container_image_production

  # SSL Certificate
  ssl_certificate_arn = var.ssl_certificate_arn_production

  # CORS allowed origins
  allowed_origins = var.allowed_origins_production

  tags = merge(local.common_tags, {
    Environment = "production"
  })

  depends_on = [module.networking]
}
