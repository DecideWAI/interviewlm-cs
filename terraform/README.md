# InterviewLM - GCP Infrastructure with Terraform

## Architecture Overview

This Terraform configuration deploys InterviewLM to Google Cloud Platform following production best practices.

### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Google Cloud Platform                               │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                            VPC Network                                   │   │
│  │                                                                         │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │   │
│  │  │   Public Subnet  │    │  Private Subnet │    │  Private Subnet │    │   │
│  │  │                 │    │   (Services)    │    │   (Database)    │    │   │
│  │  │  ┌───────────┐  │    │                 │    │                 │    │   │
│  │  │  │Cloud Load │  │    │  ┌───────────┐  │    │  ┌───────────┐  │    │   │
│  │  │  │ Balancer  │──┼────┼─▶│ Cloud Run │  │    │  │Cloud SQL  │  │    │   │
│  │  │  └───────────┘  │    │  │  (App)    │  │    │  │PostgreSQL │  │    │   │
│  │  │                 │    │  └─────┬─────┘  │    │  └───────────┘  │    │   │
│  │  │  ┌───────────┐  │    │        │        │    │        ▲        │    │   │
│  │  │  │Cloud CDN  │  │    │  ┌─────▼─────┐  │    │        │        │    │   │
│  │  │  │(Optional) │  │    │  │Cloud Run  │  │    │  Private Service│    │   │
│  │  │  └───────────┘  │    │  │(Workers)  │  │    │    Access       │    │   │
│  │  │                 │    │  └─────┬─────┘  │    │                 │    │   │
│  │  └─────────────────┘    │        │        │    └─────────────────┘    │   │
│  │                         │        ▼        │                           │   │
│  │                         │  ┌───────────┐  │    ┌─────────────────┐    │   │
│  │                         │  │Memorystore│◀─┼────│   Cloud NAT     │    │   │
│  │                         │  │  Redis    │  │    │  (Egress)       │    │   │
│  │                         │  └───────────┘  │    └─────────────────┘    │   │
│  │                         └─────────────────┘                           │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │  Cloud Storage  │  │ Secret Manager  │  │     Cloud Monitoring        │   │
│  │  (Sessions)     │  │    (Secrets)    │  │  (Logs, Metrics, Alerts)    │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

                    External Services (Managed by Third Parties)
        ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
        │  Anthropic  │  │   Modal     │  │   Resend    │  │   Paddle    │
        │  Claude API │  │  Sandbox    │  │   Email     │  │  Payments   │
        └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

### Component Details

| Component | GCP Service | Purpose |
|-----------|-------------|---------|
| Application | Cloud Run | Next.js 15 app with auto-scaling |
| Workers | Cloud Run Jobs | Background job processing (BullMQ) |
| Database | Cloud SQL PostgreSQL 16 | Primary data store |
| Cache | Memorystore Redis | Session cache, job queues |
| Storage | Cloud Storage | Session recordings, artifacts |
| Secrets | Secret Manager | API keys, credentials |
| Load Balancer | Cloud Load Balancing | HTTPS termination, routing |
| CDN | Cloud CDN | Static asset caching (optional) |
| Monitoring | Cloud Monitoring | Metrics, logs, alerts |
| IAM | IAM & Service Accounts | Access control |

## Directory Structure

```
terraform/
├── README.md                    # This file
├── modules/                     # Reusable Terraform modules
│   ├── vpc/                     # VPC, subnets, Cloud NAT
│   ├── cloud_run/               # Cloud Run services
│   ├── cloud_sql/               # PostgreSQL database
│   ├── memorystore/             # Redis cache
│   ├── cloud_storage/           # GCS buckets
│   ├── secrets/                 # Secret Manager
│   ├── monitoring/              # Alerting and dashboards
│   └── iam/                     # Service accounts and permissions
├── environments/                # Environment-specific configurations
│   ├── dev/                     # Development environment
│   ├── staging/                 # Staging environment
│   └── prod/                    # Production environment
```

## Prerequisites

1. **GCP Project**: Create a GCP project with billing enabled
2. **Terraform**: Install Terraform >= 1.5.0
3. **gcloud CLI**: Install and authenticate with `gcloud auth application-default login`
4. **Enable APIs**: Required APIs will be enabled automatically

## Quick Start

### 1. Initialize Backend (First Time Only)

```bash
# Create GCS bucket for state (replace PROJECT_ID)
gcloud storage buckets create gs://interviewlm-terraform-state-PROJECT_ID \
  --location=us-central1 \
  --uniform-bucket-level-access

# Enable versioning
gcloud storage buckets update gs://interviewlm-terraform-state-PROJECT_ID --versioning
```

### 2. Deploy an Environment

```bash
cd terraform/environments/dev

# Copy and edit variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Initialize
terraform init

# Plan
terraform plan -out=tfplan

# Apply (after review)
terraform apply tfplan
```

### 3. Configure Secrets

After infrastructure is created, populate secrets:

```bash
# Set secrets (example)
echo -n "your-api-key" | gcloud secrets versions add anthropic-api-key --data-file=-
```

## Environment Sizing

| Resource | Dev | Staging | Production |
|----------|-----|---------|------------|
| Cloud Run (App) | 1 vCPU, 512MB | 2 vCPU, 1GB | 4 vCPU, 2GB |
| Cloud Run (Workers) | 1 vCPU, 512MB | 2 vCPU, 1GB | 2 vCPU, 2GB |
| Cloud SQL | db-f1-micro | db-g1-small | db-custom-2-4096 |
| Memorystore | 1GB Basic | 1GB Standard | 5GB Standard HA |
| Cloud Storage | Standard | Standard | Standard + Archive |

## Estimated Monthly Costs

| Environment | Estimated Cost |
|-------------|----------------|
| Development | $50-100/month |
| Staging | $100-200/month |
| Production | $400-800/month |

*Note: Costs vary based on usage. Cloud Run scales to zero when idle.*

## Security Features

- **VPC**: Private networking with Cloud NAT for egress
- **Private Service Access**: Database and Redis on private IPs
- **Secret Manager**: All sensitive data encrypted and versioned
- **IAM**: Least privilege service accounts
- **HTTPS**: TLS termination at load balancer
- **Deletion Protection**: Enabled on stateful resources

## Maintenance

### State Management

- State stored in GCS with versioning
- State locking via GCS
- Never modify state manually

### Updates

```bash
# Check for drift
terraform plan

# Update providers
terraform init -upgrade
```

### Destroy (Caution!)

```bash
# Remove deletion protection first
terraform apply -var="enable_deletion_protection=false"

# Then destroy
terraform destroy
```

## CI/CD Integration

See `.github/workflows/terraform.yml` for GitHub Actions integration.

For Cloud Build, see `cloudbuild.yaml`.

## Troubleshooting

### Common Issues

1. **API not enabled**: Run `terraform apply` again, APIs auto-enable
2. **Quota exceeded**: Request quota increase in GCP Console
3. **Permission denied**: Verify service account has required roles

### Useful Commands

```bash
# View state
terraform state list

# Import existing resource
terraform import module.cloud_sql.google_sql_database_instance.main projects/PROJECT/instances/INSTANCE

# Refresh state
terraform refresh
```

## Support

- [GCP Terraform Docs](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud SQL Docs](https://cloud.google.com/sql/docs)
