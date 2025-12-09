# InterviewLM Infrastructure Architecture

## Overview

InterviewLM is deployed on Google Cloud Platform (GCP) using a modern, scalable architecture designed for reliability, security, and cost-efficiency.

## Architecture Diagram

```
                                    ┌─────────────────────────────────────────┐
                                    │              Internet                    │
                                    └────────────────────┬────────────────────┘
                                                         │
                                                         ▼
                              ┌──────────────────────────────────────────────────┐
                              │              Google Cloud Load Balancer           │
                              │         (HTTPS termination, DDoS protection)      │
                              └──────────────────────────────────────────────────┘
                                                         │
                    ┌────────────────────────────────────┼────────────────────────────────────┐
                    │                                    │                                    │
                    ▼                                    ▼                                    ▼
    ┌───────────────────────────┐    ┌───────────────────────────┐    ┌───────────────────────────┐
    │      Cloud Run (App)       │    │    Cloud Run (Workers)     │    │    Cloud CDN (Static)     │
    │  ┌─────────────────────┐  │    │  ┌─────────────────────┐  │    │                           │
    │  │   Next.js 15 App    │  │    │  │   BullMQ Workers    │  │    │    Static assets cached   │
    │  │   (Auto-scaling)    │  │    │  │   (Background Jobs) │  │    │    at edge locations      │
    │  └─────────────────────┘  │    │  └─────────────────────┘  │    │                           │
    └───────────────────────────┘    └───────────────────────────┘    └───────────────────────────┘
                    │                                    │
                    │         VPC Network (Private)      │
    ┌───────────────┴────────────────────────────────────┴───────────────┐
    │                                                                      │
    │   ┌───────────────────┐    ┌───────────────────┐    ┌─────────────┐ │
    │   │  VPC Connector    │    │   Cloud NAT       │    │  Firewall   │ │
    │   │  (Serverless)     │    │   (Egress)        │    │   Rules     │ │
    │   └─────────┬─────────┘    └───────────────────┘    └─────────────┘ │
    │             │                                                        │
    │   ┌─────────┴─────────────────────────────────────────────────────┐ │
    │   │                    Private Service Access                      │ │
    │   │                                                                │ │
    │   │    ┌─────────────────────┐    ┌─────────────────────┐        │ │
    │   │    │   Cloud SQL         │    │   Memorystore       │        │ │
    │   │    │   PostgreSQL 16     │    │   Redis 7           │        │ │
    │   │    │                     │    │                     │        │ │
    │   │    │   • Multi-zone HA   │    │   • Standard HA     │        │ │
    │   │    │   • Auto backups    │    │   • RDB persistence │        │ │
    │   │    │   • PITR enabled    │    │   • Auth enabled    │        │ │
    │   │    └─────────────────────┘    └─────────────────────┘        │ │
    │   │                                                                │ │
    │   └────────────────────────────────────────────────────────────────┘ │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────┐
    │                        Supporting Services                            │
    │                                                                      │
    │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
    │   │  Cloud Storage  │  │ Secret Manager  │  │ Cloud Monitoring│    │
    │   │                 │  │                 │  │                 │    │
    │   │ • Sessions      │  │ • API keys      │  │ • Dashboards    │    │
    │   │ • Artifacts     │  │ • DB passwords  │  │ • Alerts        │    │
    │   │ • Lifecycle     │  │ • OAuth secrets │  │ • Uptime checks │    │
    │   └─────────────────┘  └─────────────────┘  └─────────────────┘    │
    │                                                                      │
    │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
    │   │Artifact Registry│  │    Cloud IAM    │  │  Cloud Logging  │    │
    │   │                 │  │                 │  │                 │    │
    │   │ • Docker images │  │ • Service accts │  │ • App logs      │    │
    │   │ • Vulnerability │  │ • Workload ID   │  │ • Audit logs    │    │
    │   │   scanning      │  │ • Least priv    │  │ • 90-day retain │    │
    │   └─────────────────┘  └─────────────────┘  └─────────────────┘    │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘

                              External Services
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
    │   │  Anthropic  │  │    Modal    │  │   Resend    │  │  Paddle   │ │
    │   │  Claude API │  │   Sandbox   │  │   Email     │  │ Payments  │ │
    │   └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │
    │                                                                      │
    │   ┌─────────────┐  ┌─────────────┐                                  │
    │   │  LangSmith  │  │   GitHub    │                                  │
    │   │  Tracing    │  │   OAuth     │                                  │
    │   └─────────────┘  └─────────────┘                                  │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Compute Layer

#### Cloud Run (Application)
- **Service**: Next.js 15 application
- **Scaling**: 0-20 instances (prod), 0-2 instances (dev)
- **Resources**: 4 vCPU, 2GB RAM (prod)
- **Features**:
  - Auto-scaling based on request load
  - Scale to zero capability (dev/staging)
  - Gen2 execution environment
  - WebSocket support for real-time features

#### Cloud Run (Workers)
- **Service**: BullMQ background job processors
- **Jobs**:
  - Interview Agent (monitors AI interactions)
  - Evaluation Agent (generates reports)
  - Question Generator (dynamic question creation)
- **Scaling**: 2-10 instances (prod)
- **Features**:
  - Always-on for job processing
  - Long timeout (1 hour) for evaluations

### Data Layer

#### Cloud SQL PostgreSQL
- **Version**: PostgreSQL 16
- **Configuration**:
  - Production: Multi-zone HA (REGIONAL)
  - 2 vCPU, 4GB RAM (customizable)
  - SSD storage with auto-resize
- **Backups**:
  - Daily automated backups
  - Point-in-time recovery (14-day retention)
  - 30 retained backup snapshots
- **Security**:
  - Private IP only (no public access)
  - Encryption at rest and in transit
  - Deletion protection enabled

#### Memorystore Redis
- **Version**: Redis 7.0
- **Configuration**:
  - Production: Standard HA with replica
  - 5GB memory (configurable)
  - RDB persistence (hourly snapshots)
- **Use Cases**:
  - Session caching
  - BullMQ job queue
  - Rate limiting
  - Question fingerprints
- **Security**:
  - AUTH enabled
  - Transit encryption (TLS)
  - Private networking only

### Storage Layer

#### Cloud Storage
- **Buckets**:
  - Sessions: Interview recordings, code snapshots
  - Artifacts: Test results, terminal logs
- **Lifecycle**:
  - Standard → Nearline (30 days)
  - Nearline → Coldline (90 days)
  - Coldline → Archive (365 days)
- **Security**:
  - Uniform bucket-level access
  - Public access prevention enforced
  - Object versioning enabled

### Networking

#### VPC Network
- **CIDR Ranges**:
  - Dev: 10.0.0.0/20
  - Staging: 10.1.0.0/20
  - Prod: 10.2.0.0/20
- **Features**:
  - Private Google Access
  - VPC Flow Logs enabled
  - Isolated environments

#### VPC Access Connector
- **Purpose**: Connect Cloud Run to VPC resources
- **Configuration**:
  - e2-standard-4 machines (prod)
  - 2-10 instances
  - /28 CIDR range

#### Cloud NAT
- **Purpose**: Outbound internet access for private resources
- **Configuration**:
  - Auto-allocated external IPs
  - Error-only logging

#### Private Service Access
- **Purpose**: Private connectivity to managed services
- **Services**:
  - Cloud SQL
  - Memorystore

### Security

#### Secret Manager
- **Secrets Stored**:
  - Database credentials
  - Redis AUTH string
  - API keys (Anthropic, Modal, etc.)
  - OAuth secrets
  - Webhook secrets
- **Features**:
  - Automatic rotation support
  - Version history
  - IAM-based access control

#### IAM Service Accounts
- **Cloud Run SA**:
  - cloudsql.client
  - secretmanager.secretAccessor
  - storage.objectAdmin
  - logging.logWriter
  - cloudtrace.agent
  - monitoring.metricWriter
- **CI/CD SA**:
  - run.admin
  - artifactregistry.writer
  - secretmanager.viewer
  - storage.admin

#### Workload Identity Federation
- **Purpose**: Keyless authentication for GitHub Actions
- **Configuration**:
  - GitHub OIDC provider
  - Repository-scoped access
  - No long-lived credentials

### Monitoring & Observability

#### Cloud Monitoring
- **Dashboards**:
  - Request count and latency
  - Database CPU and memory
  - Redis memory usage
- **Alert Policies**:
  - High error rate (>1% in prod)
  - High latency (P99 >2s)
  - Database CPU (>70%)
  - Uptime check failures

#### Cloud Logging
- **Log Sources**:
  - Cloud Run application logs
  - Database slow query logs
  - Audit logs
- **Retention**:
  - Dev: 30 days
  - Staging: 60 days
  - Prod: 90 days

#### Cloud Trace
- **Purpose**: Distributed tracing
- **Integration**: Automatic for Cloud Run

## Environment Comparison

| Aspect | Development | Staging | Production |
|--------|-------------|---------|------------|
| **App Instances** | 0-2 | 0-5 | 2-20 |
| **App Resources** | 1 vCPU, 512MB | 2 vCPU, 1GB | 4 vCPU, 2GB |
| **Workers** | Disabled | 1-3 | 2-10 |
| **Database** | db-f1-micro | db-g1-small | db-custom-2-4096 |
| **DB HA** | Single zone | Single zone | Multi-zone |
| **Redis** | 1GB Basic | 1GB Basic | 5GB Standard HA |
| **Backups** | 3 retained | 7 retained | 30 retained |
| **PITR** | Disabled | Enabled | Enabled (14 days) |
| **Deletion Protection** | Disabled | Enabled | Enabled |
| **Alerts** | Disabled | Enabled | Enabled |
| **Alert Thresholds** | Relaxed | Moderate | Strict |
| **Monthly Cost** | $50-100 | $100-200 | $400-800 |

## Data Flow

### User Request Flow
```
User → Load Balancer → Cloud Run (App) → Database/Redis
                                      ↘ External APIs (Anthropic, Modal)
```

### Background Job Flow
```
App → Redis (BullMQ) → Cloud Run (Worker) → Database
                                          ↘ External APIs
                                          ↘ Cloud Storage
```

### Session Recording Flow
```
App → Cloud Storage (Sessions) ← Worker (Evaluation)
                              ← Admin Dashboard (Review)
```

## Disaster Recovery

### Database
- **RPO**: <5 minutes (with PITR)
- **RTO**: <30 minutes
- **Recovery**: Point-in-time restore or backup restore

### Redis
- **RPO**: <1 hour (RDB snapshots)
- **RTO**: <15 minutes (automatic failover with HA)
- **Recovery**: Automatic with Standard HA tier

### Storage
- **RPO**: 0 (object versioning)
- **RTO**: <5 minutes
- **Recovery**: Restore previous object version

## Cost Optimization

### Scale to Zero
- Dev and staging scale to zero when idle
- Production maintains minimum instances for latency

### Committed Use Discounts
- Consider CUDs for steady-state production workloads
- 1-year or 3-year commitments for 30-50% savings

### Storage Lifecycle
- Automatic tiering reduces storage costs
- 90% cost reduction after 1 year (Archive tier)

### Right-Sizing
- Monitor actual usage and adjust resources
- Use Cloud Monitoring recommendations

## Security Best Practices

1. **Zero Trust**: All services require authentication
2. **Least Privilege**: Minimal IAM permissions
3. **Private Networking**: No public IPs on data services
4. **Encryption**: At rest and in transit
5. **Secret Management**: No hardcoded credentials
6. **Audit Logging**: Full activity tracking
7. **Deletion Protection**: Prevent accidental data loss
