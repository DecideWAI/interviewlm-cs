# InterviewLM Workers

Background workers for the InterviewLM multi-agent system.

## Architecture

The InterviewLM platform uses an event-driven architecture with BullMQ:

```
API Routes → BullMQ Queues → Background Workers
```

## Workers

### 1. Interview Agent (`interview-agent.ts`)

**Purpose**: Observe candidate progress and adapt interview difficulty

**Consumes**: `interview` queue
**Events**:
- `ai-interaction` - Candidate sends AI chat message
- `code-changed` - Files modified in workspace
- `test-run` - Tests executed
- `question-answered` - Question submitted
- `session-started` - Interview begins
- `session-complete` - Interview ends

**Actions**:
- Track metrics (IRT theta, AI dependency, struggle indicators)
- Update ability estimates
- Recommend difficulty adjustments
- Store metrics in database (NOT exposed to candidates)

**Concurrency**: 10 jobs simultaneously

---

### 2. Evaluation Agent (`evaluation-agent.ts`)

**Purpose**: Score completed interviews with evidence-based evaluation

**Consumes**: `evaluation` queue
**Events**:
- `analyze` - Evaluate completed interview
- `generate-report` - Create detailed report

**Scoring Dimensions**:
1. **Code Quality (40%)** - Tests + Static analysis + LLM review
2. **Problem Solving (25%)** - Iteration patterns + Debugging
3. **AI Collaboration (20%)** - Prompt quality + Effective usage
4. **Communication (15%)** - Prompt clarity + Documentation

**Actions**:
- Multi-method validation (reduces false positives by 25.8%)
- Evidence collection (timestamps + code snippets)
- Bias detection
- Database storage

**Concurrency**: 5 jobs simultaneously

---

## Running Workers

### All Workers

```bash
npm run workers
```

### Individual Workers

```bash
npm run workers:interview    # Interview Agent only
npm run workers:evaluation   # Evaluation Agent only
```

### Development

```bash
npm run workers:dev          # With auto-restart on file changes
```

### Production

```bash
# With PM2 (recommended)
pm2 start workers/index.ts --name interviewlm-workers

# With Docker
docker compose up workers
```

---

## Environment Variables

Required:
- `REDIS_HOST` - Redis hostname (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)
- `DATABASE_URL` - PostgreSQL connection string
- `ANTHROPIC_API_KEY` - Claude API key

Optional:
- `REDIS_DB` - Redis database number (default: 0)
- `WORKER_CONCURRENCY` - Override default concurrency

---

## Monitoring

### Bull Board UI

Access at: `http://localhost:3000/admin/queues`

Features:
- View all queues and job counts
- Inspect failed jobs with stack traces
- Retry failed jobs manually
- Monitor processing times
- View worker status

### Logs

Workers log to stdout in JSON format:

```json
{
  "level": "info",
  "worker": "interview-agent",
  "sessionId": "123",
  "event": "ai-interaction",
  "timestamp": "2025-11-13T10:30:00Z"
}
```

---

## Error Handling

### Automatic Retries

- **Default**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Evaluation**: 5 attempts (critical jobs)
- **Notifications**: 5 attempts with 2s initial delay (rate limits)

### Failed Jobs

Failed jobs are kept for debugging:
- Last 5,000 failures retained
- Inspect via Bull Board UI
- Manual retry available

### Graceful Shutdown

Workers handle SIGTERM/SIGINT:
1. Stop accepting new jobs
2. Complete current jobs
3. Close connections
4. Exit cleanly

---

## Development

### Adding a New Worker

1. Create `workers/my-worker.ts`:

```typescript
import { Worker } from 'bullmq';
import { redisConnection } from '../lib/queues/config';

export function startMyWorker() {
  const worker = new Worker('my-queue', async (job) => {
    // Process job
  }, {
    connection: redisConnection,
    concurrency: 5,
  });

  return worker;
}
```

2. Add to `workers/index.ts`:

```typescript
import { startMyWorker } from './my-worker';

// In startAllWorkers()
const workers = [
  // ...
  startMyWorker(),
];
```

3. Add npm script to `package.json`:

```json
{
  "scripts": {
    "workers:my": "ts-node workers/my-worker.ts"
  }
}
```

---

## Testing

### Unit Tests

```bash
npm test workers/
```

### Integration Tests

```bash
# Requires Redis and PostgreSQL running
npm run test:integration:workers
```

### Load Testing

```bash
# Publish 1000 test events
npm run test:load:workers
```

---

## Scaling

### Horizontal Scaling

Run multiple worker processes:

```bash
# Server 1
npm run workers

# Server 2
npm run workers

# Server 3
npm run workers:evaluation  # Evaluation only
```

BullMQ automatically distributes jobs across all workers.

### Vertical Scaling

Increase concurrency:

```bash
WORKER_CONCURRENCY=20 npm run workers
```

### Queue Prioritization

High-priority evaluations:

```typescript
await publishEvaluationAnalyze({
  sessionId: '123',
  candidateId: '456',
  priority: 1,  // Higher priority
});
```

---

## Troubleshooting

### Worker Not Processing Jobs

1. Check Redis connection:
   ```bash
   redis-cli ping
   ```

2. Verify queue has jobs:
   ```bash
   redis-cli LLEN bull:interview:wait
   ```

3. Check worker logs for errors

### High Memory Usage

- Reduce concurrency
- Enable job result removal:
  ```typescript
  removeOnComplete: true
  ```

### Jobs Stuck in "Active"

- Worker crashed without graceful shutdown
- Restart workers to recover

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│                  Next.js API Routes                   │
│  POST /api/interview/:id/chat                        │
│  POST /api/interview/:id/submit                      │
└────────────────┬─────────────────────────────────────┘
                 │
                 │ (Publishes Events)
                 ▼
┌──────────────────────────────────────────────────────┐
│                   BullMQ + Redis                      │
│  Queues: interview, evaluation, notification         │
└────┬────────────────────┬──────────────────────┬─────┘
     │                    │                      │
     ▼                    ▼                      ▼
┌─────────────┐   ┌───────────────┐   ┌──────────────┐
│ Interview   │   │ Evaluation    │   │ Notification │
│ Agent       │   │ Agent         │   │ Worker       │
│             │   │               │   │              │
│ Observes    │   │ Scores        │   │ Emails       │
│ Tracks      │   │ Analyzes      │   │ Webhooks     │
│ Adapts      │   │ Reports       │   │ Slack        │
└─────────────┘   └───────────────┘   └──────────────┘
```

---

## Cost Optimization

### Model Selection

- **Interview Agent**: Haiku 4.5 ($0.80/$4 per 1M tokens) - 75% cheaper
- **Evaluation Agent**: Sonnet 4.5 ($3/$15 per 1M tokens) - Balance

### Prompt Caching

Enable caching for repeated content:

```typescript
// Interview Agent: Cache question templates
// Evaluation Agent: Cache scoring rubrics
// Savings: Up to 90%
```

### Batch Processing

Evaluation Agent uses batching for 50% cost reduction.

### Per-Interview Cost

- Interview Agent: $0.02
- Evaluation Agent: $0.06
- **Total**: $0.08 per interview (workers only)

---

## Security

### Internal API Access

Workers use internal API keys:

```typescript
headers: {
  'x-internal-api-key': process.env.INTERNAL_API_KEY
}
```

### Data Access

- Interview Agent: Read-only session data
- Evaluation Agent: Full session recording (completed only)
- Candidates: NO access to worker data

### Secrets Management

Never log:
- API keys
- Session tokens
- Candidate PII

---

## Documentation

- [Multi-Agent Architecture](../docs/MULTI_AGENT_ARCHITECTURE.md)
- [BullMQ Queues](../lib/queues/)
- [Event Types](../lib/types/events.ts)
