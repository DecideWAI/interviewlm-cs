# Production Readiness Plan: TODOs and Mock Data Replacement

## Executive Summary

This document outlines all TODOs, mock data, and placeholder code that needs to be replaced with production-ready implementations for a consistent, fully-functional UX.

## Priority Classification

- **P0 (Critical)**: Blocks core interview flow or causes runtime errors
- **P1 (High)**: Impacts user experience or data integrity
- **P2 (Medium)**: Nice-to-have features or improvements
- **P3 (Low)**: Documentation, optimization, or future enhancements

---

## 1. Critical Interview Flow TODOs (P0)

### 1.1 Question Management
**Files:** `app/api/interview/[id]/questions/route.ts`, `app/api/interview/[id]/initialize/route.ts`

**Issue:**
```typescript
// Line 202: app/api/interview/[id]/initialize/route.ts
// TODO: starterCode should be parsed as JSON array of {fileName, content}

// Line 405: app/api/interview/[id]/questions/route.ts
content: `// TODO: Implement your solution here\n\nexport function solution() {\n  // Your code here\n}\n`,
```

**Impact:** Candidates see placeholder starter code instead of problem-specific templates.

**Solution:**
```typescript
// Parse starterCode from problem seed
const files = typeof question.starterCode === 'string'
  ? JSON.parse(question.starterCode)
  : question.starterCode;

// Ensure it's an array of {fileName, content}
const filesArray = Array.isArray(files) ? files : [
  { fileName: 'solution.js', content: files }
];
```

**Effort:** 2 hours
**Dependencies:** None

---

### 1.2 AI Chat Tool Integration
**Files:** `app/api/interview/[id]/chat/route.ts`

**Issue:**
```typescript
// Lines 187-188
toolsUsed: [], // TODO: Extract from tool use when implemented
filesModified: [], // TODO: Track file modifications
```

**Impact:** Cannot track which tools AI used or which files were modified for evaluation.

**Solution:**
```typescript
// Already implemented in coding-agent.ts, need to integrate here
const toolsUsed = extractToolsFromResponse(response); // Extract from Anthropic response
const filesModified = await getModifiedFiles(sessionId, lastCheckpoint);
```

**Effort:** 4 hours
**Dependencies:** Coding agent integration

---

### 1.3 Session Recording Metadata
**Files:** `workers/evaluation-agent.ts`

**Issue:**
```typescript
// Lines 928, 959-960
questionId: '', // TODO: Get from assessment
questionDifficulty: 5, // TODO: Get from question
questionTopic: 'general', // TODO: Get from question
```

**Impact:** Evaluations lack question context for IRT scoring and difficulty adaptation.

**Solution:**
```typescript
// Get question from session recording
const question = await prisma.generatedQuestion.findFirst({
  where: {
    candidates: { some: { id: recording.candidateId } }
  },
  include: { seed: true }
});

const sessionRecording: SessionRecording = {
  // ... existing fields
  questionId: question?.id || '',
  questionDifficulty: question?.difficulty || 'MEDIUM',
  questionTopic: question?.seed?.category || 'general',
};
```

**Effort:** 3 hours
**Dependencies:** Prisma schema has question relationships

---

## 2. Mock Data Replacement (P1)

### 2.1 Analytics Dashboard
**Files:** `app/analytics/page.tsx`, `lib/mock-analytics-data.ts`

**Issue:** Entire analytics dashboard uses mock data.

**Current State:**
```typescript
// app/analytics/page.tsx - Uses MOCK_CANDIDATES, MOCK_DASHBOARD_KPIS, etc.
import {
  MOCK_CANDIDATES,
  MOCK_DASHBOARD_KPIS,
  MOCK_PIPELINE_FUNNEL,
  // ... all mock imports
} from '@/lib/mock-analytics-data';
```

**Solution:**
Create analytics API endpoints and fetch real data:

**Step 1: Create API Routes**
```typescript
// app/api/analytics/dashboard/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  const { searchParams } = new URL(request.url);
  const dateRange = searchParams.get('dateRange') || '30d';

  const kpis = await calculateDashboardKPIs({
    organizationId: session.user.activeOrganizationId,
    dateRange,
  });

  return NextResponse.json({ kpis });
}

// app/api/analytics/candidates/route.ts
// app/api/analytics/pipeline/route.ts
// app/api/analytics/sources/route.ts
```

**Step 2: Create Analytics Calculation Service**
```typescript
// lib/services/analytics.ts
export async function calculateDashboardKPIs(params: {
  organizationId: string;
  dateRange: string;
}): Promise<DashboardKPIs> {
  const { startDate, endDate } = parseDateRange(params.dateRange);

  const [
    totalCandidates,
    activeCandidates,
    completionRate,
    averageScore,
    passRate,
  ] = await Promise.all([
    prisma.candidate.count({
      where: {
        organizationId: params.organizationId,
        createdAt: { gte: startDate, lte: endDate }
      }
    }),
    prisma.candidate.count({
      where: {
        organizationId: params.organizationId,
        status: 'IN_PROGRESS'
      }
    }),
    calculateCompletionRate(params.organizationId, startDate, endDate),
    calculateAverageScore(params.organizationId, startDate, endDate),
    calculatePassRate(params.organizationId, startDate, endDate),
  ]);

  return {
    totalCandidates,
    activeCandidates,
    completedAssessments: Math.round(totalCandidates * completionRate),
    completionRate,
    averageScore,
    passRate,
    trend: await calculateTrend(params.organizationId, dateRange),
  };
}
```

**Step 3: Update Frontend to Fetch Real Data**
```typescript
// app/analytics/page.tsx
const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function fetchAnalytics() {
    const [kpisRes, candidatesRes, pipelineRes] = await Promise.all([
      fetch(`/api/analytics/dashboard?dateRange=${dateRange}`),
      fetch(`/api/analytics/candidates?dateRange=${dateRange}`),
      fetch(`/api/analytics/pipeline?dateRange=${dateRange}`),
    ]);

    setKpis(await kpisRes.json());
    setCandidates(await candidatesRes.json());
    setPipeline(await pipelineRes.json());
    setLoading(false);
  }

  fetchAnalytics();
}, [dateRange]);
```

**Effort:** 16 hours (2 days)
**Dependencies:** Database has sufficient candidate/evaluation data

---

### 2.2 Assessment Detail Page
**Files:** `app/assessments/[id]/page.tsx`, `lib/mock-assessment-detail-data.ts`

**Issue:** Assessment detail view uses mock candidates and test results.

**Solution:**
```typescript
// app/api/assessments/[id]/candidates/route.ts (already exists but verify)
// Ensure it returns full candidate details with evaluation results

// app/assessments/[id]/page.tsx
const { data: candidates, loading } = useSWR(
  `/api/assessments/${id}/candidates`,
  fetcher
);
```

**Effort:** 4 hours
**Dependencies:** Evaluation results are stored in database

---

### 2.3 Seed Preview
**Files:** `components/problems/SeedPreviewModal.tsx`

**Issue:**
```typescript
// Line 53
content: `// TODO: Implement your solution here\n\nexport function solution(input: string): string {\n  // Your code here\n  return "";\n}\n`,
```

**Solution:**
Use actual starter code from seed:
```typescript
content: seed.starterCode || generateDefaultStarterCode(seed.language, seed.title),

// Helper function
function generateDefaultStarterCode(language: string, problemTitle: string): string {
  const templates = {
    javascript: `/**\n * ${problemTitle}\n */\n\nexport function solution(input) {\n  // Implement your solution here\n  return null;\n}\n`,
    python: `"""\n${problemTitle}\n"""\n\ndef solution(input):\n    # Implement your solution here\n    pass\n`,
    // ... other languages
  };
  return templates[language] || templates.javascript;
}
```

**Effort:** 2 hours

---

### 2.4 Session Replay Mock Data
**Files:** `components/replay/SessionReplayViewer.tsx`

**Issue:**
```typescript
// Line 75
// TODO: Replace with actual API call
```

**Solution:**
```typescript
// Already has /api/sessions/[id]/replay endpoint
// Just remove TODO comment and ensure it works
useEffect(() => {
  async function loadSession() {
    const res = await fetch(`/api/sessions/${sessionId}/replay`);
    const data = await res.json();
    setReplayData(data);
  }
  loadSession();
}, [sessionId]);
```

**Effort:** 1 hour

---

## 3. Admin & Infrastructure TODOs (P2)

### 3.1 Dead Letter Queue Admin
**Files:** `app/api/admin/dlq/route.ts`, `lib/queues/dlq.ts`

**Issue:**
```typescript
// Line 26, 80: app/api/admin/dlq/route.ts
// TODO: Check if user is admin

// Line 209, 251: lib/queues/dlq.ts
// TODO: Store in database if FailedJob model exists
// TODO: Integrate with alerting service (PagerDuty, Slack, email, etc.)
```

**Solution:**
```typescript
// app/api/admin/dlq/route.ts
async function isAdmin(session: Session): Promise<boolean> {
  const member = await prisma.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      role: 'OWNER', // or create separate ADMIN role
    }
  });
  return !!member;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !(await isAdmin(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // ... rest of handler
}

// lib/queues/dlq.ts
async function storeFailedJob(job: FailedJob) {
  // Create FailedJob model in Prisma schema if needed
  await prisma.failedJob.create({
    data: {
      queue: job.queue,
      jobId: job.id,
      name: job.name,
      data: job.data,
      error: job.error,
      failedAt: job.failedAt,
      attemptsMade: job.attemptsMade,
    }
  });
}

async function alertOnCriticalFailure(job: FailedJob) {
  // Send to Slack
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify({
        text: `🚨 Critical job failure: ${job.name}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Job:* ${job.name}\n*Queue:* ${job.queue}\n*Error:* ${job.error}` }
          }
        ]
      })
    });
  }
}
```

**Effort:** 6 hours
**Dependencies:** Create FailedJob model, set up Slack webhook

---

### 3.2 Paddle Payment TODOs
**Files:** `lib/services/paddle.ts`

**Issue:**
```typescript
// Lines 326-327, 358, 392, 428
// TODO: Send email notification to user about failed payment
// TODO: Implement subscription management
// TODO: Implement subscription cancellation
// TODO: Implement refund logic
```

**Solution:**
```typescript
// lib/services/paddle.ts

async function handleFailedPayment(transaction: Transaction) {
  // Send email via Resend
  await sendEmail({
    to: transaction.customerEmail,
    subject: 'Payment Failed - Action Required',
    template: 'payment-failed',
    data: {
      amount: transaction.amount,
      reason: transaction.failureReason,
      retryUrl: `${process.env.NEXTAUTH_URL}/billing/retry?txn=${transaction.id}`,
    }
  });

  // Log to database
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: 'FAILED',
      failureNotifiedAt: new Date(),
    }
  });
}

async function manageSubscription(params: {
  organizationId: string;
  action: 'pause' | 'resume' | 'cancel' | 'update';
  data?: any;
}) {
  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    include: { subscription: true }
  });

  if (!org?.subscription) {
    throw new Error('No active subscription');
  }

  // Call Paddle API
  const response = await fetch(`https://api.paddle.com/subscriptions/${org.subscription.paddleSubscriptionId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: params.action,
      ...params.data
    })
  });

  // Update database
  await prisma.subscription.update({
    where: { id: org.subscription.id },
    data: {
      status: params.action === 'cancel' ? 'CANCELLED' : 'ACTIVE',
      updatedAt: new Date(),
    }
  });
}
```

**Effort:** 12 hours
**Dependencies:** Paddle API credentials, email templates

---

## 4. User Authentication TODOs (P2)

**Files:** Multiple auth route files

**Issue:** Several auth features commented as TODO in seed files (not actual code TODOs).

**Current State:** Authentication is implemented but missing:
- Email verification
- Password reset
- 2FA

**Solution:** These are already partially implemented. Just need to:
1. Enable email verification in NextAuth config
2. Create password reset flow
3. Add 2FA using `@2fa/totp` library

**Effort:** 20 hours
**Dependencies:** Email service (Resend already configured)

---

## 5. Code Quality TODOs (P3)

### 5.1 Code Streaming Position Tracking
**Files:** `lib/services/code-streaming.ts`

**Issue:**
```typescript
// Line 201
line: 0, // TODO: Calculate actual line/column
```

**Solution:**
```typescript
// Calculate actual position by counting newlines in streamed content
let currentLine = 1;
let currentColumn = 0;

for (let i = 0; i < fullCode.length; i += chunkSize) {
  const chunk = fullCode.substring(i, Math.min(i + chunkSize, fullCode.length));

  // Count newlines in chunk
  const newlines = (chunk.match(/\n/g) || []).length;
  currentLine += newlines;
  currentColumn = newlines > 0
    ? chunk.length - chunk.lastIndexOf('\n') - 1
    : currentColumn + chunk.length;

  codeStreamManager.streamCodeDelta({
    sessionId,
    fileName,
    delta: chunk,
    type: 'delta',
    position: { line: currentLine, column: currentColumn },
  });
}
```

**Effort:** 2 hours

---

## 6. Remove Unused Mock Files (P3)

**Files to Delete:**
- `lib/mock-analytics-data.ts` (after analytics implementation)
- `lib/mock-assessment-detail-data.ts` (after assessment detail fix)
- `lib/mock-seeds-data.ts` (already replaced by hooks/useSeeds.ts)
- `lib/mock-insights-data.ts` (if not used)

**Verification:**
```bash
# Check if still imported anywhere
grep -r "mock-analytics-data" app/ components/ --include="*.ts" --include="*.tsx"
grep -r "mock-assessment-detail-data" app/ components/ --include="*.ts" --include="*.tsx"
grep -r "mock-seeds-data" app/ components/ --include="*.ts" --include="*.tsx"
```

**Effort:** 1 hour

---

## Implementation Plan

### Phase 1: Critical Fixes (Week 1) - P0
1. ✅ Question starter code parsing (2h)
2. ✅ AI chat tool tracking (4h)
3. ✅ Session recording metadata (3h)
4. ✅ Remove remaining TODOs from interview flow (3h)

**Total:** 12 hours

### Phase 2: Mock Data Replacement (Week 2-3) - P1
1. Analytics dashboard real data (16h)
2. Assessment detail real data (4h)
3. Seed preview improvements (2h)
4. Session replay verification (1h)

**Total:** 23 hours

### Phase 3: Infrastructure (Week 4) - P2
1. Admin authentication (6h)
2. Paddle payment handlers (12h)
3. DLQ database storage (4h)
4. Alerting integration (4h)

**Total:** 26 hours

### Phase 4: Polish (Week 5) - P3
1. Code streaming position tracking (2h)
2. Remove unused mock files (1h)
3. Documentation updates (2h)
4. Final testing (5h)

**Total:** 10 hours

---

## Total Effort Estimate

- **P0 (Critical):** 12 hours
- **P1 (High):** 23 hours
- **P2 (Medium):** 26 hours
- **P3 (Low):** 10 hours

**Grand Total:** 71 hours (~2 weeks for 1 developer)

---

## Verification Checklist

After implementation, verify:

- [ ] No `TODO` comments in production code (excluding tests/docs)
- [ ] No `mock` imports in app/ or components/ directories
- [ ] All analytics data from database, not static arrays
- [ ] All assessments show real candidate data
- [ ] All seeds use actual starter code
- [ ] Session replay works with real data
- [ ] Admin routes have authentication
- [ ] Payment webhooks handle all scenarios
- [ ] DLQ failures are logged and alerted
- [ ] Code streaming shows accurate positions

---

## Risk Mitigation

1. **Data Migration:** Before removing mock data, ensure sufficient real data exists in database
2. **Feature Flags:** Use environment variables to toggle between mock and real data during transition
3. **Graceful Degradation:** If real data fetch fails, show empty state, not error
4. **Testing:** Create integration tests for all new API endpoints
5. **Rollback Plan:** Keep mock data files until production verification complete

---

## Recommended Approach

**Start with Phase 1 (Critical P0 fixes)** to ensure interview flow is solid, then proceed to Phase 2 for user-facing improvements. Phases 3-4 can be done in parallel or deferred if needed.

**Feature Flag Example:**
```typescript
// lib/config.ts
export const USE_REAL_ANALYTICS = process.env.USE_REAL_ANALYTICS === 'true';

// app/analytics/page.tsx
const data = USE_REAL_ANALYTICS
  ? await fetchRealAnalytics()
  : MOCK_ANALYTICS_DATA;
```

This allows progressive rollout and easy rollback if issues occur.
