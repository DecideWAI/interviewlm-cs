# AWS Deployment Quick Reference Guide

This guide provides copy-paste ready configurations and commands for deploying InterviewLM on AWS.

---

## 1. QUICK ARCHITECTURE DECISION

```
Your Project: InterviewLM (Next.js 15 + Prisma + Redis/BullMQ Workers + WebSocket)

PRODUCTION:  ECS Fargate + ALB + CloudFront + RDS + ElastiCache
STAGING:     App Runner + RDS (micro) + Shared ElastiCache

COST: $352-458/month total
```

---

## 2. DOCKERFILE ENHANCEMENTS

Update your existing `/home/user/interviewlm-cs/Dockerfile`:

```dockerfile
# Change line 4 from:
FROM node:18-alpine AS base
# To:
FROM node:22.14.0-alpine AS base

# Add after line 9 (apk add):
RUN apk add --no-cache libc6-compat openssl curl

# Update builder stage to prune dev dependencies (around line 37):
RUN npm run build && npm prune --production
```

Create `.dockerignore`:
```
node_modules
.next
.git
.gitignore
README.md
.env
.env.local
.env.*.local
coverage
.jest
__tests__
scripts
.vscode
.idea
*.log
.DS_Store
.turbo
```

Build with BuildKit:
```bash
DOCKER_BUILDKIT=1 docker build -t interviewlm:latest .
docker images interviewlm:latest  # Should be ~220MB
```

---

## 3. HEALTH CHECK ENDPOINT

Create `/home/user/interviewlm-cs/app/api/health/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      checks: {
        database: false,
        redis: false,
      },
    };

    // Check database connectivity (Prisma)
    try {
      const prisma = await import('@/lib/prisma').then(m => m.default);
      await prisma.$queryRaw`SELECT 1`;
      healthCheck.checks.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
      healthCheck.checks.database = false;
    }

    // Check Redis connectivity
    try {
      const redis = await import('@/lib/redis').then(m => m.default);
      await redis.ping();
      healthCheck.checks.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
      healthCheck.checks.redis = false;
    }

    const allHealthy = Object.values(healthCheck.checks).every(v => v === true);
    const statusCode = allHealthy ? 200 : 503;

    return NextResponse.json(healthCheck, { status: statusCode });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

// GET handler for ALB health checks (simple version)
export async function HEAD(request: NextRequest) {
  return GET(request);
}
```

---

## 4. ECS FARGATE DEPLOYMENT (AWS CLI)

### Step 1: Create ECS Cluster

```bash
# Create cluster
aws ecs create-cluster \
  --cluster-name interviewlm-prod-cluster \
  --region us-east-1 \
  --cluster-settings containerInsights=enabled

# Create the cluster service linked role (one-time)
aws iam create-service-linked-role \
  --aws-service-name ecs.amazonaws.com || echo "Role already exists"
```

### Step 2: Create Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/interviewlm-prod \
  --region us-east-1

# Set retention (30 days)
aws logs put-retention-policy \
  --log-group-name /ecs/interviewlm-prod \
  --retention-in-days 30
```

### Step 3: Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name interviewlm \
  --region us-east-1

# Set lifecycle policy (delete old images after 30 days)
aws ecr put-lifecycle-policy \
  --repository-name interviewlm \
  --lifecycle-policy-text '{
    "rules": [{
      "rulePriority": 1,
      "description": "Delete old images",
      "selection": {
        "tagStatus": "untagged",
        "countType": "imageSinceImagePushed",
        "countUnit": "days",
        "countNumber": 30
      },
      "action": { "type": "expire" }
    }]
  }'

# Get login command
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
```

### Step 4: Push Docker Image

```bash
# Build image
DOCKER_BUILDKIT=1 docker build -t interviewlm:latest .

# Tag for ECR
docker tag interviewlm:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm:latest

# Push to ECR
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm:latest
```

### Step 5: Create ECS Task Definition

Save as `task-definition.json`:

```json
{
  "family": "interviewlm",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "interviewlm",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "ASSET_PREFIX",
          "value": "https://cdn.interviewlm.com"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:interviewlm-prod-database-url:PASSWORD::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/interviewlm-prod",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:3000/api/health || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Register task definition:
```bash
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json
```

### Step 6: Create ECS Service

```bash
aws ecs create-service \
  --cluster interviewlm-prod-cluster \
  --service-name interviewlm-app \
  --task-definition interviewlm:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345678,subnet-87654321],securityGroups=[sg-12345678],assignPublicIp=DISABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/interviewlm-app/abc123,containerName=interviewlm,containerPort=3000 \
  --deployment-configuration maximumPercent=200,minimumHealthyPercent=100 \
  --region us-east-1
```

### Step 7: Configure Auto-Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/interviewlm-prod-cluster/interviewlm-app \
  --min-capacity 2 \
  --max-capacity 10 \
  --region us-east-1

# Create CPU-based scaling policy
aws application-autoscaling put-scaling-policy \
  --policy-name cpu-scaling \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/interviewlm-prod-cluster/interviewlm-app \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
    "TargetValue=70.0,PredefinedMetricSpecification={PredefinedMetricType=ECSServiceAverageCPUUtilization},ScaleOutCooldown=60,ScaleInCooldown=300" \
  --region us-east-1

# Create memory-based scaling policy
aws application-autoscaling put-scaling-policy \
  --policy-name memory-scaling \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/interviewlm-prod-cluster/interviewlm-app \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
    "TargetValue=80.0,PredefinedMetricSpecification={PredefinedMetricType=ECSServiceAverageMemoryUtilization},ScaleOutCooldown=60,ScaleInCooldown=300" \
  --region us-east-1
```

---

## 5. APP RUNNER DEPLOYMENT (Staging)

### One-Command Staging Deployment

```bash
aws apprunner create-service \
  --service-name interviewlm-staging \
  --source-configuration \
    ImageRepository='{
      ImageIdentifier=123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm:latest,
      ImageRepositoryType=ECR,
      ImageConfiguration={
        Port=3000,
        RuntimeEnvironmentVariables=[
          {Name=NODE_ENV,Value=staging},
          {Name=DATABASE_URL,Value=postgresql://user:pass@staging-db.rds.amazonaws.com:5432/interviewlm}
        ],
        StartCommand=node server.js
      }
    }' \
  --instance-configuration Cpu=1,Memory=2,InstanceRoleArn=arn:aws:iam::123456789:role/AppRunnerRole \
  --auto-scaling-configuration-arn arn:aws:apprunner:us-east-1:123456789:autoscalingconfiguration/interviewlm-staging/1/uuid \
  --region us-east-1
```

### Create Auto-Scaling Configuration (scale-to-zero)

```bash
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name interviewlm-staging \
  --max-concurrency 100 \
  --max-size 3 \
  --min-size 1 \
  --target-cpu-utilization-percentage 70 \
  --target-memory-utilization-percentage 80 \
  --region us-east-1
```

---

## 6. LOAD BALANCER SETUP (ALB)

### Create ALB and Target Groups

```bash
# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name interviewlm-alb \
  --subnets subnet-12345678 subnet-87654321 \
  --security-groups sg-12345678 \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region us-east-1 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Create target group
aws elbv2 create-target-group \
  --name interviewlm-app \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-12345678 \
  --target-type ip \
  --health-check-protocol HTTP \
  --health-check-path /api/health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --matcher HttpCode=200 \
  --region us-east-1
```

### Create HTTPS Listener (ACM Certificate)

```bash
# Create ACM certificate (one-time)
aws acm request-certificate \
  --domain-name interviewlm.com \
  --subject-alternative-names "*.interviewlm.com" \
  --validation-method DNS \
  --region us-east-1

# Create HTTPS listener (replace CERT_ARN with your certificate)
CERT_ARN="arn:aws:acm:us-east-1:123456789:certificate/12345678-1234-1234-1234-123456789012"
TG_ARN="arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/interviewlm-app/abc123"

aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --region us-east-1
```

---

## 7. CLOUDFRONT SETUP

### Create CloudFront Distribution

```bash
# First, create S3 bucket for assets
aws s3api create-bucket \
  --bucket interviewlm-assets-prod \
  --region us-east-1

# Block public access
aws s3api put-public-access-block \
  --bucket interviewlm-assets-prod \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Create CloudFront distribution (save as cloudfront-config.json)
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json \
  --region us-east-1
```

`cloudfront-config.json`:
```json
{
  "CallerReference": "interviewlm-prod-$(date +%s)",
  "Comment": "InterviewLM Production CDN",
  "Enabled": true,
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "S3Origin",
        "DomainName": "interviewlm-assets-prod.s3.us-east-1.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": "origin-access-identity/cloudfront/ABCDEFG123456"
        }
      },
      {
        "Id": "ALBOrigin",
        "DomainName": "interviewlm-alb-123456.us-east-1.elb.amazonaws.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSSLProtocols": {
            "Quantity": 1,
            "Items": ["TLSv1.2"]
          }
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "ALBOrigin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true
  },
  "CacheBehaviors": [
    {
      "PathPattern": "/static/*",
      "TargetOriginId": "S3Origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
      "Compress": true
    },
    {
      "PathPattern": "/_next/static/*",
      "TargetOriginId": "S3Origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
      "Compress": true
    }
  ],
  "DefaultRootObject": "index.html",
  "ViewerCertificate": {
    "AcmCertificateArn": "arn:aws:acm:us-east-1:123456789:certificate/12345678",
    "SslSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  }
}
```

---

## 8. SECRETS & PARAMETERS

### Create Secrets in Secrets Manager

```bash
# Database URL
aws secretsmanager create-secret \
  --name /interviewlm/prod/database-url \
  --description "PostgreSQL connection string" \
  --secret-string "postgresql://user:password@db.rds.amazonaws.com:5432/interviewlm" \
  --region us-east-1

# OAuth secrets (JSON)
aws secretsmanager create-secret \
  --name /interviewlm/prod/oauth-secrets \
  --description "OAuth provider secrets" \
  --secret-string '{
    "github_client_id": "...",
    "github_client_secret": "...",
    "google_client_id": "...",
    "google_client_secret": "..."
  }' \
  --region us-east-1

# API keys
aws secretsmanager create-secret \
  --name /interviewlm/prod/api-keys \
  --description "Third-party API keys" \
  --secret-string '{
    "anthropic_api_key": "sk-...",
    "sendgrid_api_key": "SG...",
    "aws_secret_access_key": "..."
  }' \
  --region us-east-1
```

### Create Parameters in Parameter Store

```bash
# Application settings
aws ssm put-parameter \
  --name /interviewlm/prod/app-name \
  --value "InterviewLM" \
  --type String \
  --region us-east-1

aws ssm put-parameter \
  --name /interviewlm/prod/log-level \
  --value "info" \
  --type String \
  --region us-east-1

aws ssm put-parameter \
  --name /interviewlm/prod/max-db-connections \
  --value "20" \
  --type String \
  --region us-east-1

aws ssm put-parameter \
  --name /interviewlm/prod/redis-host \
  --value "interviewlm-redis.abc123.cache.amazonaws.com" \
  --type String \
  --region us-east-1
```

---

## 9. MONITORING & ALARMS

### Create CloudWatch Dashboard

```bash
aws cloudwatch put-dashboard \
  --dashboard-name InterviewLM-Production \
  --dashboard-body file://dashboard.json \
  --region us-east-1
```

### Create Key Alarms

```bash
# High CPU alert
aws cloudwatch put-metric-alarm \
  --alarm-name interviewlm-high-cpu \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:interviewlm-alerts \
  --region us-east-1

# High memory alert
aws cloudwatch put-metric-alarm \
  --alarm-name interviewlm-high-memory \
  --alarm-description "Alert when memory > 85%" \
  --metric-name MemoryUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:interviewlm-alerts \
  --region us-east-1

# Unhealthy targets alert
aws cloudwatch put-metric-alarm \
  --alarm-name interviewlm-unhealthy-targets \
  --alarm-description "Alert when targets are unhealthy" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:interviewlm-alerts \
  --region us-east-1
```

---

## 10. COST MONITORING

### Enable Cost Allocation Tags

```bash
# Tag ECS service
aws ecs update-service \
  --cluster interviewlm-prod-cluster \
  --service interviewlm-app \
  --tags \
    key=Environment,value=Production \
    key=Application,value=InterviewLM \
    key=CostCenter,value=Engineering \
  --region us-east-1

# Tag RDS instance
aws rds add-tags-to-resource \
  --resource-name arn:aws:rds:us-east-1:123456789:db:interviewlm-prod \
  --tags Key=Environment,Value=Production Key=Application,Value=InterviewLM \
  --region us-east-1
```

### Create Cost Budget

```bash
aws budgets create-budget \
  --account-id 123456789 \
  --budget file://budget.json \
  --notifications-with-subscribers file://budget-notifications.json \
  --region us-east-1
```

---

## 11. PRODUCTION CHECKLIST

Before going live:

```bash
# 1. Verify image exists
aws ecr describe-images \
  --repository-name interviewlm \
  --region us-east-1

# 2. Test health endpoint
curl https://api.interviewlm.com/api/health

# 3. Check ECS service status
aws ecs describe-services \
  --cluster interviewlm-prod-cluster \
  --services interviewlm-app \
  --region us-east-1

# 4. Verify ALB targets are healthy
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/interviewlm-app/abc123 \
  --region us-east-1

# 5. Check CloudFront distribution status
aws cloudfront get-distribution-config \
  --id E123456EXAMPLE \
  --region us-east-1

# 6. Monitor logs
aws logs tail /ecs/interviewlm-prod --follow --region us-east-1
```

---

## 12. USEFUL COMMANDS

```bash
# View ECS service logs in real-time
aws logs tail /ecs/interviewlm-prod --follow

# Scale service manually
aws ecs update-service \
  --cluster interviewlm-prod-cluster \
  --service interviewlm-app \
  --desired-count 5 \
  --region us-east-1

# Update service with new image
aws ecs update-service \
  --cluster interviewlm-prod-cluster \
  --service interviewlm-app \
  --force-new-deployment \
  --region us-east-1

# SSH into running container (AWS Systems Manager Session Manager)
aws ecs execute-command \
  --cluster interviewlm-prod-cluster \
  --task <task-id> \
  --container interviewlm \
  --interactive \
  --command "/bin/sh" \
  --region us-east-1

# Get detailed service info
aws ecs describe-services \
  --cluster interviewlm-prod-cluster \
  --services interviewlm-app \
  --region us-east-1 | jq '.'

# Restart all tasks (rolling update)
aws ecs update-service \
  --cluster interviewlm-prod-cluster \
  --service interviewlm-app \
  --force-new-deployment \
  --region us-east-1
```

---

## 13. TROUBLESHOOTING

### Tasks failing to start
```bash
# Check logs
aws logs tail /ecs/interviewlm-prod --follow

# Check task definition
aws ecs describe-task-definition \
  --task-definition interviewlm:1 \
  --region us-east-1

# Check service events
aws ecs describe-services \
  --cluster interviewlm-prod-cluster \
  --services interviewlm-app \
  --region us-east-1 | jq '.services[0].events'
```

### Health checks failing
```bash
# Test endpoint directly
curl -v http://localhost:3000/api/health

# Check security groups allow traffic
aws ec2 describe-security-groups \
  --group-ids sg-12345678 \
  --region us-east-1
```

### High costs
```bash
# Get cost explorer data
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region us-east-1
```

---

## 14. NEXT STEPS

1. ✅ Review AWS_DEPLOYMENT_ARCHITECTURE.md for detailed decisions
2. ✅ Create AWS account (if not done)
3. ✅ Set up VPC, subnets, security groups
4. ✅ Create RDS PostgreSQL instance
5. ✅ Create ElastiCache Redis
6. ✅ Build and push Docker image
7. ✅ Deploy to App Runner (staging)
8. ✅ Deploy to ECS Fargate (production)
9. ✅ Configure monitoring and alarms
10. ✅ Set up CloudFront CDN
11. ✅ Run load tests
12. ✅ Plan maintenance runbooks

