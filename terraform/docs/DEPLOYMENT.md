# InterviewLM Deployment Guide

This guide covers deploying InterviewLM infrastructure to GCP using Terraform.

## Prerequisites

### 1. GCP Project Setup

```bash
# Set your project ID
export PROJECT_ID="your-project-id"

# Create project (if needed)
gcloud projects create $PROJECT_ID --name="InterviewLM"

# Set as default
gcloud config set project $PROJECT_ID

# Enable billing (required)
# Link billing account in GCP Console: https://console.cloud.google.com/billing
```

### 2. Install Required Tools

```bash
# Terraform (>= 1.5.0)
brew install terraform  # macOS
# or download from https://www.terraform.io/downloads

# Google Cloud SDK
brew install google-cloud-sdk  # macOS
# or download from https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login
gcloud auth application-default login
```

### 3. Create Terraform State Bucket

```bash
# Create bucket for Terraform state
gcloud storage buckets create "gs://interviewlm-terraform-state-$PROJECT_ID" \
  --location=us-central1 \
  --uniform-bucket-level-access

# Enable versioning for state recovery
gcloud storage buckets update "gs://interviewlm-terraform-state-$PROJECT_ID" \
  --versioning
```

## Deployment Steps

### Step 1: Configure Variables

```bash
cd terraform/environments/dev  # or staging/prod

# Copy example files
cp terraform.tfvars.example terraform.tfvars
cp backend.tfvars.example backend.tfvars

# Edit with your values
vim terraform.tfvars
vim backend.tfvars
```

**Required variables in terraform.tfvars:**
```hcl
project_id = "your-gcp-project-id"
app_image  = "gcr.io/cloudrun/placeholder"  # Update after first image push
```

**Required variables in backend.tfvars:**
```hcl
bucket = "interviewlm-terraform-state-your-project-id"
prefix = "dev"  # or staging/prod
```

### Step 2: Initialize Terraform

```bash
terraform init -backend-config=backend.tfvars
```

### Step 3: Review Plan

```bash
# Generate and review plan
terraform plan -out=tfplan

# Review what will be created
terraform show tfplan
```

### Step 4: Apply Infrastructure

```bash
# Apply the plan
terraform apply tfplan

# Or apply directly (will prompt for confirmation)
terraform apply
```

### Step 5: Populate Secrets

After infrastructure is created, populate secrets with actual values:

```bash
# Get secret IDs from Terraform output
terraform output secrets_to_populate

# Populate each secret
echo -n "your-nextauth-secret" | \
  gcloud secrets versions add interviewlm-dev-nextauth-secret --data-file=-

echo -n "sk-ant-your-api-key" | \
  gcloud secrets versions add interviewlm-dev-anthropic-api-key --data-file=-

echo -n "ak-your-modal-token-id" | \
  gcloud secrets versions add interviewlm-dev-modal-token-id --data-file=-

echo -n "as-your-modal-token-secret" | \
  gcloud secrets versions add interviewlm-dev-modal-token-secret --data-file=-

# Generate a secure NextAuth secret
openssl rand -base64 32 | \
  gcloud secrets versions add interviewlm-dev-nextauth-secret --data-file=-
```

### Step 6: Build and Push Container Image

```bash
# Get Artifact Registry URL
AR_URL=$(terraform output -raw artifact_registry_url)

# Configure Docker for Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build image
docker build -t $AR_URL/app:latest .

# Push image
docker push $AR_URL/app:latest

# Update Terraform with new image
# Edit terraform.tfvars: app_image = "us-central1-docker.pkg.dev/..."
terraform apply
```

### Step 7: Run Database Migrations

```bash
# Get Cloud Run service URL
APP_URL=$(terraform output -raw app_url)

# Option 1: Cloud Run Job (recommended for production)
gcloud run jobs create migrate-db \
  --image=$AR_URL/app:latest \
  --command="npx" \
  --args="prisma,migrate,deploy" \
  --region=us-central1 \
  --execute-now

# Option 2: Connect locally via Cloud SQL Proxy
# Download proxy: https://cloud.google.com/sql/docs/postgres/sql-proxy
cloud-sql-proxy --private-ip \
  $(terraform output -raw database_connection_name) &

DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

### Step 8: Verify Deployment

```bash
# Get application URL
APP_URL=$(terraform output -raw app_url)

# Check health endpoint
curl -s "$APP_URL/api/health"

# Check monitoring dashboard
echo "Dashboard: $(terraform output -raw monitoring_dashboard_url)"
```

## Environment Promotion

### Promoting Dev → Staging

```bash
# 1. Tag the release
git tag v1.0.0-rc1
git push origin v1.0.0-rc1

# 2. Build and push staging image
AR_URL_STAGING=$(cd terraform/environments/staging && terraform output -raw artifact_registry_url)
docker build -t $AR_URL_STAGING/app:v1.0.0-rc1 .
docker push $AR_URL_STAGING/app:v1.0.0-rc1

# 3. Update staging terraform.tfvars
cd terraform/environments/staging
# Edit: app_image = ".../app:v1.0.0-rc1"

# 4. Apply
terraform plan -out=tfplan
terraform apply tfplan
```

### Promoting Staging → Production

```bash
# 1. Create release tag
git tag v1.0.0
git push origin v1.0.0

# 2. Build and push prod image
AR_URL_PROD=$(cd terraform/environments/prod && terraform output -raw artifact_registry_url)
docker build -t $AR_URL_PROD/app:v1.0.0 .
docker push $AR_URL_PROD/app:v1.0.0

# 3. Update prod terraform.tfvars (requires approval)
cd terraform/environments/prod
# Edit: app_image = ".../app:v1.0.0"

# 4. Plan and get approval
terraform plan -out=tfplan
# Share plan with team for review

# 5. Apply (during maintenance window)
terraform apply tfplan
```

## GitHub Actions Setup

### 1. Configure Workload Identity

```bash
# Run from each environment directory
cd terraform/environments/dev
terraform apply -target=module.iam

# Get outputs
terraform output workload_identity_provider
terraform output cicd_service_account
```

### 2. Configure GitHub Repository Variables

In GitHub Settings → Secrets and variables → Actions → Variables:

| Variable | Dev | Staging | Prod |
|----------|-----|---------|------|
| WIF_PROVIDER_* | projects/.../providers/... | ... | ... |
| WIF_SERVICE_ACCOUNT_* | ...@...iam.gserviceaccount.com | ... | ... |
| TF_STATE_BUCKET_* | interviewlm-terraform-state-... | ... | ... |

### 3. Create Environments

In GitHub Settings → Environments:

1. Create `dev`, `staging`, `prod` environments
2. Add required reviewers for `prod`
3. Add deployment branch rules

## Troubleshooting

### Common Issues

**"API not enabled"**
```bash
# APIs are enabled automatically, but may take a few seconds
# Re-run terraform apply
terraform apply
```

**"Quota exceeded"**
```bash
# Check and request quota increase
gcloud compute project-info describe --project=$PROJECT_ID
# Request increase in GCP Console
```

**"Permission denied"**
```bash
# Verify authentication
gcloud auth list

# Check service account permissions
gcloud projects get-iam-policy $PROJECT_ID \
  --filter="bindings.members:serviceAccount:*cloud-run*"
```

**"Private Services Access failed"**
```bash
# May need to wait for VPC peering
# Check status
gcloud services vpc-peerings list --network=interviewlm-dev-vpc
```

**"Cloud Run deployment failed"**
```bash
# Check Cloud Run logs
gcloud run services logs read interviewlm-dev-app --region=us-central1

# Check container logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

### Recovery Procedures

**Restore from Terraform State Backup**
```bash
# List state versions
gcloud storage objects list \
  gs://interviewlm-terraform-state-$PROJECT_ID/dev/default.tfstate \
  --versions

# Restore specific version
gcloud storage cp \
  "gs://interviewlm-terraform-state-$PROJECT_ID/dev/default.tfstate#VERSION" \
  terraform.tfstate
```

**Database Point-in-Time Recovery**
```bash
# List available recovery times
gcloud sql instances describe interviewlm-prod-pg-xxxx \
  --format="get(settings.backupConfiguration)"

# Restore to specific time
gcloud sql instances clone interviewlm-prod-pg-xxxx interviewlm-prod-pg-restored \
  --point-in-time="2024-01-15T10:00:00Z"
```

## Maintenance

### Regular Tasks

**Weekly:**
- Review Cloud Monitoring alerts
- Check for Terraform provider updates
- Review Cloud SQL slow query logs

**Monthly:**
- Review and rotate secrets
- Analyze cost reports
- Test disaster recovery procedures

**Quarterly:**
- Upgrade Terraform version
- Review and update IAM permissions
- Capacity planning review

### Updating Terraform

```bash
# Check current version
terraform version

# Update Terraform
brew upgrade terraform  # macOS

# Update providers
cd terraform/environments/dev
terraform init -upgrade

# Review changes
terraform plan
```

### Scaling Resources

```bash
# Update variables in terraform.tfvars
# Example: increase database tier
# database_tier = "db-custom-4-8192"

# Apply changes
terraform plan -out=tfplan
terraform apply tfplan
```

## Destroying Infrastructure

⚠️ **Warning**: This will delete all resources including data!

```bash
# For dev environment only
cd terraform/environments/dev

# First, disable deletion protection
terraform apply -var="deletion_protection=false"

# Then destroy
terraform destroy

# For staging/prod, require additional confirmation
# Edit main.tf to set deletion_protection = false first
```
