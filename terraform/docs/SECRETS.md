# Secret Management Guide

This document describes how to manage secrets for InterviewLM infrastructure.

## Overview

All sensitive credentials are stored in Google Cloud Secret Manager and accessed by Cloud Run services at runtime. This approach ensures:

- No secrets in code or environment variables
- Automatic secret rotation support
- Audit logging of secret access
- Fine-grained IAM access control

## Secret Categories

### Core Application Secrets

| Secret | Purpose | Required |
|--------|---------|----------|
| `nextauth-secret` | NextAuth.js session encryption | Yes |
| `database-url` | PostgreSQL connection string | Auto-generated |
| `redis-url` | Redis connection string | Auto-generated |

### External API Keys

| Secret | Purpose | Required |
|--------|---------|----------|
| `anthropic-api-key` | Claude AI API access | Yes |
| `modal-token-id` | Modal sandbox authentication | Yes |
| `modal-token-secret` | Modal sandbox authentication | Yes |
| `langsmith-api-key` | LangSmith observability | Optional |

### Communication Services

| Secret | Purpose | Required |
|--------|---------|----------|
| `resend-api-key` | Email sending (Resend) | Staging/Prod |

### Payment Services

| Secret | Purpose | Required |
|--------|---------|----------|
| `paddle-api-key` | Paddle payment API | Prod |
| `paddle-webhook-secret` | Paddle webhook verification | Prod |

### OAuth Providers (Optional)

| Secret | Purpose | Required |
|--------|---------|----------|
| `github-client-secret` | GitHub OAuth | Optional |
| `google-client-secret` | Google OAuth | Optional |

## Setting Secret Values

### Using gcloud CLI

```bash
# Set your environment
ENV="dev"  # or staging, prod
PREFIX="interviewlm-$ENV"

# Create a new secret version
echo -n "your-secret-value" | \
  gcloud secrets versions add "$PREFIX-nextauth-secret" --data-file=-

# From a file
gcloud secrets versions add "$PREFIX-anthropic-api-key" \
  --data-file=/path/to/api-key.txt
```

### Using GCP Console

1. Go to [Secret Manager Console](https://console.cloud.google.com/security/secret-manager)
2. Find the secret (e.g., `interviewlm-dev-anthropic-api-key`)
3. Click "New Version"
4. Enter the secret value
5. Click "Add New Version"

### Generating Secure Values

```bash
# Generate NextAuth secret
openssl rand -base64 32

# Generate webhook secret
openssl rand -hex 32

# Generate API key (if needed)
uuidgen | tr '[:upper:]' '[:lower:]'
```

## Secret Rotation

### Manual Rotation

```bash
# 1. Add new version
echo -n "new-secret-value" | \
  gcloud secrets versions add "$PREFIX-api-key" --data-file=-

# 2. Redeploy Cloud Run to pick up new version
gcloud run services update interviewlm-dev-app \
  --region=us-central1 \
  --update-env-vars="FORCE_REFRESH=$(date +%s)"

# 3. Verify application works with new secret

# 4. Disable old version (optional)
gcloud secrets versions disable "$PREFIX-api-key" \
  --version=1
```

### Automatic Rotation (Future)

For automatic rotation, consider:
- Cloud Functions triggered by Cloud Scheduler
- External secrets management (HashiCorp Vault)
- Provider-specific rotation (e.g., Paddle key rotation API)

## Accessing Secrets in Application

### Cloud Run Configuration

Secrets are mounted as environment variables via Terraform:

```hcl
# In cloud_run module
env {
  name = "ANTHROPIC_API_KEY"
  value_source {
    secret_key_ref {
      secret  = "interviewlm-dev-anthropic-api-key"
      version = "latest"
    }
  }
}
```

### Application Code

```typescript
// Secrets are available as environment variables
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const databaseUrl = process.env.DATABASE_URL;

// Never log secrets!
console.log("API key configured:", !!anthropicApiKey);
```

## Secret Access Control

### IAM Permissions

The Cloud Run service account has these permissions:

```bash
# View current permissions
gcloud secrets get-iam-policy interviewlm-dev-anthropic-api-key

# Grant access (done by Terraform)
gcloud secrets add-iam-policy-binding interviewlm-dev-anthropic-api-key \
  --member="serviceAccount:interviewlm-dev-cloud-run@PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Audit Logging

Secret access is logged in Cloud Audit Logs:

```bash
# View secret access logs
gcloud logging read \
  'protoPayload.serviceName="secretmanager.googleapis.com"' \
  --limit=50 \
  --format="table(timestamp,protoPayload.methodName,protoPayload.resourceName)"
```

## Environment-Specific Configuration

### Development

```bash
# Minimal secrets for local-like development
# Can use test/sandbox API keys
gcloud secrets versions add interviewlm-dev-anthropic-api-key \
  --data-file=- <<< "sk-ant-test-key"
```

### Staging

```bash
# Use staging/sandbox keys from providers
# Paddle sandbox mode
# Resend test domain
```

### Production

```bash
# Use production API keys
# Enable all payment and email secrets
# Strict access controls
```

## Troubleshooting

### "Permission denied" accessing secrets

```bash
# Check service account permissions
gcloud secrets get-iam-policy interviewlm-dev-anthropic-api-key

# Verify Cloud Run service account
gcloud run services describe interviewlm-dev-app \
  --region=us-central1 \
  --format="value(spec.template.spec.serviceAccountName)"
```

### Secret not available in application

```bash
# Check Cloud Run configuration
gcloud run services describe interviewlm-dev-app \
  --region=us-central1 \
  --format=yaml | grep -A5 "env:"

# Check secret has a version
gcloud secrets versions list interviewlm-dev-anthropic-api-key
```

### "Secret version not found"

```bash
# List available versions
gcloud secrets versions list interviewlm-dev-anthropic-api-key

# If using "latest", ensure at least one version exists
echo -n "value" | gcloud secrets versions add interviewlm-dev-anthropic-api-key \
  --data-file=-
```

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use "latest" version** in Cloud Run for easy rotation
3. **Disable old versions** after rotation verification
4. **Monitor access logs** for unauthorized access
5. **Use separate secrets** per environment
6. **Rotate regularly** (quarterly for API keys)
7. **Limit IAM access** to secrets (least privilege)
8. **Use meaningful names** for audit trail clarity

## Quick Reference

```bash
# List all secrets for an environment
gcloud secrets list --filter="labels.environment:dev"

# View secret metadata
gcloud secrets describe interviewlm-dev-anthropic-api-key

# List versions
gcloud secrets versions list interviewlm-dev-anthropic-api-key

# Access secret value (careful!)
gcloud secrets versions access latest \
  --secret=interviewlm-dev-anthropic-api-key

# Delete a secret (dangerous!)
gcloud secrets delete interviewlm-dev-anthropic-api-key
```
