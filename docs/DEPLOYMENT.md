# InterviewLM Deployment Guide

This document covers the deployment process for InterviewLM to Google Cloud Platform (GCP).

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Initial Setup (First-Time Deployment)](#initial-setup-first-time-deployment)
- [Routine Deployments](#routine-deployments)
- [CI/CD with GitHub Actions](#cicd-with-github-actions)
- [Environment Configuration](#environment-configuration)
- [Database Migrations](#database-migrations)
- [Monitoring & Troubleshooting](#monitoring--troubleshooting)
- [Rollback Procedures](#rollback-procedures)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Google Cloud Platform                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Cloud Run   │    │  Cloud Run   │    │   Cloud      │       │
│  │    (App)     │    │  (Workers)   │    │   Build      │       │
│  │  Next.js     │    │  BullMQ      │    │              │       │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘       │
│         │                   │                                    │
│         └─────────┬─────────┘                                    │
│                   │                                              │
│         ┌─────────▼─────────┐                                    │
│         │   VPC Connector   │                                    │
│         └─────────┬─────────┘                                    │
│                   │                                              │
│    ┌──────────────┼──────────────┐                              │
│    │              │              │                              │
│    ▼              ▼              ▼                              │
│ ┌──────┐    ┌──────────┐   ┌──────────┐                        │
│ │Cloud │    │Memorystore│   │  Secret  │                        │
│ │ SQL  │    │  Redis   │   │ Manager  │                        │
│ └──────┘    └──────────┘   └──────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Services

| Service | Purpose | Scaling |
|---------|---------|---------|
| **Cloud Run (App)** | Next.js web application | 0-10 instances (auto) |
| **Cloud Run (Workers)** | BullMQ background jobs | 1-3 instances |
| **Cloud SQL** | PostgreSQL database | db-g1-small (single zone) |
| **Memorystore** | Redis for queues/caching | 1GB Basic tier |
| **Secret Manager** | API keys and secrets | N/A |
| **Artifact Registry** | Docker images | N/A |

---

## Prerequisites

### Required Tools

```bash
# Google Cloud CLI
brew install google-cloud-sdk

# Terraform
brew install terraform

# Docker (for local builds)
brew install docker

# Node.js 18+
brew install node@18
```

### GCP Authentication

```bash
# Login to GCP
gcloud auth login

# Set project
gcloud config set project interviewlm-480415

# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

## Initial Setup (First-Time Deployment)

This was completed on 2026-01-01. Only needed if setting up a new environment.

### 1. Enable Required APIs

```bash
gcloud services enable \
  compute.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  servicenetworking.googleapis.com \
  vpcaccess.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudtrace.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com
```

### 2. Create Terraform State Bucket

```bash
gsutil mb -l us-central1 gs://interviewlm-terraform-state
gsutil versioning set on gs://interviewlm-terraform-state
```

### 3. Initialize Terraform

```bash
cd terraform/environments/prod
terraform init
```

### 4. Create terraform.tfvars

```hcl
# terraform/environments/prod/terraform.tfvars
project_id   = "interviewlm-480415"
region       = "us-central1"
environment  = "prod"

# Budget-optimized settings
database_tier            = "db-g1-small"
database_availability    = "ZONAL"
redis_memory_size_gb     = 1
redis_tier               = "BASIC"
app_min_instances        = 0
app_max_instances        = 10
worker_min_instances     = 1
worker_max_instances     = 3

# Domain
custom_domain = "interviewlm.com"

# CI/CD
enable_cicd       = true
github_repo_owner = "DecideWAI"
github_repo_name  = "interviewlm-cs"
```

### 5. Deploy Infrastructure

```bash
terraform plan -out=tfplan
terraform apply tfplan
```

### 6. Populate Secrets

```bash
# Get secrets from local .env and add to Secret Manager
echo -n 'YOUR_ANTHROPIC_KEY' | gcloud secrets versions add interviewlm-prod-anthropic-api-key --data-file=-
echo -n 'YOUR_RESEND_KEY' | gcloud secrets versions add interviewlm-prod-resend-api-key --data-file=-
echo -n 'YOUR_MODAL_TOKEN_ID' | gcloud secrets versions add interviewlm-prod-modal-token-id --data-file=-
echo -n 'YOUR_MODAL_TOKEN_SECRET' | gcloud secrets versions add interviewlm-prod-modal-token-secret --data-file=-
echo -n 'YOUR_NEXTAUTH_SECRET' | gcloud secrets versions add interviewlm-prod-nextauth-secret --data-file=-
```

### 7. Build and Push Initial Image

```bash
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest \
  --timeout=1200s
```

### 8. Run Database Migrations

```bash
# Create migration job (one-time)
gcloud run jobs create prisma-migrate \
  --image us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest \
  --region us-central1 \
  --service-account interviewlm-prod-cloud-run@interviewlm-480415.iam.gserviceaccount.com \
  --vpc-connector projects/interviewlm-480415/locations/us-central1/connectors/ilm-prod-vpc-conn \
  --set-secrets "DATABASE_URL=interviewlm-prod-database-url:latest" \
  --command npx \
  --args "prisma,migrate,deploy" \
  --task-timeout 300s

# Execute migrations
gcloud run jobs execute prisma-migrate --region us-central1 --wait
```

### 9. Run Production Seeds (System Data)

After migrations, seed the system-level data that all organizations depend on:

```bash
# Create seed job (one-time)
gcloud run jobs create prisma-seed-prod \
  --image us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest \
  --region us-central1 \
  --service-account interviewlm-prod-cloud-run@interviewlm-480415.iam.gserviceaccount.com \
  --vpc-connector projects/interviewlm-480415/locations/us-central1/connectors/ilm-prod-vpc-conn \
  --set-secrets "DATABASE_URL=interviewlm-prod-database-url:latest" \
  --set-env-vars "ALLOW_SEED_IN_PRODUCTION=true" \
  --command npx \
  --args "tsx,prisma/production-seed.ts" \
  --task-timeout 600s

# Execute production seed
gcloud run jobs execute prisma-seed-prod --region us-central1 --wait
```

**What gets seeded:**
- Configuration data (security, model, sandbox, role, seniority, tier configs)
- Technologies (35+ languages, frameworks, databases, tools)
- Pricing plans (4 credit packs: Starter, Growth, Scale, Enterprise)
- Assessment add-ons (Video Recording, Live Proctoring)
- Default backend seeds (10 seeds: 5 seniorities × 2 assessment types)
- Complexity profiles (for dynamic question generation)

**Note**: This is idempotent and safe to run multiple times. System seeds have `organizationId: null` and are shared across all organizations.

---

## Routine Deployments

### Quick Deploy (Most Common)

For deploying code changes without infrastructure modifications:

```bash
# 1. Build and push new image
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest \
  --timeout=1200s

# 2. Deploy to Cloud Run (app)
gcloud run services update interviewlm-prod-app \
  --image us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest \
  --region us-central1

# 3. Deploy to Cloud Run (workers)
gcloud run services update interviewlm-prod-worker \
  --image us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest \
  --region us-central1

# 4. Run migrations if needed
gcloud run jobs execute prisma-migrate --region us-central1 --wait
```

### Tagged Release Deploy

```bash
# Build with version tag
VERSION=$(git describe --tags --always)
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:${VERSION} \
  --timeout=1200s

# Also tag as latest
gcloud artifacts docker tags add \
  us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:${VERSION} \
  us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest

# Deploy specific version
gcloud run services update interviewlm-prod-app \
  --image us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:${VERSION} \
  --region us-central1
```

---

## CI/CD with GitHub Actions

### Setup Workload Identity Federation

Already configured via Terraform. The CI/CD service account is:
`interviewlm-prod-cicd@interviewlm-480415.iam.gserviceaccount.com`

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  PROJECT_ID: interviewlm-480415
  REGION: us-central1
  REGISTRY: us-central1-docker.pkg.dev
  REPOSITORY: interviewlm-prod-docker
  IMAGE_NAME: app

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/967393583920/locations/global/workloadIdentityPools/interviewlm-prod-github-pool/providers/github-provider
          service_account: interviewlm-prod-cicd@interviewlm-480415.iam.gserviceaccount.com

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Build and Push
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

          # Tag as latest
          docker tag ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest

      - name: Deploy App
        run: |
          gcloud run services update interviewlm-prod-app \
            --image ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --region ${{ env.REGION }}

      - name: Deploy Workers
        run: |
          gcloud run services update interviewlm-prod-worker \
            --image ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --region ${{ env.REGION }}

      - name: Run Migrations
        run: |
          gcloud run jobs execute prisma-migrate \
            --region ${{ env.REGION }} \
            --wait

      - name: Verify Deployment
        run: |
          # Wait for services to be ready
          sleep 30

          # Health check
          curl -f https://interviewlm-prod-app-nfhx642nbq-uc.a.run.app/api/health || exit 1
          echo "Deployment successful!"
```

### Pull Request Preview (Optional)

Create `.github/workflows/preview.yml`:

```yaml
name: Preview Deployment

on:
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
        env:
          DATABASE_URL: "postgresql://user:pass@localhost:5432/db"
          NEXTAUTH_SECRET: "test-secret-at-least-32-characters-long"
          NEXTAUTH_URL: "http://localhost:3000"
          ANTHROPIC_API_KEY: "sk-ant-test"
          SKIP_ENV_VALIDATION: "true"
```

---

## Environment Configuration

### Secret Manager Secrets

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `interviewlm-prod-database-url` | PostgreSQL connection string | Yes |
| `interviewlm-prod-redis-url` | Redis connection string | Yes |
| `interviewlm-prod-nextauth-secret` | NextAuth.js secret (32+ chars) | Yes |
| `interviewlm-prod-anthropic-api-key` | Anthropic API key | Yes |
| `interviewlm-prod-modal-token-id` | Modal token ID | Yes |
| `interviewlm-prod-modal-token-secret` | Modal token secret | Yes |
| `interviewlm-prod-resend-api-key` | Resend email API key | Optional |
| `interviewlm-prod-paddle-api-key` | Paddle payment API key | Optional |
| `interviewlm-prod-langsmith-api-key` | LangSmith tracing API key | Optional |

### Updating Secrets

```bash
# Add new version (services auto-pickup on next deploy)
echo -n 'NEW_VALUE' | gcloud secrets versions add SECRET_NAME --data-file=-

# View current value
gcloud secrets versions access latest --secret=SECRET_NAME

# List all secrets
gcloud secrets list --filter="name:interviewlm-prod"
```

### Environment Variables (Non-Secret)

Configured in Terraform (`terraform/environments/prod/main.tf`):

```hcl
app_env_vars = {
  NODE_ENV                = "production"
  NEXTAUTH_URL            = "https://interviewlm.com"
  LANGSMITH_TRACING       = "true"
  LANGSMITH_PROJECT       = "interviewlm-prod"
  ENABLE_CODE_STREAMING   = "true"
  RESEND_FROM_EMAIL       = "noreply@interviewlm.com"
}
```

---

## Database Migrations

### Run Migrations

```bash
# Execute the pre-configured migration job
gcloud run jobs execute prisma-migrate --region us-central1 --wait

# Check migration logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=prisma-migrate" \
  --limit=50 --format="table(timestamp,textPayload)"
```

### Create New Migration (Local Development)

```bash
# Create migration
npx prisma migrate dev --name add_new_feature

# The migration file is created in prisma/migrations/
# Commit and push, then run migrations in production
```

### Migration Best Practices

1. **Always test locally first**: Run migrations against a local database
2. **Review generated SQL**: Check `prisma/migrations/*/migration.sql`
3. **Avoid destructive changes**: Don't drop columns with data in production
4. **Use separate PRs**: Keep migrations in separate, small PRs

---

## Monitoring & Troubleshooting

### View Logs

```bash
# App logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=interviewlm-prod-app" \
  --limit=100 --format="table(timestamp,severity,textPayload)"

# Worker logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=interviewlm-prod-worker" \
  --limit=100 --format="table(timestamp,severity,textPayload)"

# Error logs only
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=50 --format="table(timestamp,textPayload)"
```

### Health Checks

```bash
# App health
curl https://interviewlm-prod-app-nfhx642nbq-uc.a.run.app/api/health | jq

# Worker health (internal only, check via logs)
gcloud logging read "resource.labels.service_name=interviewlm-prod-worker AND textPayload:health" --limit=10
```

### Common Issues

#### 1. Container fails to start

**Symptom**: "Container failed to start and listen on port"

**Solutions**:
- Check startup probe configuration (port must match)
- Verify environment variables are set
- Check for missing secrets

```bash
# Check service configuration
gcloud run services describe interviewlm-prod-app --region us-central1 --format yaml
```

#### 2. Database connection failed

**Symptom**: "Connection refused" or "Host not found"

**Solutions**:
- Verify VPC connector is attached
- Check DATABASE_URL secret format
- Ensure Cloud SQL is running

```bash
# Check Cloud SQL status
gcloud sql instances describe interviewlm-prod-pg-8990fae7
```

#### 3. Redis connection issues

**Symptom**: "ECONNREFUSED 127.0.0.1:6379"

**Solutions**:
- Ensure REDIS_URL is set (not REDIS_HOST/REDIS_PORT)
- Verify VPC connector egress settings
- Check Redis instance status

```bash
# Check Redis status
gcloud redis instances describe interviewlm-prod-redis --region us-central1
```

#### 4. Worker ESM/TypeScript errors

**Symptom**: "Cannot use import statement outside a module"

**Solution**: Workers use `tsx` for TypeScript execution. Ensure:
- `package.json` has: `"workers": "tsx workers/start.ts"`
- `tsx` is in dependencies (not devDependencies)

---

## Rollback Procedures

### Quick Rollback (Previous Revision)

```bash
# List revisions
gcloud run revisions list --service interviewlm-prod-app --region us-central1

# Rollback to specific revision
gcloud run services update-traffic interviewlm-prod-app \
  --to-revisions REVISION_NAME=100 \
  --region us-central1
```

### Rollback to Specific Image Tag

```bash
# List available images
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app

# Deploy specific version
gcloud run services update interviewlm-prod-app \
  --image us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:PREVIOUS_TAG \
  --region us-central1
```

### Database Rollback

**Warning**: Database rollbacks are destructive. Always backup first.

```bash
# Export current data
gcloud sql export sql interviewlm-prod-pg-8990fae7 \
  gs://interviewlm-prod-sessions-7674487d/backups/backup-$(date +%Y%m%d).sql \
  --database=interviewlm

# For schema-only rollback, use Prisma
npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

---

## Cost Optimization

Current estimated monthly cost: **~$135-165/month**

| Resource | Cost |
|----------|------|
| Cloud SQL (db-g1-small, zonal) | ~$25 |
| Memorystore Redis (1GB, basic) | ~$35 |
| Cloud Run (scale-to-zero) | ~$20-50 |
| VPC Connector (e2-micro) | ~$15 |
| Cloud NAT | ~$30 |
| Storage + Secrets | ~$10 |

### Upgrade Path

For production scale (~$400-800/month):

```hcl
# In terraform.tfvars
database_tier            = "db-custom-2-4096"
database_availability    = "REGIONAL"
redis_memory_size_gb     = 5
redis_tier               = "STANDARD_HA"
app_min_instances        = 2
worker_min_instances     = 2
```

---

## Useful Commands Reference

```bash
# === Deployment ===
gcloud builds submit --tag us-central1-docker.pkg.dev/interviewlm-480415/interviewlm-prod-docker/app:latest
gcloud run services update interviewlm-prod-app --image IMAGE_URL --region us-central1

# === Logs ===
gcloud logging read "resource.labels.service_name=interviewlm-prod-app" --limit=100

# === Secrets ===
gcloud secrets list --filter="name:interviewlm-prod"
gcloud secrets versions access latest --secret=SECRET_NAME

# === Database ===
gcloud run jobs execute prisma-migrate --region us-central1 --wait
gcloud sql instances describe interviewlm-prod-pg-8990fae7

# === Terraform ===
cd terraform/environments/prod
terraform plan
terraform apply

# === Service Status ===
gcloud run services describe interviewlm-prod-app --region us-central1
gcloud run services describe interviewlm-prod-worker --region us-central1
```

---

## Support

- **GCP Console**: https://console.cloud.google.com/run?project=interviewlm-480415
- **Monitoring Dashboard**: https://console.cloud.google.com/monitoring/dashboards?project=interviewlm-480415
- **Logs Explorer**: https://console.cloud.google.com/logs?project=interviewlm-480415
