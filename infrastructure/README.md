# InterviewLM AWS Infrastructure

This directory contains Terraform configuration for deploying InterviewLM to AWS with **shared networking** infrastructure for cost optimization and **isolated resources** per environment for security and data separation.

## Architecture Overview

### Unified Multi-Environment Design

```
┌─────────────────────────────────────────────────────────┐
│                 SHARED VPC (10.0.0.0/16)                │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Public Subnets (3 AZs)                         │   │
│  │  - Staging ALB                                  │   │
│  │  - Production ALB                               │   │
│  │  - NAT Gateways                                 │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Private Subnets (3 AZs)                        │   │
│  │  ┌───────────────────┐  ┌──────────────────┐   │   │
│  │  │ STAGING ENV       │  │ PRODUCTION ENV   │   │   │
│  │  │ - ECS Tasks (1x)  │  │ - ECS Tasks (2x) │   │   │
│  │  │ - RDS (t4g.micro) │  │ - RDS (t4g.small)│   │   │
│  │  │ - Redis (1 node)  │  │ - Redis (2 nodes)│   │   │
│  │  │ - S3 (isolated)   │  │ - S3 (isolated)  │   │   │
│  │  └───────────────────┘  └──────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Cost Savings vs. Separate VPCs

- **Single VPC**: One set of NAT gateways (~$100/month savings)
- **Shared subnets**: No duplicate networking costs
- **Isolated resources**: Separate databases, caches, storage per environment
- **Staging uses Fargate Spot**: ~70% cost reduction on compute

**Estimated monthly costs:**
- Staging: ~$60-80
- Production: ~$500-800

## Prerequisites

1. **AWS Account** with appropriate credentials
2. **Terraform** >= 1.0
3. **AWS CLI** configured
4. **S3 bucket** for Terraform state (create manually):
   ```bash
   aws s3 mb s3://interviewlm-terraform-state --region us-east-1
   aws dynamodb create-table \
     --table-name terraform-lock \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region us-east-1
   ```

## Quick Start

### 1. Initialize Terraform

```bash
cd infrastructure
terraform init
```

### 2. Create terraform.tfvars

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

Required variables:
- `container_image_staging`: Docker image URI for staging
- `container_image_production`: Docker image URI for production
- (Optional) `ssl_certificate_arn_*`: ACM certificate ARNs for HTTPS

### 3. Plan the deployment

```bash
terraform plan
```

### 4. Deploy both environments

```bash
terraform apply
```

This creates:
- 1 shared VPC with networking (NAT gateways, subnets, route tables)
- Staging environment (small instance sizes, Fargate Spot)
- Production environment (production-grade sizes, Multi-AZ)

### 5. Get outputs

```bash
terraform output
```

You'll get:
- ALB DNS names for staging and production
- Database endpoints
- Redis endpoints
- S3 bucket names
- Secrets ARNs (for updating API keys)

## Deployment Steps

### Step 1: Build and Push Docker Image

First, build your Next.js application and push to ECR:

```bash
# Build Next.js for production
cd /path/to/interviewlm-cs
npm run build

# Create Dockerfile (if not exists)
cat > Dockerfile <<'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY .next ./.next
COPY public ./public
EXPOSE 3000
CMD ["npm", "start"]
EOF

# Get ECR login
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t interviewlm:staging .
docker tag interviewlm:staging <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/interviewlm:staging
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/interviewlm:staging
```

### Step 2: Update Secrets

After initial `terraform apply`, update the API secrets in AWS Secrets Manager:

```bash
# Get the secrets ARN
SECRETS_ARN=$(terraform output -raw staging_api_secrets_arn)

# Update secrets with actual values
aws secretsmanager update-secret \
  --secret-id $SECRETS_ARN \
  --secret-string '{
    "NEXTAUTH_SECRET": "your-actual-secret-here",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "MODAL_TOKEN_ID": "ak-...",
    "MODAL_TOKEN_SECRET": "as-...",
    "GITHUB_CLIENT_ID": "...",
    "GITHUB_CLIENT_SECRET": "...",
    "GOOGLE_CLIENT_ID": "...",
    "GOOGLE_CLIENT_SECRET": "..."
  }'

# Restart ECS tasks to pick up new secrets
aws ecs update-service \
  --cluster interviewlm-staging \
  --service interviewlm-staging \
  --force-new-deployment
```

Repeat for production secrets.

### Step 3: Database Migration

Run Prisma migrations on both databases:

```bash
# Get database connection string
DB_URL=$(terraform output -raw staging_db_connection_string)

# Run migrations
DATABASE_URL="$DB_URL" npx prisma migrate deploy

# Seed initial data (if needed)
DATABASE_URL="$DB_URL" npx prisma db seed
```

### Step 4: Configure DNS (Optional)

If you have custom domains:

```bash
# Get ALB DNS names
STAGING_ALB=$(terraform output -raw staging_alb_dns_name)
PRODUCTION_ALB=$(terraform output -raw production_alb_dns_name)

# Create CNAME records in your DNS provider
# staging.interviewlm.com -> $STAGING_ALB
# interviewlm.com -> $PRODUCTION_ALB
```

### Step 5: Request SSL Certificates (Optional)

```bash
# Request certificate in ACM
aws acm request-certificate \
  --domain-name interviewlm.com \
  --subject-alternative-names www.interviewlm.com \
  --validation-method DNS \
  --region us-east-1

# Get validation CNAME records
aws acm describe-certificate --certificate-arn <ARN>

# Add validation records to your DNS
# Wait for validation to complete

# Update terraform.tfvars with certificate ARN
# terraform apply to update ALB with HTTPS listener
```

## Module Structure

```
infrastructure/
├── main.tf                   # Root configuration (calls both environments)
├── variables.tf              # Input variables with staging/prod configs
├── outputs.tf                # Outputs from both environments
├── terraform.tf              # Provider and backend configuration
│
├── modules/
│   ├── networking/           # Shared VPC, subnets, NAT gateways
│   ├── secrets/              # Secrets Manager for passwords & API keys
│   ├── database/             # RDS PostgreSQL (isolated per env)
│   ├── cache/                # ElastiCache Redis (isolated per env)
│   ├── storage/              # S3 buckets (isolated per env)
│   └── compute/              # ECS Fargate, ALB (isolated per env)
│
└── environments/
    └── shared/               # Environment wrapper (calls all modules)
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

## Environment Sizing

### Staging (Cost-Optimized)

- **Database**: db.t4g.micro (20 GB, single-AZ)
- **Cache**: cache.t4g.micro (1 node, no encryption)
- **Compute**: 256 CPU / 512 MB RAM (Fargate Spot, 1 task)
- **Storage**: S3 with 90-day retention
- **Cost**: ~$60-80/month

### Production (High Availability)

- **Database**: db.t4g.small (100 GB, Multi-AZ)
- **Cache**: cache.t4g.small (2 nodes, encrypted, persistent)
- **Compute**: 512 CPU / 1024 MB RAM (Fargate, 2+ tasks, auto-scaling)
- **Storage**: S3 with versioning, 365-day retention
- **Cost**: ~$500-800/month

## Key Features

### Security
- ✅ All databases in private subnets (no public access)
- ✅ Security groups restrict access between services
- ✅ Secrets Manager for sensitive credentials
- ✅ KMS encryption for S3 and RDS
- ✅ ECR image scanning on push
- ✅ Production Redis uses encryption in transit

### High Availability
- ✅ Multi-AZ deployment for production RDS and Redis
- ✅ Application Load Balancer across 3 availability zones
- ✅ Auto-scaling based on CPU and memory
- ✅ Health checks with automatic task replacement

### Monitoring
- ✅ CloudWatch logs with configurable retention
- ✅ Container Insights (production only)
- ✅ CloudWatch alarms for CPU, memory, errors
- ✅ ECS Exec for debugging (staging only)

### Cost Optimization
- ✅ Fargate Spot for staging (70% cheaper)
- ✅ S3 lifecycle policies (transition to Glacier)
- ✅ Smaller instance sizes for staging
- ✅ Shared NAT gateways and VPC
- ✅ ECR lifecycle policies to clean old images

## Outputs

After deployment, Terraform provides:

```hcl
# Staging
staging_app_url               # Application URL
staging_alb_dns_name          # ALB DNS (for Route53 CNAME)
staging_db_endpoint           # PostgreSQL endpoint
staging_redis_endpoint        # Redis endpoint
staging_recordings_bucket     # S3 bucket for recordings
staging_api_secrets_arn       # Secrets Manager ARN

# Production
production_app_url
production_alb_dns_name
production_db_endpoint
production_redis_endpoint
production_recordings_bucket
production_api_secrets_arn

# Networking
vpc_id                        # Shared VPC ID
ecr_repository_url            # Docker image repository
```

## Common Operations

### Update Container Image

```bash
# Push new image
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/interviewlm:staging

# Force ECS to pull new image
aws ecs update-service \
  --cluster interviewlm-staging \
  --service interviewlm-staging \
  --force-new-deployment
```

### Scale ECS Tasks

```bash
# Temporary manual scaling
aws ecs update-service \
  --cluster interviewlm-production \
  --service interviewlm-production \
  --desired-count 5

# Or update terraform.tfvars and apply
```

### View Logs

```bash
# Stream ECS task logs
aws logs tail /ecs/interviewlm-staging --follow

# View specific error
aws logs filter-pattern /ecs/interviewlm-staging "ERROR"
```

### Connect to Database

```bash
# Get connection details
DB_ENDPOINT=$(terraform output -raw staging_db_endpoint)
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $(terraform output -raw staging_database_password_secret_arn) \
  --query SecretString --output text)

# Connect via psql (from ECS task or bastion)
psql "postgresql://interviewlm_admin:$DB_PASSWORD@$DB_ENDPOINT:5432/interviewlm"
```

### Destroy Infrastructure

**WARNING**: This deletes all data! Use with caution.

```bash
# Destroy staging only (not possible - need to comment out in main.tf)
# Destroy everything
terraform destroy

# If deletion protection is enabled, first disable it
terraform apply -var 'environments.production.enable_deletion_protection=false'
terraform destroy
```

## Troubleshooting

### ECS Tasks Not Starting

Check:
1. Container image exists in ECR
2. Secrets are populated in Secrets Manager
3. Security groups allow communication
4. CloudWatch logs for error messages

```bash
aws ecs describe-services --cluster interviewlm-staging --services interviewlm-staging
aws logs tail /ecs/interviewlm-staging --since 10m
```

### Database Connection Errors

Check:
1. Security group allows ECS security group on port 5432
2. Database is in `available` state
3. Connection string is correct

```bash
aws rds describe-db-instances --db-instance-identifier interviewlm-staging-postgres
```

### High Costs

Check:
1. NAT Gateway data transfer (~$0.045/GB)
2. RDS storage and backups
3. CloudWatch logs retention
4. S3 storage class transitions

```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

## Next Steps

1. ✅ Deploy staging environment
2. ✅ Test application end-to-end
3. ✅ Update API secrets in Secrets Manager
4. ✅ Run database migrations
5. ✅ Deploy production environment
6. ⏳ Set up custom domains and SSL certificates
7. ⏳ Configure Route53 for DNS
8. ⏳ Set up CloudWatch dashboards
9. ⏳ Configure SNS topics for alarms
10. ⏳ Set up CI/CD pipeline (GitHub Actions)

## Support

For questions or issues:
- Review Terraform docs: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- Check AWS service limits
- Review CloudWatch logs and alarms
- Contact AWS support if needed

---

**Last Updated**: 2024-11-15
**Terraform Version**: >= 1.0
**AWS Provider Version**: >= 5.0
