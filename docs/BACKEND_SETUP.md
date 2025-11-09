# Backend Setup Guide

This guide covers setting up the backend infrastructure for InterviewLM using AWS or GCP credits.

## Architecture Overview

```
Next.js Full-Stack Application
├── Frontend: Next.js 15 + React 19
├── Backend: Next.js API Routes
├── Auth: Auth.js (NextAuth v5)
├── Database: PostgreSQL (AWS RDS or GCP Cloud SQL)
├── ORM: Prisma
└── Storage: AWS S3 or GCP Cloud Storage
```

## Table of Contents

1. [Local Development Setup](#local-development-setup)
2. [AWS Setup (Using Credits)](#aws-setup-using-credits)
3. [GCP Setup (Using Credits)](#gcp-setup-using-credits)
4. [Database Migrations](#database-migrations)
5. [OAuth Configuration](#oauth-configuration)
6. [Deployment](#deployment)

---

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Local PostgreSQL

**Option A: Docker (Recommended)**

```bash
docker run --name interviewlm-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=interviewlm \
  -p 5432:5432 \
  -d postgres:16
```

**Option B: Native Installation**

- macOS: `brew install postgresql@16`
- Ubuntu: `sudo apt install postgresql-16`
- Windows: Download from [postgresql.org](https://www.postgresql.org/download/)

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your local database credentials:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/interviewlm"
NEXTAUTH_SECRET="your-secret-here"  # Generate: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Run Database Migrations

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Optional: Open Prisma Studio to view/edit data
npx prisma studio
```

### 5. Start Development Server

```bash
npm run dev
```

Visit: http://localhost:3000

---

## AWS Setup (Using Credits)

### Prerequisites

- AWS Account with startup credits applied
- AWS CLI installed: `brew install awscli` or [download](https://aws.amazon.com/cli/)
- Configure AWS CLI: `aws configure`

### 1. Set Up AWS RDS PostgreSQL

**Option A: Using AWS Console**

1. Go to [AWS RDS Console](https://console.aws.amazon.com/rds/)
2. Click "Create database"
3. Choose:
   - Engine: PostgreSQL 16
   - Template: **Free tier** (for testing) or **Production** (with credits)
   - DB instance: `db.t3.micro` (free tier) or `db.t3.small` (production)
   - Storage: 20 GB gp3
   - Public access: **Yes** (for initial setup)
   - VPC security group: Create new or use existing
4. Note the endpoint, username, and password

**Option B: Using AWS CLI**

```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier interviewlm-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16 \
  --master-username postgres \
  --master-user-password YourSecurePassword123 \
  --allocated-storage 20 \
  --storage-type gp3 \
  --publicly-accessible \
  --backup-retention-period 7 \
  --region us-east-1

# Wait for instance to be available
aws rds wait db-instance-available --db-instance-identifier interviewlm-db

# Get connection details
aws rds describe-db-instances \
  --db-instance-identifier interviewlm-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

### 2. Configure Security Group

```bash
# Get security group ID
SECURITY_GROUP_ID=$(aws rds describe-db-instances \
  --db-instance-identifier interviewlm-db \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

# Allow inbound PostgreSQL connections (adjust IP for production)
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0  # Change to your IP in production
```

### 3. Update Environment Variables

```env
DATABASE_URL="postgresql://postgres:YourSecurePassword123@your-rds-endpoint.us-east-1.rds.amazonaws.com:5432/postgres"
```

### 4. Run Migrations

```bash
npx prisma db push
```

### 5. Set Up AWS S3 for File Storage (Optional)

```bash
# Create S3 bucket
aws s3 mb s3://interviewlm-files-$(date +%s) --region us-east-1

# Enable CORS
cat > cors.json << EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors --bucket your-bucket-name --cors-configuration file://cors.json
```

### 6. Deploy to AWS (Options)

**Option A: AWS App Runner**

```bash
# Create apprunner.yaml
cat > apprunner.yaml << EOF
version: 1.0
runtime: nodejs18
build:
  commands:
    build:
      - npm install
      - npm run build
run:
  command: npm start
  network:
    port: 3000
    env:
      - name: PORT
        value: "3000"
EOF

# Deploy using AWS Console or CLI
aws apprunner create-service \
  --service-name interviewlm \
  --source-configuration "
    CodeRepository={
      RepositoryUrl=https://github.com/your-repo,
      SourceCodeVersion={Type=BRANCH,Value=main},
      CodeConfiguration={
        ConfigurationSource=API,
        CodeConfigurationValues={
          Runtime=NODEJS_18,
          BuildCommand='npm install && npm run build',
          StartCommand='npm start',
          Port=3000
        }
      }
    }
  "
```

**Option B: AWS Amplify**

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify
amplify init

# Deploy
amplify publish
```

### AWS Cost Optimization

- Use **db.t3.micro** for RDS (free tier eligible)
- Enable RDS automated backups (7 days retention)
- Use S3 Intelligent-Tiering for storage
- Set up CloudWatch billing alerts
- Use AWS Budgets to track credit usage

---

## GCP Setup (Using Credits)

### Prerequisites

- GCP Account with startup credits applied
- gcloud CLI installed: `brew install google-cloud-sdk` or [download](https://cloud.google.com/sdk/docs/install)
- Configure gcloud: `gcloud init`

### 1. Set Up GCP Cloud SQL PostgreSQL

**Option A: Using GCP Console**

1. Go to [Cloud SQL Console](https://console.cloud.google.com/sql/)
2. Click "Create Instance"
3. Choose PostgreSQL
4. Configure:
   - Instance ID: `interviewlm-db`
   - Password: Set secure password
   - Region: Choose closest region
   - Machine type: `db-f1-micro` (free tier) or `db-n1-standard-1`
   - Storage: 10 GB SSD
   - Connections: Add network `0.0.0.0/0` (adjust for production)
5. Note the connection details

**Option B: Using gcloud CLI**

```bash
# Set project
gcloud config set project YOUR_PROJECT_ID

# Create Cloud SQL instance
gcloud sql instances create interviewlm-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YourSecurePassword123 \
  --backup \
  --backup-start-time=02:00

# Create database
gcloud sql databases create interviewlm --instance=interviewlm-db

# Allow connections (adjust for production)
gcloud sql instances patch interviewlm-db \
  --authorized-networks=0.0.0.0/0
```

### 2. Get Connection String

```bash
# Get instance connection name
gcloud sql instances describe interviewlm-db \
  --format="value(connectionName)"

# Output: project:region:instance-name
```

### 3. Update Environment Variables

**Option A: Public IP Connection**

```env
DATABASE_URL="postgresql://postgres:YourSecurePassword123@PUBLIC_IP:5432/interviewlm"
```

**Option B: Cloud SQL Proxy (Recommended for Production)**

```bash
# Download Cloud SQL Proxy
curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.darwin.amd64
chmod +x cloud_sql_proxy

# Run proxy
./cloud_sql_proxy -instances=PROJECT:REGION:INSTANCE-NAME=tcp:5432

# Use localhost connection
DATABASE_URL="postgresql://postgres:YourSecurePassword123@localhost:5432/interviewlm"
```

### 4. Run Migrations

```bash
npx prisma db push
```

### 5. Set Up GCP Cloud Storage (Optional)

```bash
# Create bucket
gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://interviewlm-files-$(date +%s)

# Set CORS policy
cat > cors.json << EOF
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://your-bucket-name
```

### 6. Deploy to GCP Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/interviewlm

# Deploy to Cloud Run
gcloud run deploy interviewlm \
  --image gcr.io/YOUR_PROJECT_ID/interviewlm \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=postgresql://...,NEXTAUTH_SECRET=...,NEXTAUTH_URL=https://..."

# Or use one command with Dockerfile
gcloud run deploy interviewlm \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### GCP Cost Optimization

- Use **db-f1-micro** for Cloud SQL (free tier eligible)
- Enable Cloud SQL automated backups
- Use Cloud Storage Standard class for frequently accessed files
- Set up billing alerts in GCP Console
- Use GCP Budget alerts to track credit usage

---

## Database Migrations

### Development Workflow

```bash
# Make changes to prisma/schema.prisma

# Apply changes to database
npx prisma db push

# Generate Prisma client
npx prisma generate

# View database in browser
npx prisma studio
```

### Production Workflow

```bash
# Create migration
npx prisma migrate dev --name your_migration_name

# Deploy to production
npx prisma migrate deploy

# Seed database (optional)
npx prisma db seed
```

### Common Prisma Commands

```bash
# Format schema
npx prisma format

# Validate schema
npx prisma validate

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Pull schema from existing database
npx prisma db pull
```

---

## OAuth Configuration

### GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - Application name: `InterviewLM`
   - Homepage URL: `http://localhost:3000` (dev) or your domain
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID and Client Secret to `.env`:

```env
GITHUB_CLIENT_ID="your_client_id"
GITHUB_CLIENT_SECRET="your_client_secret"
```

### Google OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth client ID
5. Configure consent screen
6. Create OAuth client ID (Web application)
7. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - Your production domain callback
8. Copy Client ID and Client Secret to `.env`:

```env
GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_client_secret"
```

---

## Deployment Checklist

### Before Deploying

- [ ] Update `NEXTAUTH_URL` to production domain
- [ ] Generate new `NEXTAUTH_SECRET` for production
- [ ] Configure production database
- [ ] Set up OAuth apps with production callback URLs
- [ ] Test authentication flows
- [ ] Run `npm run build` successfully
- [ ] Set up environment variables in deployment platform
- [ ] Configure CORS if needed
- [ ] Set up monitoring (Sentry, LogRocket, etc.)
- [ ] Configure CDN for static assets (CloudFront, Cloud CDN)

### Post-Deployment

- [ ] Run database migrations
- [ ] Test all authentication flows
- [ ] Verify API endpoints
- [ ] Check error logs
- [ ] Set up monitoring alerts
- [ ] Configure backups
- [ ] Document deployment process
- [ ] Set up CI/CD pipeline

---

## Troubleshooting

### Database Connection Issues

```bash
# Test database connection
npx prisma db pull

# Check connection string format
# postgresql://USER:PASSWORD@HOST:PORT/DATABASE

# For SSL connections (AWS RDS, GCP Cloud SQL)
DATABASE_URL="postgresql://user:password@host:5432/db?sslmode=require"
```

### Prisma Client Issues

```bash
# Regenerate Prisma client
rm -rf node_modules/.prisma
npx prisma generate

# Clear Prisma cache
rm -rf node_modules/.prisma && rm -rf node_modules/@prisma/client
npm install
```

### Auth Issues

```bash
# Check environment variables
echo $NEXTAUTH_URL
echo $NEXTAUTH_SECRET

# Verify OAuth callback URLs match
# GitHub: https://github.com/settings/developers
# Google: https://console.cloud.google.com/apis/credentials
```

---

## Support

For issues:
1. Check [Auth.js Documentation](https://authjs.dev/)
2. Check [Prisma Documentation](https://www.prisma.io/docs/)
3. Check [Next.js Documentation](https://nextjs.org/docs)
4. Review AWS/GCP documentation
5. Open an issue in the project repository

---

## Next Steps

1. Set up CI/CD pipeline
2. Configure monitoring and alerts
3. Implement rate limiting
4. Add email service (AWS SES, SendGrid)
5. Set up Redis for caching
6. Configure CDN
7. Implement backup strategy
8. Set up staging environment
