terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state backend - update with your S3 bucket
  backend "s3" {
    bucket         = "interviewlm-terraform-state"
    key            = "shared/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "interviewlm"
      ManagedBy   = "Terraform"
      Repository  = "DecideWAI/interviewlm-cs"
      Environment = "shared"
    }
  }
}
