# Disaster Recovery Runbook

This document outlines recovery procedures for production incidents in InterviewLM.

## Table of Contents

1. [RTO/RPO Targets](#rtorpo-targets)
2. [Cloud SQL Recovery](#cloud-sql-recovery)
3. [Redis/Memorystore Recovery](#redismemorystore-recovery)
4. [Cloud Run Rollback](#cloud-run-rollback)
5. [Secret Rotation](#secret-rotation)
6. [Incident Response](#incident-response)
7. [Contact Information](#contact-information)

---

## RTO/RPO Targets

| Service | RTO (Recovery Time) | RPO (Recovery Point) | Notes |
|---------|---------------------|---------------------|-------|
| Cloud SQL | < 1 hour | < 5 minutes | Point-in-time recovery enabled |
| Redis | < 30 minutes | N/A (cache only) | Rebuild from database |
| Cloud Run | < 5 minutes | N/A (stateless) | Rollback to previous revision |
| Secrets | < 15 minutes | N/A | Manual rotation |

---

## Cloud SQL Recovery

### Automated Backups

Cloud SQL performs automated daily backups with 7-day retention.

**View available backups:**
```bash
gcloud sql backups list --instance=interviewlm-db
```

### Restore from Backup

**Option 1: Restore to same instance (in-place)**
```bash
# List backups
gcloud sql backups list --instance=interviewlm-db

# Restore from specific backup
gcloud sql backups restore BACKUP_ID \
  --restore-instance=interviewlm-db \
  --backup-instance=interviewlm-db
```

**Option 2: Restore to new instance (recommended for safety)**
```bash
# Create new instance from backup
gcloud sql instances clone interviewlm-db interviewlm-db-restored \
  --point-in-time "2024-01-15T10:00:00.000Z"

# Verify data integrity on new instance
# Update DATABASE_URL in Secret Manager
# Restart Cloud Run services
```

### Point-in-Time Recovery

Recover to any point within the retention window:

```bash
# Clone to specific timestamp
gcloud sql instances clone interviewlm-db interviewlm-db-pitr \
  --point-in-time "2024-01-15T10:30:00.000Z"
```

### Post-Recovery Steps

1. Verify data integrity with spot checks
2. Update `DATABASE_URL` in Secret Manager if using new instance
3. Restart Cloud Run services: `gcloud run services update interviewlm-app --region=us-central1`
4. Clear Redis cache (stale references)
5. Verify health check passes: `curl https://your-app.run.app/api/health`

---

## Redis/Memorystore Recovery

Redis is used for caching and job queues (BullMQ). Since we use BASIC tier without persistence, data loss is expected on restart.

### Cache Rebuild Strategy

Cache entries will auto-populate on next read. No manual action required.

### Job Queue Recovery

**Step 1: Check for stuck jobs**
```bash
# View queue health
curl https://your-app.run.app/api/health/workers
```

**Step 2: Clear failed jobs (if needed)**
```bash
# Access the admin DLQ endpoint
curl -X POST https://your-app.run.app/api/admin/dlq/retry-all \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Step 3: Manual job replay (if data in DLQ)**
```bash
# List failed jobs
curl https://your-app.run.app/api/admin/dlq \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Retry specific job
curl -X POST https://your-app.run.app/api/admin/dlq/retry \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "job-id-here"}'
```

### Memorystore Restart

If Redis needs restart:

```bash
# Failover (if HA tier)
gcloud redis instances failover interviewlm-redis --region=us-central1

# Or restart (BASIC tier - causes data loss)
gcloud redis instances update interviewlm-redis \
  --region=us-central1 \
  --update-labels=restart=$(date +%s)
```

---

## Cloud Run Rollback

### View Revision History

```bash
# List revisions for app service
gcloud run revisions list --service=interviewlm-app --region=us-central1

# List revisions for worker service
gcloud run revisions list --service=interviewlm-worker --region=us-central1
```

### Rollback to Previous Revision

**Immediate rollback (100% traffic):**
```bash
# Rollback app
gcloud run services update-traffic interviewlm-app \
  --region=us-central1 \
  --to-revisions=interviewlm-app-REVISION_ID=100

# Rollback worker
gcloud run services update-traffic interviewlm-worker \
  --region=us-central1 \
  --to-revisions=interviewlm-worker-REVISION_ID=100
```

**Canary rollback (gradual):**
```bash
# Send 10% to old revision first
gcloud run services update-traffic interviewlm-app \
  --region=us-central1 \
  --to-revisions=interviewlm-app-REVISION_ID=10,LATEST=90

# Verify stability, then increase
```

### Force New Deployment

If current revision is stuck:

```bash
# Force redeploy from latest image
gcloud run deploy interviewlm-app \
  --image=us-central1-docker.pkg.dev/PROJECT/interviewlm/app:latest \
  --region=us-central1
```

---

## Secret Rotation

### List All Secrets

```bash
gcloud secrets list --filter="labels.app=interviewlm"
```

### Rotate Database Password

```bash
# 1. Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Update Cloud SQL user
gcloud sql users set-password postgres \
  --instance=interviewlm-db \
  --password="$NEW_PASSWORD"

# 3. Update secret
echo "postgresql://postgres:$NEW_PASSWORD@/interviewlm?host=/cloudsql/PROJECT:REGION:interviewlm-db" | \
  gcloud secrets versions add DATABASE_URL --data-file=-

# 4. Restart services (pick up new secret)
gcloud run services update interviewlm-app --region=us-central1
gcloud run services update interviewlm-worker --region=us-central1
```

### Rotate API Keys

**Anthropic API Key:**
```bash
# 1. Generate new key in Anthropic Console
# 2. Update secret
echo "sk-ant-new-key-here" | \
  gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-

# 3. Restart services
gcloud run services update interviewlm-app --region=us-central1
```

**NextAuth Secret:**
```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# 2. Update secret
echo "$NEW_SECRET" | \
  gcloud secrets versions add NEXTAUTH_SECRET --data-file=-

# 3. Restart services (will invalidate all sessions)
gcloud run services update interviewlm-app --region=us-central1
```

### Emergency Key Revocation

If a key is compromised:

1. Immediately generate and deploy new key (steps above)
2. Revoke old key in the respective service console (Anthropic, Paddle, etc.)
3. Audit logs for unauthorized usage
4. Document incident in post-mortem

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 - Critical | Complete outage | < 15 min | Database down, app unreachable |
| P1 - High | Major feature broken | < 1 hour | Payments failing, interviews broken |
| P2 - Medium | Degraded performance | < 4 hours | Slow responses, partial failures |
| P3 - Low | Minor issues | < 24 hours | UI bugs, non-critical errors |

### Incident Response Steps

**1. Acknowledge**
- Acknowledge alert in monitoring system
- Post in #incidents channel: "Investigating [brief description]"

**2. Assess**
- Check health endpoint: `curl https://app/api/health`
- Review Cloud Logging: `gcloud logging read "resource.type=cloud_run_revision"`
- Check Sentry for errors

**3. Mitigate**
- If code issue: Rollback to previous revision
- If database issue: Check Cloud SQL status, consider PITR
- If Redis issue: Restart/rebuild cache
- If external service: Enable circuit breaker, notify users

**4. Communicate**
- Update status page (if applicable)
- Post updates every 30 minutes during P0/P1

**5. Resolve**
- Verify fix in production
- Update monitoring thresholds if needed
- Schedule post-mortem for P0/P1 incidents

### Post-Mortem Template

```markdown
## Incident Post-Mortem: [Title]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P0/P1/P2/P3
**Author:** [Name]

### Summary
[1-2 sentence summary of what happened]

### Timeline
- HH:MM - [Event]
- HH:MM - [Event]

### Root Cause
[What caused the incident]

### Impact
- Users affected: X
- Revenue impact: $X
- Data loss: Yes/No

### Resolution
[How was it fixed]

### Action Items
- [ ] [Improvement 1] - Owner - Due date
- [ ] [Improvement 2] - Owner - Due date

### Lessons Learned
[What we learned]
```

---

## Contact Information

### On-Call

| Role | Contact | Escalation |
|------|---------|------------|
| Primary | TBD | Slack #incidents |
| Secondary | TBD | Phone call |
| Engineering Lead | TBD | SMS |

### External Services

| Service | Support Link | Account Email |
|---------|--------------|---------------|
| GCP | console.cloud.google.com/support | admin@company.com |
| Anthropic | support.anthropic.com | admin@company.com |
| Paddle | paddle.com/help | admin@company.com |
| Modal | modal.com/support | admin@company.com |
| Sentry | sentry.io/support | admin@company.com |

---

## Appendix: Common Commands

```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=interviewlm-app" --limit=100

# View worker logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=interviewlm-worker" --limit=100

# Check Cloud SQL status
gcloud sql instances describe interviewlm-db

# Check Memorystore status
gcloud redis instances describe interviewlm-redis --region=us-central1

# List recent deployments
gcloud run revisions list --service=interviewlm-app --region=us-central1 --limit=5

# Force service restart
gcloud run services update interviewlm-app --region=us-central1 --no-traffic
gcloud run services update-traffic interviewlm-app --region=us-central1 --to-latest
```
