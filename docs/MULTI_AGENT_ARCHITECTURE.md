# Multi-Agent Architecture for InterviewLM

**Version**: 2.0 (Event-Driven)
**Last Updated**: 2025-11-13
**Status**: Production Architecture

---

## Executive Summary

InterviewLM uses an **event-driven multi-agent architecture** powered by BullMQ and Redis. This approach is simpler, more scalable, and more cost-effective than traditional orchestrator patterns.

### Key Principles

- **KISS (Keep It Simple, Stupid)**: Event-driven pub/sub instead of complex orchestration
- **DRY (Don't Repeat Yourself)**: Shared types, utilities, and agent configurations
- **Separation of Concerns**: Each agent is an independent worker with specific responsibilities
- **Security Through Simplicity**: Role-based API access control prevents unauthorized access
- **Zero Orchestrator Overhead**: No parent agent burning tokens to coordinate

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Next.js API Routes                        │
│                                                               │
│  Candidate-Facing (role: "candidate"):                       │
│    POST /api/interview/:id/chat       → Coding Agent         │
│    POST /api/interview/:id/execute    → Run code/tests       │
│    POST /api/interview/:id/submit     → Complete interview   │
│    GET  /api/interview/:id/status     → Session status       │
│                                                               │
│  Internal-Only (role: "internal"):                           │
│    GET  /api/internal/interview/:id/session-data             │
│    POST /api/internal/interview/:id/adjust-difficulty        │
│    POST /api/internal/evaluation/:id/analyze                 │
│                                                               │
│  Role Enforcement:                                            │
│    - Middleware checks session.role                          │
│    - Candidates can ONLY access their own session            │
│    - Internal APIs return 403 for candidates                 │
└─────────────────┬────────────────────────────────────────────┘
                  │
                  │ (Publishes Events)
                  ▼
┌──────────────────────────────────────────────────────────────┐
│                    BullMQ + Redis                             │
│                                                               │
│  Queues:                                                      │
│    interview:ai-interaction     → Interview Agent            │
│    interview:code-changed       → Interview Agent            │
│    interview:test-run           → Interview Agent            │
│    interview:question-answered  → Interview Agent            │
│    interview:adjust-difficulty  → Question Generator         │
│    interview:session-complete   → Evaluation Agent           │
│    evaluation:analyze           → Evaluation Agent           │
│    notification:send            → Notification Worker        │
│                                                               │
│  Features:                                                    │
│    - Automatic retries (exponential backoff)                 │
│    - Job persistence (survives restarts)                     │
│    - Priority queues                                          │
│    - Rate limiting                                            │
│    - Bull Board UI for monitoring                            │
└────┬──────────────┬──────────────┬──────────────┬────────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Interview │  │Evaluation│  │Question  │  │Notifica- │
│Agent     │  │Agent     │  │Generator │  │tion      │
│Worker    │  │Worker    │  │Worker    │  │Worker    │
│          │  │          │  │          │  │          │
│Observes  │  │Scores    │  │Adapts    │  │Emails    │
│Tracks    │  │Analyzes  │  │Generates │  │Webhooks  │
│Monitors  │  │Reports   │  │Questions │  │Slack     │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

## Three Specialized Agents

### 1. Coding Agent (Inline, Real-Time)

**Purpose**: Help candidates solve coding problems with AI assistance

**Execution**: Inline (runs in API route, responds immediately)

**Visibility**: Fully visible to candidates

**Access**:
- ✅ Candidate workspace files
- ✅ Test runner
- ✅ Package manager (npm, pip)
- ❌ Evaluation metrics
- ❌ Interview parameters
- ❌ Candidate scores

**Tools**:
- `Read` - Read files from workspace
- `Write` - Create new files
- `Edit` - Modify existing files
- `Grep` - Search file contents
- `Glob` - Find files by pattern
- `Bash` - Execute commands (validated for security)
- `run_tests` - Execute test suite (custom tool)

**Configurable Helpfulness Levels**:

| Level | Read | Write | Edit | Bash | Tests | Use Case |
|-------|------|-------|------|------|-------|----------|
| **Consultant** | ✅ | ❌ | ❌ | ❌ | ✅ | Senior roles - evaluate independence |
| **Pair Programming** | ✅ | ✅ | ✅ | Limited | ✅ | Default - realistic AI collaboration |
| **Full Co-Pilot** | ✅ | ✅ | ✅ | ✅ | ✅ | Junior roles - evaluate delegation |

**Implementation**: `lib/agents/coding-agent.ts`

---

### 2. Interview Agent (Background Worker)

**Purpose**: Observe candidate progress and adapt interview difficulty

**Execution**: Background worker (processes events asynchronously)

**Visibility**: Completely hidden from candidates

**Access**:
- ✅ Session metrics (read-only)
- ✅ Progress tracking data
- ✅ Question seeds and templates
- ✅ IRT (Item Response Theory) parameters
- ❌ Direct candidate communication
- ❌ Coding Agent responses

**Tools**:
- `ObserveProgress` - Read session data without modifying
- `TrackMetrics` - Log metrics to database
- `AdjustDifficulty` - Update IRT theta estimate
- `GenerateQuestion` - Create next question based on performance

**Events Consumed**:
- `interview:ai-interaction` - After each AI chat message
- `interview:code-changed` - When files are modified
- `interview:test-run` - When tests are executed
- `interview:question-answered` - When candidate submits answer

**Metrics Tracked** (stored in DB, NOT exposed to candidate):
- `estimatedAbility` (IRT θ) - Ability estimate from -3 to +3
- `questionsAnswered` - Number of questions completed
- `strugglingIndicators` - Array of struggle signals (timeout, excessive hints, etc.)
- `recommendedNextDifficulty` - Suggested difficulty for next question
- `averageResponseTime` - Time taken per question
- `aiDependencyScore` - How much candidate relies on AI

**Implementation**: `workers/interview-agent.ts`

---

### 3. Evaluation Agent (Post-Interview Worker)

**Purpose**: Score completed interviews with evidence-based evaluation

**Execution**: Background worker (triggered on interview completion)

**Visibility**: Results visible to hiring team only

**Access**:
- ✅ Full session recording (all data)
- ✅ All code snapshots with timestamps
- ✅ All AI interactions (prompts + responses)
- ✅ All test results
- ✅ All terminal commands
- ❌ Candidate's ongoing interview (only completed sessions)

**Tools**:
- `AnalyzeCode` - Static analysis (ESLint, Pylint, complexity metrics)
- `ScorePromptQuality` - LLM-based prompt evaluation (G-Eval framework)
- `DetectPatterns` - Identify problem-solving patterns
- `CalculateMetrics` - Code quality metrics (cyclomatic complexity, test coverage)
- `DetectBias` - Test for scoring biases
- `GenerateReport` - Create structured JSON + HTML report

**4-Dimension Scoring Framework**:

1. **Code Quality (40%)**
   - Test results (pass/fail, coverage)
   - Static analysis (linting errors, code smells)
   - LLM code review (readability, maintainability)
   - **Evidence Required**: 3+ specific examples with line numbers

2. **Problem Solving (25%)**
   - Iteration patterns (incremental progress vs random changes)
   - Debugging approach (systematic vs trial-and-error)
   - Algorithm efficiency (time/space complexity)
   - **Evidence Required**: Specific code snapshots showing progression

3. **AI Collaboration (20%)** ⭐ **UNIQUE**
   - Prompt quality (clarity, specificity, context)
   - Effective AI usage (knows when to use AI vs solve independently)
   - Code review of AI suggestions (accepts blindly vs validates)
   - **Evidence Required**: Specific prompts with quality scores

4. **Communication (15%)**
   - Prompt clarity and structure
   - Code documentation
   - Commit messages (if applicable)
   - **Evidence Required**: Specific examples with timestamps

**Multi-Method Validation** (Reduces False Positives by 25.8%):
- Use multiple analysis methods (static analysis + tests + LLM)
- Require agreement between methods for high scores
- Include confidence score (0-1) for every metric
- Flag disagreements for human review

**Implementation**: `workers/evaluation-agent.ts`

---

## Event Flow Examples

### Example 1: Candidate Sends AI Chat Message

```
1. POST /api/interview/123/chat
   ├─ Middleware: checkRole(['candidate'])
   ├─ Verify candidate owns session 123
   └─ Pass ✅

2. Coding Agent (Inline)
   ├─ Create Claude SDK agent with tools [Read, Write, Edit, run_tests]
   ├─ Send message: "How do I fix this error?"
   ├─ Agent reads file, suggests fix
   └─ Response: "The error is on line 42..."

3. Publish Event to BullMQ (Non-Blocking)
   └─ interviewQueue.add('ai-interaction', {
        sessionId: '123',
        timestamp: '2025-11-13T10:30:00Z',
        candidateMessage: 'How do I fix this error?',
        aiResponse: 'The error is on line 42...',
        toolsUsed: ['Read'],
        filesModified: []
      })

4. Return Response to Candidate
   └─ { response: "The error is on line 42..." }

--- Background (Asynchronous) ---

5. Interview Agent Worker picks up event
   ├─ Analyze: Candidate asked clarifying question (good sign)
   ├─ Update metrics: aiInteractionsCount++
   ├─ Calculate: aiDependencyScore based on interaction frequency
   ├─ Store in DB (NOT sent to candidate)
   └─ Job complete

Total Response Time to Candidate: ~2 seconds
Interview Agent processing: Happens in background (0 user-perceived delay)
```

---

### Example 2: Candidate Submits Interview

```
1. POST /api/interview/123/submit
   ├─ Middleware: checkRole(['candidate'])
   ├─ Verify candidate owns session 123
   └─ Pass ✅

2. Mark Interview as Complete
   ├─ Update status: 'completed'
   ├─ Store final snapshot
   └─ Return: { success: true, message: 'Interview submitted' }

3. Publish Event to BullMQ
   └─ evaluationQueue.add('analyze', {
        sessionId: '123',
        priority: 1  // High priority
      })

4. Return Response to Candidate
   └─ "Thank you! Your interview has been submitted."

--- Background (Asynchronous) ---

5. Evaluation Agent Worker picks up job
   ├─ Fetch full session recording (internal API)
   ├─ Run static analysis (ESLint, Pylint)
   ├─ Calculate code quality metrics
   ├─ LLM-based prompt quality scoring
   ├─ Multi-method validation
   ├─ Generate evidence-based report
   ├─ Store evaluation in DB
   └─ Publish 'evaluation-complete' event

6. Notification Worker picks up event
   ├─ Send email to hiring team
   ├─ Trigger webhook (if configured)
   └─ Job complete

Total Response Time to Candidate: ~500ms
Evaluation processing: 20-30 seconds (happens in background)
```

---

## Security & Isolation

### Role-Based Access Control

```typescript
// lib/auth/roles.ts
export type Role = 'candidate' | 'internal' | 'admin';

export const ROLE_PERMISSIONS = {
  candidate: [
    'POST /api/interview/:id/chat',
    'POST /api/interview/:id/execute',
    'POST /api/interview/:id/submit',
    'GET /api/interview/:id/status'
  ],

  internal: [
    'GET /api/internal/interview/:id/session-data',
    'POST /api/internal/interview/:id/adjust-difficulty',
    'GET /api/internal/interview/:id/full-recording',
    'POST /api/internal/evaluation/:id/analyze'
  ],

  admin: ['*']
};
```

### Isolation Guarantees

| Agent | Can Access | Cannot Access |
|-------|------------|---------------|
| **Coding Agent** | Workspace files, tests, package manager | Evaluation data, interview params, other sessions |
| **Interview Agent** | Session metrics (read-only), question seeds | Candidate's AI chat, other sessions, evaluation results |
| **Evaluation Agent** | Full session recording (completed only) | Ongoing sessions, other candidates' data |

**Enforcement Layers**:
1. **API Middleware**: Role check before route handler
2. **Session Ownership**: Candidates can only access their own session
3. **Database Policies**: Row-level security (future: Postgres RLS)
4. **Agent Tool Permissions**: `canUseTool` callbacks restrict tool usage
5. **Audit Logging**: All API calls and tool usage logged

---

## Technology Stack

### Core Infrastructure
- **Queue**: BullMQ 5.x
- **Cache/Store**: Redis 7.x (for BullMQ and session caching)
- **Database**: PostgreSQL + Prisma ORM
- **API**: Next.js 15 API Routes (App Router)

### Agent Framework
- **SDK**: Claude Agent SDK (Python & TypeScript)
- **Models**:
  - Coding Agent: Claude Sonnet 4.5 ($3/$15 per 1M tokens)
  - Interview Agent: Claude Haiku 4.5 ($0.80/$4 per 1M tokens)
  - Evaluation Agent: Claude Sonnet 4.5 ($3/$15 per 1M tokens)

### Monitoring & Observability
- **Queue Monitoring**: Bull Board (web UI)
- **Metrics**: OpenTelemetry (future)
- **Logging**: Winston + structured JSON logs
- **APM**: Sentry (error tracking)

---

## Cost Analysis

### Per-Interview Costs (Optimized with Caching)

```typescript
const costs = {
  codingAgent: {
    model: 'sonnet-4.5',
    avgMessages: 20,
    avgTokensInput: 2000,
    avgTokensOutput: 1000,
    cachingEnabled: true,  // Cache tool definitions, problem statement
    cost: '$0.15'
  },

  interviewAgent: {
    model: 'haiku-4.5',
    avgCalls: 5,  // Only at decision points
    avgTokensInput: 1000,
    avgTokensOutput: 500,
    cachingEnabled: true,
    cost: '$0.02'
  },

  evaluationAgent: {
    model: 'sonnet-4.5',
    avgTokensInput: 10000,  // Full session recording
    avgTokensOutput: 3000,   // Detailed report
    batchProcessing: true,   // 50% savings
    cost: '$0.06'
  },

  infrastructure: {
    redis: '$0.01',  // Shared across all interviews
    compute: '$0.01'  // Next.js API routes (Vercel/AWS)
  },

  total: '$0.25 per interview'
};

// Monthly Costs at Scale:
// - 50 interviews/month: $12.50
// - 500 interviews/month: $125
// - 5,000 interviews/month: $1,250

// Revenue (at $15/interview):
// - 50 interviews: $750 (95% margin)
// - 500 interviews: $7,500 (98% margin)
// - 5,000 interviews: $75,000 (98% margin)
```

**Cost Optimization Techniques**:
- ✅ Prompt caching (90% savings on repeated content)
- ✅ Batch processing for evaluation (50% savings)
- ✅ Haiku for simple tasks (75% cheaper than Sonnet)
- ✅ Event-driven architecture (no orchestrator overhead)
- ✅ Context isolation (only load relevant data)

---

## Scaling & Performance

### Horizontal Scaling

```bash
# Add more workers as traffic grows
# Each worker process can handle N concurrent jobs

# Server 1 (Coding + Interview)
npm run worker:interview --concurrency=20

# Server 2 (Evaluation)
npm run worker:evaluation --concurrency=10

# Server 3 (Notifications)
npm run worker:notification --concurrency=50

# BullMQ automatically distributes jobs across workers
```

### Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| API Response Time | <2s | TBD |
| Event Processing Latency | <500ms | TBD |
| Evaluation Completion | <30s | TBD |
| Concurrent Sessions | 100+ | TBD |
| Queue Throughput | 1000+ jobs/min | TBD |

### Bottleneck Mitigation

1. **Redis Memory**: Use Redis Cluster for >10GB data
2. **Claude API Rate Limits**: Implement exponential backoff + retries
3. **Database Connections**: Use Prisma connection pooling
4. **File Storage**: Use S3 for code snapshots (not DB)

---

## Implementation Roadmap

### ✅ Phase 1: Foundation (Week 1-2)
- [x] Architecture documentation
- [ ] Install BullMQ + Redis
- [ ] Create shared types (`lib/types/`)
- [ ] Implement role-based middleware (`lib/middleware/auth.ts`)
- [ ] Set up BullMQ queues (`lib/queues/`)
- [ ] Create Coding Agent (`lib/agents/coding-agent.ts`)
- [ ] Build chat API endpoint (`app/api/interview/[id]/chat/route.ts`)

### Phase 2: Interview Agent (Week 3-4)
- [ ] Create Interview Agent worker (`workers/interview-agent.ts`)
- [ ] Implement custom tools (ObserveProgress, TrackMetrics, etc.)
- [ ] Set up event consumers for ai-interaction, code-changed, etc.
- [ ] Store metrics in database (Prisma schema update)
- [ ] Test context isolation

### Phase 3: Evaluation Agent (Week 5-6)
- [ ] Create Evaluation Agent worker (`workers/evaluation-agent.ts`)
- [ ] Implement 4-dimension scoring
- [ ] Build evidence collection system
- [ ] Multi-method validation
- [ ] Generate structured reports (JSON + HTML)

### Phase 4: Polish & Production (Week 7-8)
- [ ] Install Bull Board for queue monitoring
- [ ] Implement comprehensive error handling
- [ ] Add retries with exponential backoff
- [ ] Load testing (100+ concurrent sessions)
- [ ] Security audit
- [ ] Cost monitoring
- [ ] Documentation

---

## Development Guidelines

### DRY (Don't Repeat Yourself)

✅ **Good**: Shared types and utilities
```typescript
// lib/types/agent.ts - Used by all agents
export interface AgentConfig {
  model: 'sonnet-4.5' | 'opus-4' | 'haiku-4.5';
  tools: Tool[];
  permissions: PermissionConfig;
  sessionId: string;
}

// lib/utils/agent.ts - Reusable agent factory
export async function createAgent(config: AgentConfig) {
  // Shared setup logic
}
```

❌ **Bad**: Duplicate agent creation logic in every file

---

### KISS (Keep It Simple, Stupid)

✅ **Good**: Event-driven pub/sub
```typescript
// Simple: Publish event and forget
await interviewQueue.add('ai-interaction', { sessionId, data });
```

❌ **Bad**: Complex orchestrator managing subagents
```typescript
// Complex: Parent agent invoking child agents
const orchestrator = await createOrchestrator();
const result = await orchestrator.invoke('coding-agent', message);
```

---

### Code Standards

1. **TypeScript**: Strict mode, no `any` types
2. **Naming**: Descriptive names (no abbreviations)
3. **Error Handling**: Try/catch with specific error types
4. **Logging**: Structured JSON logs with context
5. **Testing**: Unit tests for utilities, integration tests for agents
6. **Documentation**: JSDoc for public functions

---

## Monitoring & Debugging

### Bull Board UI

Access at: `http://localhost:3000/admin/queues`

Features:
- View all queues and job counts
- Inspect failed jobs with stack traces
- Retry failed jobs manually
- Monitor processing times
- View worker status

### Logging

```typescript
// Structured logging with context
logger.info('Agent processing event', {
  agent: 'interview-agent',
  eventType: 'ai-interaction',
  sessionId: '123',
  processingTime: 234
});
```

### Alerts

- Queue depth >1000 jobs (capacity issue)
- Failed job rate >5% (bug or API issue)
- Average processing time >10s (performance degradation)
- Redis memory >80% (scaling needed)

---

## Testing Strategy

### Unit Tests
- Utilities (`lib/utils/`)
- Type validators
- Permission checks
- Tool implementations

### Integration Tests
- API endpoints with mock agents
- Agent workers with mock queues
- End-to-end event flow

### Load Tests
- 100 concurrent interview sessions
- 1000+ events/minute
- Redis memory usage under load
- API response time degradation

---

## Security Considerations

### OWASP Top 10 Compliance

1. **Broken Access Control**: Role-based middleware + session ownership checks
2. **Cryptographic Failures**: HTTPS only, encrypted Redis (TLS)
3. **Injection**: Parameterized queries (Prisma), input validation
4. **Insecure Design**: Least privilege principle for all agents
5. **Security Misconfiguration**: Environment-based secrets, no defaults
6. **Vulnerable Components**: Dependabot + monthly audits
7. **Auth Failures**: NextAuth.js + session validation
8. **Data Integrity**: Audit logs for all mutations
9. **Logging Failures**: Structured logs to external service
10. **SSRF**: Whitelist allowed domains for WebFetch

### Agent-Specific Security

- **Bash Tool**: Validate all commands against blocklist (`rm -rf`, fork bombs, etc.)
- **File Operations**: Restrict to workspace directory only
- **Code Execution**: Run in isolated Modal sandboxes
- **API Access**: Internal endpoints require API keys (not session cookies)

---

## Open Questions

1. **IRT Implementation**: Use full IRT or simplified adaptive difficulty?
2. **Question Bank**: How many seed questions per topic?
3. **Evaluation Threshold**: What confidence score triggers human review?
4. **Redis Persistence**: AOF vs RDB for job persistence?
5. **Agent Model Selection**: Always Sonnet for Coding Agent, or allow Opus for complex problems?

---

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python)
- [Bull Board](https://github.com/felixmosh/bull-board)
- [Item Response Theory](https://en.wikipedia.org/wiki/Item_response_theory)
- [G-Eval Framework](https://arxiv.org/abs/2303.16634) (Prompt Quality Evaluation)

---

**End of Document**
