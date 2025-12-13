# Local Test Environment

Minimal Terraform configuration for testing GCS file storage locally.

## What This Creates

- **GCS Bucket**: Regional bucket in `us-east1` (different from production's `us-central1`)
- **Service Account**: With `storage.objectAdmin` and `iam.serviceAccountTokenCreator` permissions
- **Service Account Key**: JSON key file for local authentication
- **Setup Script**: Automated configuration of local environment

## Prerequisites

1. [Terraform](https://www.terraform.io/downloads) >= 1.5.0
2. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud` CLI)
3. A GCP project for development/testing (separate from production)

## Quick Start

### 1. Authenticate with GCP

```bash
gcloud auth login
gcloud auth application-default login
```

### 2. Set your project

```bash
gcloud config set project YOUR_DEV_PROJECT_ID
```

### 3. Create terraform.tfvars

```bash
cd terraform/environments/local-test
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
project_id = "your-dev-project-id"
region     = "us-east1"  # Different from production
```

### 4. Initialize and Apply

```bash
terraform init
terraform apply
```

### 5. Configure Local Environment

After Terraform completes, run the setup script:

```bash
./setup-local-credentials.sh
```

This will:
- Create `.gcs-credentials.json` in your project root
- Add GCS configuration to `.env.local`

### 6. Verify the Setup

```bash
# From the project root
cd ../../..
npx ts-node -e "
import { testConnection } from './lib/services/gcs';
testConnection().then(ok => {
  console.log('GCS connection:', ok ? 'SUCCESS' : 'FAILED');
  process.exit(ok ? 0 : 1);
});
"
```

## Manual Configuration

If you prefer to set up manually, add these to your `.env.local`:

```bash
GOOGLE_CLOUD_PROJECT=your-dev-project-id
GCS_BUCKET=interviewlm-local-test-sessions-XXXXXXXX
GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/.gcs-credentials.json
```

## Testing the GCS Integration

### Upload a test file

```typescript
import { uploadFileContent, downloadFileContent } from './lib/services/gcs';

// Upload
const result = await uploadFileContent('test-candidate', 'Hello, GCS!');
console.log('Checksum:', result.checksum);

// Download
const content = await downloadFileContent('test-candidate', result.checksum);
console.log('Content:', content);
```

### Via the API (start dev server first)

```bash
# Upload via session events (simulated)
curl -X POST http://localhost:3000/api/sessions/test/files \
  -H "Content-Type: application/json" \
  -d '{"checksums": []}'
```

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

This will delete:
- The GCS bucket and all contents
- The service account and key

## Cost

This environment is very low cost:
- GCS Standard storage: ~$0.02/GB/month
- With 7-day auto-deletion, costs are minimal
- No compute resources (Cloud Run, SQL, Redis)

## Troubleshooting

### "Permission denied" errors

1. Ensure you're authenticated: `gcloud auth application-default login`
2. Check service account permissions in GCP Console
3. Verify `GOOGLE_APPLICATION_CREDENTIALS` path is correct and absolute

### "Bucket not found" errors

1. Verify the bucket name in GCP Console
2. Check `GCS_BUCKET` matches the Terraform output
3. Ensure you're using the correct project

### "SignUrl failed" errors

The service account needs `iam.serviceAccountTokenCreator` role. This is automatically granted by Terraform, but if you see this error:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:interviewlm-local-test-sa@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```
