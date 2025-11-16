# AWS Deployment Architecture for InterviewLM (Next.js 15)

## Executive Summary

This document provides comprehensive AWS deployment recommendations for InterviewLM, a Next.js 15 application with Prisma database, Redis/BullMQ workers, and WebSocket support. The recommendation prioritizes production reliability while optimizing staging costs.

**Primary Recommendation:** **ECS Fargate + ALB for Production, App Runner for Staging**

---

## 1. DEPLOYMENT OPTIONS COMPARISON

### 1.1 Overview Comparison Table

| Aspect | ECS Fargate | ECS EC2 | App Runner | Amplify |
|--------|------------|---------|-----------|----------|
| **Management** | Container orchestration (some overhead) | VM management (high overhead) | Fully managed (minimal) | Fully managed (minimal) |
| **Scalability** | Excellent (fine-grained control) | Excellent (complex setup) | Good (auto-scaling) | Limited (for static/simple SSR) |
| **SSR Support** | ✓ Full | ✓ Full | ✓ Full | ✓ Good |
| **Cost (on-demand)** | Baseline | 15-20% higher | 1.5-2x higher | Higher |
| **Cost (spot)** | -70% (Fargate Spot) | -70% (EC2 Spot) | No spot | N/A |
| **Complexity** | Medium-High | High | Low | Very Low |
| **Custom Config** | High flexibility | Maximum flexibility | Limited | Very limited |
| **Worker Support** | ✓ Yes (Redis/BullMQ) | ✓ Yes | ✓ Yes | Limited |
| **Database Support** | ✓ VPC connectivity | ✓ VPC connectivity | ✓ VPC connectivity | Limited |
| **WebSocket Support** | ✓ Yes (via ALB) | ✓ Yes | ✓ Yes | Limited |

### 1.2 Detailed Analysis

#### **AWS Amplify**
**When to use:** Static exports, simple SSR, minimal backend requirements

**Pros:**
- Easiest deployment (push to GitHub = auto-deploy)
- Built-in CI/CD
- CDN included
- No infrastructure management

**Cons:**
- Limited SSR customization
- Cannot run background workers (Redis/BullMQ issue)
- Limited environment control
- More expensive for complex workloads
- Not suitable for this project (requires workers + WebSockets)

**Verdict:** ❌ Not recommended (insufficient worker support)

---

#### **AWS App Runner**
**When to use:** Staging environments, low-traffic applications, simple deployments

**Pros:**
- Fully managed container service
- Simple GitHub/ECR deployment
- Auto-scaling based on request count
- **Scale-to-zero (no charges when idle)** ✓ IDEAL FOR STAGING
- No load balancer costs (traffic is free)
- ~15 minutes deployment time

**Cons:**
- 50-58% higher vCPU/GB costs than Fargate (base pricing)
- Not suitable for high-traffic production (becomes expensive)
- Limited control over networking
- Regional service only
- Harder to debug networking issues

**Cost Analysis for Staging:**
```
Example: 2 vCPU, 4 GB RAM, 160 hours/month (staging hours)
- On-Demand: ~$50-65/month
- With scale-to-zero during off-hours: ~$15-20/month (EXCELLENT)
```

**Verdict:** ✓ Recommended for staging (scale-to-zero + low traffic)

---

#### **ECS EC2**
**When to use:** High volume sustained traffic, cost-sensitive production

**Pros:**
- Maximum flexibility
- Lower per-unit compute cost
- Good spot pricing (-70%)

**Cons:**
- Complex cluster management
- Must manage EC2 instances
- ASG configuration complexity
- Overkill for InterviewLM scale
- Operational overhead

**Verdict:** ⚠️ Not recommended (unnecessary complexity for this project)

---

#### **ECS Fargate** (RECOMMENDED for Production)
**When to use:** Production workloads, servers, APIs, SSR applications

**Pros:**
- Serverless containers (no instance management)
- Pay-per-second billing (fine-grained)
- Excellent auto-scaling (CPU/memory/request-based)
- VPC networking (required for Redis/BullMQ)
- Full IAM integration
- CloudWatch Container Insights
- Spot pricing available (-70% savings)

**Cons:**
- Requires ALB/NLB (additional cost)
- More complex setup than App Runner
- Task definition learning curve

**Cost Analysis for Production (2 vCPU, 4 GB RAM):**
```
Monthly Cost Breakdown (730 hours):
- Fargate compute (on-demand): ~$150-170/month
- ALB processing: ~$20-40/month (depends on traffic)
- CloudFront (if used): Data transfer savings offset by $0.085/GB
Total: ~$170-210/month for baseline

With Fargate Spot (70% savings):
- Compute: ~$45-50/month
- ALB: ~$20-40/month
Total: ~$65-90/month
```

**Verdict:** ✓✓ Recommended for production (reliability + cost with spot)

---

## 2. RECOMMENDED ARCHITECTURE: ECS Fargate + App Runner

### 2.1 Production Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Route 53 (DNS)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   ┌─────────────┐          ┌─────────────────┐
   │  CloudFront │          │   API Gateway   │
   │   (Static)  │          │   (WebSocket)   │
   └─────────────┘          └────────┬────────┘
        │                            │
        │                    ┌───────┴────────┐
        │                    │                │
        ▼                    ▼                ▼
   ┌─────────────┐    ┌──────────────┐  ┌──────────────┐
   │   S3 Bucket │    │     ALB      │  │  ALB (WS)    │
   │  (assets)   │    │ (HTTP/HTTPS) │  │ (WebSocket)  │
   └─────────────┘    └───────┬──────┘  └──────┬───────┘
                               │                │
                        ┌──────┴────────┐       │
                        │               │       │
                        ▼               ▼       ▼
                    ┌──────────────────────────────────┐
                    │    ECS Fargate Cluster           │
                    │  ┌──────────────────────────────┐│
                    │  │  Next.js App (primary)       ││
                    │  │  - 2-3 tasks (prod)          ││
                    │  │  - Auto-scaling (2-10 tasks) ││
                    │  │  - Fargate Spot capable      ││
                    │  └──────────────────────────────┘│
                    │  ┌──────────────────────────────┐│
                    │  │  Worker Service              ││
                    │  │  - BullMQ workers (1-3 tasks)││
                    │  │  - Connected to Redis        ││
                    │  └──────────────────────────────┘│
                    └──────────────────────────────────┘
                        │                    │
                        ▼                    ▼
                    ┌──────────┐         ┌─────────┐
                    │PostgreSQL│         │  Redis  │
                    │   (RDS)  │         │ (ElastiC)│
                    └──────────┘         └─────────┘
                        │
                        ▼
                    ┌──────────────────┐
                    │  CloudWatch Logs │
                    │  Container       │
                    │  Insights        │
                    └──────────────────┘
```

### 2.2 Staging Architecture

```
┌──────────────────────────────────────┐
│  Route 53 (staging.interviewlm.com)  │
└──────────────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │   App Runner Service │
        │  ┌────────────────┐  │
        │  │ Next.js App    │  │
        │  │ (single task)  │  │
        │  │ Scale-to-zero  │  │
        │  └────────────────┘  │
        │  ┌────────────────┐  │
        │  │ Workers (1)    │  │
        │  │ Shared process │  │
        │  └────────────────┘  │
        └──────┬───────────────┘
               │
        ┌──────┴──────────┐
        │                 │
        ▼                 ▼
   ┌──────────┐       ┌─────────┐
   │PostgreSQL│       │  Redis  │
   │   (RDS)  │       │ (Shared)│
   └──────────┘       └─────────┘
```

---

## 3. CONTAINER IMAGE OPTIMIZATION

### 3.1 Current Dockerfile Analysis

Your existing Dockerfile (`/home/user/interviewlm-cs/Dockerfile`) is **well-optimized** with:

✓ Multi-stage builds (base → deps → builder → runner)
✓ Alpine base image (reduces size)
✓ Standalone output mode (Next.js)
✓ Non-root user (security)
✓ Health checks included
✓ Minimal final image

### 3.2 Recommended Enhancements

#### **1. Use Node 22 Alpine (instead of 18)**

```dockerfile
# Current (line 4)
FROM node:18-alpine AS base

# Recommended
FROM node:22-alpine AS base
```

**Why:** Node 22 has better performance, security patches, and better support for Next.js 15

#### **2. Add .dockerignore optimization**

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
```

#### **3. Optimize build for production**

```dockerfile
# In builder stage, before build
RUN npm ci --only=production

# Or use npm prune
RUN npm run build && npm prune --production
```

#### **4. Use BuildKit for better caching**

When building Docker images, enable BuildKit:
```bash
DOCKER_BUILDKIT=1 docker build -t interviewlm:latest .
```

#### **5. Final image size optimization**

Expected final image size: **~200-250 MB** (acceptable)

To verify:
```bash
docker build -t interviewlm:latest .
docker images interviewlm:latest
# Should show ~220MB
```

---

## 4. AUTO-SCALING CONFIGURATION

### 4.1 ECS Fargate Auto-Scaling

**For Production - ECS Service:**

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/interviewlm-prod-cluster/interviewlm-app \
  --min-capacity 2 \
  --max-capacity 10

# Target Tracking Scaling Policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --policy-name cpu-scaling \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/interviewlm-prod-cluster/interviewlm-app \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
    TargetValue=70.0,\
    PredefinedMetricSpecification={PredefinedMetricType=ECSServiceAverageCPUUtilization},\
    ScaleOutCooldown=60,\
    ScaleInCooldown=300
```

**Recommended Configuration:**

```yaml
ECS Service Auto-Scaling:
  Min Capacity: 2 (high availability)
  Max Capacity: 10 (cost control)

  Policies:
    - CPU Utilization Target: 70%
      - Scale out cooldown: 60s (aggressive)
      - Scale in cooldown: 300s (conservative)

    - Memory Utilization Target: 80%
      - Scale out cooldown: 60s
      - Scale in cooldown: 300s

    - ALB Request Count: 2000 requests/minute per task
      - Spreads load evenly
      - Triggers before CPU spikes
```

**For Worker Service:**

```yaml
Worker Auto-Scaling:
  Min Capacity: 1
  Max Capacity: 5
  CPU Target: 60%

  Reasoning:
    - Workers are more CPU-bound (processing)
    - Can tolerate higher CPU before scaling
    - Don't need high availability (distributed across app)
```

### 4.2 App Runner Auto-Scaling (Staging)

App Runner handles auto-scaling automatically based on request rate:

```bash
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name interviewlm-staging \
  --max-concurrency 100 \
  --max-size 3 \
  --min-size 1 \
  --target-cpu-utilization-percentage 70 \
  --target-memory-utilization-percentage 80
```

---

## 5. LOAD BALANCER SETUP (ALB)

### 5.1 ALB Configuration for Next.js

```yaml
Application Load Balancer:
  Name: interviewlm-alb
  Scheme: internet-facing
  IP Address Type: ipv4
  Subnets:
    - Public subnet AZ-1
    - Public subnet AZ-2
    - Public subnet AZ-3 (if available)

Listeners:
  - Port: 80
    Protocol: HTTP
    Action: Redirect to HTTPS (301)

  - Port: 443
    Protocol: HTTPS
    SSL Certificate: ACM (*.interviewlm.com)
    Default Action: Forward to app target group

Target Groups:
  - Name: interviewlm-app
    Protocol: HTTP (to Fargate)
    Port: 3000
    VPC: App VPC
    Health Check:
      Path: /api/health
      Interval: 30 seconds
      Timeout: 5 seconds
      Healthy Threshold: 2
      Unhealthy Threshold: 3
      Matcher: 200-299

  - Name: interviewlm-workers
    Protocol: HTTP
    Port: 3000
    Health Check: Same as above

  - Name: interviewlm-websocket (optional separate ALB)
    Protocol: HTTP
    Port: 3000
    Stickiness: Enabled (LB-generated cookie)
    Duration: 1 day
    Health Check: Same
```

### 5.2 ALB Rules (Host-based Routing)

```yaml
Listener Rules (HTTPS):
  1. Host: api.interviewlm.com
     Forward to: interviewlm-api target group

  2. Host: *.interviewlm.com
     Forward to: interviewlm-app target group

  3. Path: /ws/*
     Forward to: interviewlm-websocket target group
     (with stickiness enabled)
```

### 5.3 Security Groups

```yaml
ALB Security Group:
  Inbound:
    - Port 80 (HTTP): 0.0.0.0/0
    - Port 443 (HTTPS): 0.0.0.0/0

ECS Task Security Group:
  Inbound:
    - Port 3000: ALB Security Group (source)
  Outbound:
    - All traffic to anywhere (for external APIs)
    - PostgreSQL (5432) to RDS security group
    - Redis (6379) to ElastiCache security group
```

### 5.4 Health Check Optimization

Your existing Dockerfile has health checks. Ensure `/api/health` endpoint exists:

```typescript
// app/api/health/route.ts
export async function GET() {
  try {
    // Simple check - database connectivity
    const response = await fetch(`${process.env.DATABASE_URL}`, {
      method: 'HEAD',
      timeout: 5000
    });

    return Response.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    return Response.json({ status: 'unhealthy' }, { status: 503 });
  }
}
```

---

## 6. CLOUDFRONT CDN FOR STATIC ASSETS

### 6.1 CloudFront Distribution Setup

```yaml
CloudFront Distribution:
  Name: interviewlm-cdn

  Origins:
    1. S3 Origin:
       S3 Bucket: interviewlm-assets-prod
       Origin Access Control: OAC (Restrict bucket access)
       Origin Path: /static

    2. Custom Origin (for dynamic content):
       Domain: alb.interviewlm.com
       HTTP Port: 80
       HTTPS Port: 443
       Protocol: HTTPS only
       Origin Shield: Enabled (us-east-1)

  Behaviors:
    1. Path Pattern: /static/*
       Cache Policy: Managed-CachingOptimized
       TTL: 31536000 seconds (1 year - safe because hashed filenames)
       Compress: Yes
       Origin: S3

    2. Path Pattern: /_next/static/*
       Cache Policy: Managed-CachingOptimized
       TTL: 31536000 seconds
       Compress: Yes
       Origin: S3

    3. Default (everything else):
       Cache Policy: Managed-CachingDisabled
       Origin: ALB
       Compress: Yes
       Allowed HTTP Methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE

  Cache Settings:
    Compress: Yes (automatic Gzip/Brotli)
    Viewer Protocol Policy: Redirect HTTP to HTTPS

  Security:
    WAF: AWS WAF (optional, but recommended for production)
    HTTPS: Required
    Certificate: ACM (*.interviewlm.com)
    Minimum TLS: 1.2
```

### 6.2 Next.js Configuration for CloudFront

Update `next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',

  // Add assetPrefix for CloudFront
  assetPrefix: process.env.ASSET_PREFIX || '',

  images: {
    // Allow CloudFront domain for image optimization
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.interviewlm.com',
      },
    ],
  },

  typescript: {
    ignoreBuildErrors: !process.env.DATABASE_URL,
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@prisma/client': '@prisma/client',
      });
    }
    return config;
  },
};

export default nextConfig;
```

### 6.3 Cost Optimization for CloudFront

**Data Transfer Pricing (November 2025):**
- First 10 TB: $0.085/GB
- Next 40 TB: $0.080/GB
- Next 100 TB: $0.060/GB

**Optimization Strategy:**
1. Cache assets with hash-based filenames (1 year TTL)
2. Use CloudFront Origin Shield ($0.01/request) to reduce origin load
3. Enable automatic compression (Gzip + Brotli)
4. Use regional edge caches

**Monthly Cost Estimate (100 GB transferred):**
```
100 GB * $0.085 = $8.50
Origin Shield: 1.2M requests * $0.01 = $12.00
Total: ~$20.50/month
```

---

## 7. ENVIRONMENT VARIABLE MANAGEMENT

### 7.1 AWS Systems Manager Parameter Store vs Secrets Manager

| Use Case | Parameter Store | Secrets Manager | Environment Vars |
|----------|-----------------|-----------------|------------------|
| **Database URL** | ✗ (Secret) | ✓ (Recommended) | ✗ (Secret) |
| **API Keys** | ✗ (Secret) | ✓ (Recommended) | ✗ (Secret) |
| **OAuth Credentials** | ✗ (Secret) | ✓ (Recommended) | ✗ (Secret) |
| **Feature Flags** | ✓ (Recommended) | ✗ (Expensive) | ✗ (Not dynamic) |
| **App Settings** | ✓ (Recommended) | ✗ (Expensive) | ~ (Works but static) |
| **Public URLs** | ✓ (Recommended) | ✗ (Expensive) | ~ (Works) |

### 7.2 Recommended Configuration

```yaml
AWS Secrets Manager:
  Secrets:
    - Name: /interviewlm/prod/database-url
      Type: String
      Value: postgresql://user:pass@...
      Rotation: 30 days (optional)

    - Name: /interviewlm/prod/oauth-secrets
      Type: JSON
      Value:
        github_client_secret: ...
        google_client_secret: ...

    - Name: /interviewlm/prod/api-keys
      Type: JSON
      Value:
        anthropic_api_key: ...
        sendgrid_api_key: ...
        aws_s3_secret: ...

AWS Parameter Store:
  Parameters:
    - Name: /interviewlm/prod/app-name
      Type: String
      Value: InterviewLM

    - Name: /interviewlm/prod/log-level
      Type: String
      Value: info
      Tier: Standard (free)

    - Name: /interviewlm/prod/enable-analytics
      Type: String
      Value: "true"

    - Name: /interviewlm/prod/database-pool-size
      Type: String
      Value: "20"
```

### 7.3 ECS Task Definition Integration

```json
{
  "family": "interviewlm-app",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm:latest",
      "portMappings": [{ "containerPort": 3000 }],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:/interviewlm/prod/database-url:PASSWORD::"
        },
        {
          "name": "OAUTH_SECRETS",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:/interviewlm/prod/oauth-secrets"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "LOG_LEVEL",
          "value": "info"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/interviewlm",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 7.4 App Runner Environment Variables

```bash
aws apprunner create-service \
  --service-name interviewlm-staging \
  --source-configuration ImageRepository={ImageIdentifier=123456789.dkr.ecr.us-east-1.amazonaws.com/interviewlm-staging:latest,RepositoryType=ECR} \
  --instance-configuration Cpu=1,Memory=2,InstanceRoleArn=arn:aws:iam::123456789:role/AppRunnerRole \
  --auto-scaling-configuration-arn arn:aws:apprunner:us-east-1:123456789:autoscalingconfiguration/interviewlm-staging/1/c37d6882f84c49e5b82aa7ded5d68ff1 \
  --environment-variables \
    NODE_ENV=staging \
    LOG_LEVEL=debug \
    DATABASE_URL=postgresql://user:pass@staging-db.rds.amazonaws.com/interviewlm
```

---

## 8. HEALTH CHECKS AND MONITORING

### 8.1 ALB Health Checks (Already Configured)

Your Dockerfile includes:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

**Recommended ENhancements:**

1. **Create Health Check Endpoint** (`app/api/health/route.ts`):
```typescript
export async function GET(request: Request) {
  try {
    // Check database connectivity
    const dbCheck = await fetch(`${process.env.DATABASE_URL}`)
      .then(() => true)
      .catch(() => false);

    // Check Redis connectivity
    const redisCheck = await redis.ping()
      .then(() => true)
      .catch(() => false);

    if (dbCheck && redisCheck) {
      return Response.json(
        { status: 'healthy', timestamp: new Date() },
        { status: 200 }
      );
    } else {
      return Response.json(
        { status: 'degraded', db: dbCheck, redis: redisCheck },
        { status: 503 }
      );
    }
  } catch (error) {
    return Response.json(
      { status: 'unhealthy', error: String(error) },
      { status: 503 }
    );
  }
}
```

2. **ALB Health Check Configuration:**
```yaml
Health Check Path: /api/health
Interval: 30 seconds
Timeout: 5 seconds
Healthy Threshold: 2 (consecutive successes)
Unhealthy Threshold: 3 (consecutive failures)
Matcher: 200 (only 200 is healthy)
```

### 8.2 CloudWatch Container Insights

**Enable Container Insights** (low cost, high value):

```bash
# Enable Container Insights for ECS cluster
aws ecs put-cluster-capacity-providers \
  --cluster interviewlm-prod-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=50 capacityProvider=FARGATE_SPOT,weight=50

# Create log group
aws logs create-log-group --log-group-name /ecs/interviewlm-prod

# Enable enhanced monitoring (CloudFormation or CDK)
```

**Key Metrics to Monitor:**

```yaml
CloudWatch Dashboards - InterviewLM Production:

  Application Metrics:
    - ECS Service Desired/Running Count
    - ALB Target Health (healthy/unhealthy)
    - ALB Request Count
    - Response Time (p50, p99)
    - Error Rate (4xx, 5xx)
    - CPU Utilization (avg, max)
    - Memory Utilization (avg, max)

  Worker Metrics:
    - BullMQ Queue Size
    - Queue Processing Time
    - Failed Job Rate

  Database Metrics (RDS):
    - Connection Count
    - Database CPU
    - Database Memory
    - Read/Write Latency

  Cache Metrics (ElastiCache):
    - CPU Utilization
    - Memory Usage
    - Evictions
    - Cache Hit Rate
```

### 8.3 Alerting

```yaml
CloudWatch Alarms:

  - Name: HighCPUUtilization
    Metric: ECSServiceAverageCPUUtilization
    Threshold: >80%
    Duration: 5 minutes
    Action: SNS notification

  - Name: TaskFailureRate
    Metric: ECSTaskCount{status=STOPPED}
    Threshold: >1 task failed
    Duration: 1 minute
    Action: PagerDuty/SNS

  - Name: ALBUnhealthyTargets
    Metric: UnHealthyHostCount
    Threshold: >0
    Duration: 2 minutes
    Action: SNS notification

  - Name: HighMemoryUtilization
    Metric: MemoryUtilization
    Threshold: >85%
    Duration: 10 minutes
    Action: Auto-scale + SNS

  - Name: DatabaseConnectionPoolExhausted
    Metric: DatabaseConnections
    Threshold: >90 connections
    Duration: 5 minutes
    Action: SNS + page on-call
```

### 8.4 X-Ray Distributed Tracing (Optional)

For better debugging, consider enabling X-Ray:

```typescript
// app/api/middlewares/xray.ts
import AWSXRay from 'aws-xray-sdk-core';

// Wrap AWS SDK calls
AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
```

---

## 9. COST OPTIMIZATION FOR STAGING

### 9.1 Recommended Staging Stack

**Use App Runner for Staging:**

**Why App Runner for Staging?**
1. Scale-to-zero when not in use (HUGE savings)
2. Simple deployment (no load balancer costs)
3. Low operational overhead
4. Perfect for intermittent testing

### 9.2 Cost Breakdown - Staging vs Production

```yaml
PRODUCTION MONTHLY COST (ECS Fargate):
  ├─ Fargate Compute (2 vCPU, 4GB, 730h):
  │  ├─ On-demand: 2 * 730h * $0.0704 = $102.78
  │  ├─ Memory: 4 * 730h * $0.0088 = $25.66
  │  └─ With Spot (70% off): ~$38.54
  │
  ├─ ALB (730h):
  │  ├─ ALB capacity: $16.20
  │  └─ LCU charges (1M requests): $12.00
  │
  ├─ CloudFront (100GB transferred):
  │  └─ Data transfer: $8.50
  │
  ├─ RDS PostgreSQL (db.t3.medium, multi-AZ):
  │  └─ ~$200-250/month
  │
  ├─ ElastiCache Redis (cache.t3.micro):
  │  └─ ~$30-40/month
  │
  └─ Total: ~$320-400/month (on-demand)
     Total: ~$200-250/month (with Spot + reserved instances)

STAGING MONTHLY COST (App Runner):
  ├─ App Runner Compute (1 vCPU, 2GB):
  │  ├─ If running 24/7: ~$35-45/month
  │  ├─ If scale-to-zero off-hours: ~$12-18/month ✓
  │
  ├─ Requests: Free (included)
  │
  ├─ CloudFront: $0 (can share production CDN)
  │
  ├─ RDS (same db.t3.micro, single-AZ):
  │  └─ ~$80/month
  │
  ├─ ElastiCache (shared with production):
  │  └─ $0 (included)
  │
  └─ Total: ~$95-125/month (with scale-to-zero)
     Savings vs Production: ~75% ✓
```

### 9.3 Staging Cost Optimization Strategies

#### **Strategy 1: Scale-to-Zero with App Runner (RECOMMENDED)**

```bash
# Enable scale-to-zero
aws apprunner update-auto-scaling-configuration \
  --auto-scaling-configuration-arn arn:aws:apprunner:us-east-1:123456789:autoscalingconfiguration/interviewlm-staging/1/uuid \
  --min-size 1 \
  --max-size 2 \
  --target-cpu-utilization-percentage 70

# App Runner will automatically scale down to 0 after 15 minutes of no requests
# Cost drops from $35/month to $12/month
```

**Result:** Only pay when testing. Typical cost: $12-18/month

#### **Strategy 2: Scheduled Shutdown (for ECS if you prefer)**

If you use ECS for staging, schedule shutdown:

```python
# Lambda function: stop-staging-ecs.py
import boto3
import json

ecs = boto3.client('ecs')

def lambda_handler(event, context):
    # Scale down ECS service to 0 at 6 PM
    ecs.update_service(
        cluster='interviewlm-staging',
        service='interviewlm-app',
        desiredCount=0
    )

    return {
        'statusCode': 200,
        'body': json.dumps('Staging environment scaled down')
    }
```

Then use EventBridge:
```yaml
EventBridge Rule: staging-shutdown
Schedule: cron(0 18 * * MON-FRI) # 6 PM weekdays
Target: Lambda function (stop-staging-ecs)

EventBridge Rule: staging-startup
Schedule: cron(0 8 * * MON-FRI) # 8 AM weekdays
Target: Lambda function (start-staging-ecs)
```

#### **Strategy 3: Shared Database (Staging)**

Use a smaller RDS instance for staging:
```yaml
RDS Staging Configuration:
  Engine: PostgreSQL 16
  Instance Class: db.t3.micro (not multi-AZ)
  Storage: 20 GB (auto-scaling)
  Backup Retention: 7 days (vs 30 for prod)
  Cost: ~$35-50/month (vs $200+ for production)
```

#### **Strategy 4: Fargate Spot for Staging (Alternative)**

If using ECS:
```yaml
ECS Service (Staging):
  Desired Count: 1
  Capacity Provider: FARGATE_SPOT (70% cheaper)
  Cost: ~$20-30/month
  Caveat: Can be interrupted (acceptable for staging)
```

### 9.4 Monthly Cost Comparison

```
Deployment Type        | Monthly Cost | Notes
-----------------------|--------------|--------------------
Prod (ECS on-demand)   | $320-400     | Baseline
Prod (ECS + Spot)      | $200-250     | Recommended prod
Staging (App Runner)   | $12-18       | Scale-to-zero ✓✓✓
Staging (ECS Spot)     | $20-30       | Alternative
Staging (ECS scheduled)| $15-25       | With shutdown automation

Total (Prod + Staging):
  - Best case: $212-268/month (ECS Spot + App Runner)
  - Savings: 87% vs all on-demand
```

---

## 10. DEPLOYMENT CHECKLIST

### 10.1 Infrastructure Setup (Terraform/CDK)

- [ ] VPC with public/private subnets in 3 AZs
- [ ] RDS PostgreSQL in private subnet
- [ ] ElastiCache Redis in private subnet
- [ ] ECS Fargate cluster
- [ ] Application Load Balancer
- [ ] Security groups (ALB → Tasks → RDS/Redis)
- [ ] CloudFront distribution
- [ ] S3 bucket for static assets
- [ ] ECR repository for images
- [ ] CloudWatch log groups
- [ ] IAM roles for ECS tasks
- [ ] Secrets Manager secrets
- [ ] Parameter Store parameters

### 10.2 Application Preparation

- [ ] `/api/health` endpoint implemented
- [ ] Docker image built and tested locally
- [ ] Environment variables documented
- [ ] Database migrations in place
- [ ] Worker configuration reviewed
- [ ] WebSocket endpoints configured
- [ ] Logging configured (CloudWatch)
- [ ] Error tracking setup (optional: Sentry)

### 10.3 Production Deployment

- [ ] ECS task definition created
- [ ] ECS service created with auto-scaling
- [ ] ALB target group health checks passing
- [ ] SSL/TLS certificate provisioned
- [ ] CloudFront cache behaviors configured
- [ ] Route 53 DNS records updated
- [ ] CloudWatch alarms configured
- [ ] Monitoring dashboard created
- [ ] Runbook documentation prepared
- [ ] Backup strategy verified (RDS)

### 10.4 Staging Deployment

- [ ] App Runner service created
- [ ] Staging database configured
- [ ] DNS record for staging.interviewlm.com
- [ ] Auto-scaling to zero configured
- [ ] Cost monitoring enabled
- [ ] Access controls setup (IP whitelist optional)

---

## 11. MIGRATION STRATEGY (Current to AWS)

### Phase 1: Preparation (Week 1-2)
1. Set up AWS accounts (prod + staging)
2. Create VPC and networking
3. Provision RDS and ElastiCache
4. Create ECR repositories
5. Build and push Docker images

### Phase 2: Staging Deployment (Week 2-3)
1. Deploy to App Runner for staging
2. Run integration tests
3. Load testing
4. Team testing and feedback

### Phase 3: Production Deployment (Week 3-4)
1. Deploy ECS service
2. Test auto-scaling
3. Configure monitoring and alarms
4. Blue-green deployment validation
5. Gradual traffic shift to AWS

### Phase 4: Optimization (Week 4+)
1. Monitor costs
2. Tune auto-scaling policies
3. Optimize cache strategies
4. Gather performance metrics
5. Plan for capacity

---

## 12. COST SUMMARY & RECOMMENDATION

### Final Cost Estimate

```
MONTHLY COSTS (Steady State):

Production (ECS Fargate + Spot Mix):
  ├─ ECS Compute: $45-55/month
  ├─ ALB + LCU: $20-30/month
  ├─ RDS (Multi-AZ): $200-250/month
  ├─ ElastiCache: $30-40/month
  ├─ CloudFront: $10-15/month
  └─ Total: $305-390/month

Staging (App Runner + Shared Infra):
  ├─ App Runner: $12-18/month
  ├─ RDS (Micro): $35-50/month
  └─ Total: $47-68/month

TOTAL MONTHLY: $352-458/month ($4,200-5,500/year)
```

### Why This Architecture?

**ECS Fargate for Production:**
- ✓ Excellent auto-scaling for variable load
- ✓ VPC networking (required for workers + database)
- ✓ Cost-effective with Spot instances
- ✓ CloudWatch integration out-of-the-box
- ✓ Handles WebSocket connections well
- ✓ BullMQ workers run reliably

**App Runner for Staging:**
- ✓ Scale-to-zero (75% cheaper when idle)
- ✓ Zero operational overhead
- ✓ Simple GitHub/ECR integration
- ✓ Perfect for intermittent testing
- ✓ No load balancer costs

---

## FINAL RECOMMENDATION

| Aspect | Decision | Justification |
|--------|----------|---------------|
| **Production Compute** | ECS Fargate | Auto-scaling, cost control, complex setup |
| **Production ALB** | Application Load Balancer | ALB required for Next.js + routing |
| **Production Cache** | CloudFront + S3 | Critical for static assets |
| **Production DB** | RDS Multi-AZ | High availability, managed backups |
| **Production Cache (In-App)** | ElastiCache Redis | Required for workers + sessions |
| **Staging Compute** | App Runner | Scale-to-zero saves ~75% |
| **Staging DB** | RDS Micro Single-AZ | Cost reduction acceptable |
| **Environment Vars** | Secrets Manager + Parameter Store | Security + flexibility |
| **Monitoring** | CloudWatch + Container Insights | Native, cost-effective |
| **Cost Optimization** | Fargate Spot + Scheduled scaling | Significant savings without complexity |

---

## References & Documentation

1. **AWS ECS Best Practices**: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/
2. **App Runner Documentation**: https://docs.aws.amazon.com/apprunner/
3. **CloudFront Next.js**: https://aws.amazon.com/blogs/networking-and-content-delivery/
4. **Container Insights**: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html
5. **AWS Secrets Manager**: https://docs.aws.amazon.com/secretsmanager/
6. **ECS Auto-Scaling**: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html

---

## Next Steps

1. **Review & Approval**: Share this document with DevOps/Infrastructure team
2. **Cost Estimation**: Refine costs with AWS Pricing Calculator
3. **Infrastructure as Code**: Create Terraform/CDK templates
4. **Local Testing**: Build and test Docker image locally
5. **Staging First**: Deploy to staging environment first
6. **Monitoring Setup**: Configure CloudWatch dashboards before prod launch
7. **Runbooks**: Create operational runbooks for common tasks

