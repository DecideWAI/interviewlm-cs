# Interview Agent - Quick Start Implementation Guide

**Quick reference for implementing the Interview Agent system**

---

## 30-Second Overview

The Interview Agent is a **background orchestrator** that:
- Monitors candidate activity without direct interaction
- Adjusts question difficulty using Item Response Theory (IRT)
- Operates in complete isolation from candidate-facing agent
- Provides real-time adaptive assessment

**Key Pattern**: Orchestrator-Worker with strict context isolation

---

## Minimal Viable Architecture

```
┌──────────────────────────────────────────────────┐
│          Session Orchestrator (Parent)           │
│  - Routes events                                 │
│  - Manages global state                          │
│  - Coordinates agents                            │
└──────────────┬───────────────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
┌───────▼──────┐ ┌───▼────────────────┐
│ Candidate    │ │ Interview Agent    │
│ Agent        │ │ (BACKGROUND)       │
│              │ │                    │
│ - Helps code │ │ - Observes events  │
│ - Visible    │ │ - Generates Qs     │
│              │ │ - Hidden           │
└──────────────┘ └────────────────────┘
```

---

## Core Implementation Steps

### Step 1: Set Up Multi-Agent Infrastructure

```typescript
// 1. Install dependencies
npm install @anthropic-ai/claude-sdk @opentelemetry/api

// 2. Create orchestrator
import { Agent } from '@anthropic-ai/claude-sdk';

class SessionOrchestrator {
  private candidateAgent: Agent;
  private interviewAgent: Agent;

  async initialize(sessionId: string) {
    // Create isolated agents
    this.candidateAgent = new Agent({
      name: 'CandidateAssistant',
      systemPrompt: 'You help candidates solve coding problems...',
      tools: [codeEditor, terminal, testRunner],
    });

    this.interviewAgent = new Agent({
      name: 'InterviewObserver',
      systemPrompt: 'You observe candidate performance and generate adaptive questions...',
      tools: [analyticsDB, questionGenerator, irtScorer],
    });
  }
}
```

**Verification**: Check that agents have separate conversation IDs in Claude API logs.

---

### Step 2: Implement Event Stream

```typescript
// Event types to monitor
interface SessionEvent {
  type: 'code_change' | 'test_run' | 'ai_prompt' | 'terminal_cmd';
  sessionId: string;
  timestamp: number;
  data: any;
}

// Simple event bus
class EventStream {
  private handlers = new Map<string, Function[]>();

  subscribe(eventType: string, handler: Function) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  publish(event: SessionEvent) {
    const handlers = this.handlers.get(event.type) || [];
    handlers.forEach(h => h(event));

    // Also send to catch-all subscribers
    const allHandlers = this.handlers.get('*') || [];
    allHandlers.forEach(h => h(event));
  }
}

// Route events to Interview Agent
eventStream.subscribe('*', async (event) => {
  await interviewAgent.observeEvent(event);
});
```

**Verification**: Log all events and confirm Interview Agent receives them.

---

### Step 3: Implement Basic IRT Scoring

```typescript
class SimpleIRTScorer {
  // Estimate candidate ability (theta)
  private currentTheta: number = 0; // Start at average

  updateAbilityEstimate(
    questionDifficulty: number,
    wasCorrect: boolean,
    timeRatio: number  // actualTime / expectedTime
  ): number {
    // Simple adaptive algorithm
    const performance = wasCorrect ? 1 : 0;
    const speedBonus = wasCorrect && timeRatio < 0.8 ? 0.2 : 0;

    // Update theta (learning rate = 0.3)
    const expectedPerformance = this.irtProbability(this.currentTheta, questionDifficulty);
    const error = performance - expectedPerformance + speedBonus;

    this.currentTheta += 0.3 * error;

    // Clamp to reasonable range
    this.currentTheta = Math.max(-3, Math.min(3, this.currentTheta));

    return this.currentTheta;
  }

  private irtProbability(theta: number, difficulty: number): number {
    // 1-parameter IRT model
    return 1 / (1 + Math.exp(-(theta - difficulty)));
  }

  getDifficulty(): number {
    return this.currentTheta;
  }
}
```

**Verification**: Test with sample data - theta should increase with correct answers.

---

### Step 4: Implement Question Seed System

```typescript
// Question seed structure
interface QuestionSeed {
  id: string;
  topic: string;
  baseDifficulty: number;  // -3 to +3
  template: {
    title: string;
    description: string;
    starterCode: string;
    testCases: TestCase[];
  };
}

// Simple seed selector
class QuestionSelector {
  private seeds: QuestionSeed[] = [];
  private usedSeeds = new Set<string>();

  async selectNext(targetDifficulty: number, topic?: string): Promise<QuestionSeed> {
    // Filter by topic if specified
    let candidates = topic
      ? this.seeds.filter(s => s.topic === topic)
      : this.seeds;

    // Exclude used seeds
    candidates = candidates.filter(s => !this.usedSeeds.has(s.id));

    // Find closest match to target difficulty
    const best = candidates.reduce((closest, seed) => {
      const diff = Math.abs(seed.baseDifficulty - targetDifficulty);
      const closestDiff = Math.abs(closest.baseDifficulty - targetDifficulty);
      return diff < closestDiff ? seed : closest;
    });

    this.usedSeeds.add(best.id);
    return best;
  }
}
```

**Verification**: Ensure selected questions match difficulty within ±0.5.

---

### Step 5: Set Up OpenTelemetry Monitoring

```typescript
import { trace, metrics } from '@opentelemetry/api';

class SessionMonitor {
  private tracer = trace.getTracer('interview-session');
  private meter = metrics.getMeter('interview-session');

  // Define metrics
  private abilityGauge = this.meter.createObservableGauge('candidate_ability_theta');
  private questionCounter = this.meter.createCounter('questions_presented');
  private difficultyGauge = this.meter.createObservableGauge('current_difficulty');

  recordAbilityUpdate(theta: number) {
    this.abilityGauge.addCallback((result) => {
      result.observe(theta);
    });
  }

  recordQuestionChange(difficulty: number) {
    this.questionCounter.add(1, { difficulty: difficulty.toFixed(1) });
    this.difficultyGauge.addCallback((result) => {
      result.observe(difficulty);
    });
  }
}
```

**Verification**: Check metrics appear in your observability backend (Prometheus/Grafana).

---

### Step 6: Implement Context Isolation Guards

```typescript
// API response filter - removes sensitive data before sending to candidate
class ResponseFilter {
  static filterForCandidate(data: any): any {
    const filtered = { ...data };

    // Remove Interview Agent fields
    const forbiddenFields = [
      'abilityEstimate',
      'difficultyLevel',
      'nextQuestion',
      'interviewAgentReasoning',
      'assessmentScore',
      'hints',  // Unless explicitly released
    ];

    forbiddenFields.forEach(field => delete filtered[field]);

    return filtered;
  }
}

// Apply to all candidate-facing endpoints
app.use('/api/candidate/*', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    return originalJson(ResponseFilter.filterForCandidate(data));
  };
  next();
});
```

**Verification**: Make test API calls and verify no forbidden fields in responses.

---

## Critical Integration Points

### 1. When Candidate Submits Code

```typescript
async handleCodeSubmission(code: string, testResults: TestResults) {
  // 1. Publish event
  eventStream.publish({
    type: 'test_run',
    sessionId,
    data: { code, testResults },
    timestamp: Date.now(),
  });

  // 2. Update IRT score
  const wasCorrect = testResults.passedCount === testResults.totalCount;
  const newTheta = irtScorer.updateAbilityEstimate(
    currentQuestion.difficulty,
    wasCorrect,
    testResults.timeRatio
  );

  // 3. Decide next action
  if (wasCorrect) {
    // Get next question
    const nextQ = await questionSelector.selectNext(newTheta);
    await advanceToQuestion(nextQ);
  }

  // 4. Record metrics
  monitor.recordAbilityUpdate(newTheta);
}
```

### 2. When Candidate Sends AI Message

```typescript
async handleCandidateMessage(message: string) {
  // 1. Route to candidate agent ONLY
  const response = await candidateAgent.chat(message);

  // 2. Log for observation (async, non-blocking)
  eventStream.publish({
    type: 'ai_prompt',
    sessionId,
    data: { prompt: message, response },
    timestamp: Date.now(),
  });

  // 3. Return to candidate immediately
  return response;
}
```

### 3. When Interview Agent Recommends Action

```typescript
async processInterviewAgentDecision(decision: AssessmentDecision) {
  // Interview Agent runs in background, outputs decisions

  switch (decision.action) {
    case 'adjust_difficulty':
      await adjustDifficulty(decision.params.newLevel);
      break;

    case 'provide_hint':
      await releaseHint(decision.params.hintLevel);
      break;

    case 'advance_question':
      const nextQ = await questionSelector.selectNext(decision.params.targetDifficulty);
      await advanceToQuestion(nextQ);
      break;
  }

  // Log decision for audit
  await auditLog('interview_agent_decision', decision);
}
```

---

## Testing Checklist

### Context Isolation Tests

- [ ] Candidate agent cannot access Interview Agent context
- [ ] API responses to candidate contain no forbidden fields
- [ ] Separate conversation IDs in Claude API logs
- [ ] No shared state between agents (except through orchestrator)

### Functional Tests

- [ ] IRT theta increases when candidate succeeds
- [ ] IRT theta decreases when candidate fails
- [ ] Question difficulty adapts to theta
- [ ] Events flow from candidate to Interview Agent
- [ ] Interview Agent decisions update session state

### Security Tests

- [ ] Candidate cannot predict next questions
- [ ] Candidate cannot see ability estimates
- [ ] All Interview Agent actions logged
- [ ] No data leakage through timing attacks

### Performance Tests

- [ ] Question generation < 5 seconds
- [ ] Difficulty adjustment < 2 seconds
- [ ] Event processing < 100ms
- [ ] Supports 10+ concurrent sessions

---

## Common Pitfalls & Solutions

### Pitfall 1: Context Leakage via Shared Memory

**Problem**: Using same object references between agents

**Solution**: Deep copy all data passed between agents
```typescript
// BAD
candidateAgent.sessionState = sessionState;

// GOOD
candidateAgent.sessionState = JSON.parse(JSON.stringify(sessionState));
```

### Pitfall 2: Interview Agent Responses Visible to Candidate

**Problem**: Accidentally including Interview Agent outputs in API responses

**Solution**: Always filter responses
```typescript
return ResponseFilter.filterForCandidate(apiResponse);
```

### Pitfall 3: Synchronous Event Processing Blocks Candidate

**Problem**: Interview Agent analysis takes too long, candidate UI freezes

**Solution**: Make event processing async
```typescript
// Fire and forget
eventStream.publish(event);  // Don't await
```

### Pitfall 4: IRT Scores Diverge (Too High or Too Low)

**Problem**: Learning rate too aggressive or no clamping

**Solution**: Use conservative learning rate (0.2-0.3) and clamp theta
```typescript
theta = Math.max(-3, Math.min(3, theta));
```

---

## Debugging Tips

### Enable Verbose Logging

```typescript
const DEBUG = process.env.DEBUG_INTERVIEW_AGENT === 'true';

if (DEBUG) {
  console.log('[InterviewAgent]', action, data);
}
```

### Inspect Agent Contexts

```typescript
// Log agent conversation history (in dev only)
console.log('Candidate Agent Context:', candidateAgent.getContext());
console.log('Interview Agent Context:', interviewAgent.getContext());

// Verify they're different!
```

### Monitor API Calls

```typescript
// Log all Claude API calls
anthropicClient.on('request', (req) => {
  console.log(`API Call: ${req.conversationId}`, req.messages.length);
});
```

### Trace Event Flow

```typescript
eventStream.subscribe('*', (event) => {
  console.log(`[EventStream] ${event.type}`, {
    sessionId: event.sessionId,
    timestamp: new Date(event.timestamp).toISOString(),
  });
});
```

---

## Production Deployment Checklist

- [ ] Environment variables configured (API keys, DB URLs)
- [ ] OpenTelemetry exporter pointing to production backend
- [ ] Rate limiting enabled (prevent abuse)
- [ ] Audit logging to immutable store
- [ ] Question seed database populated (20+ seeds per topic)
- [ ] IRT parameters validated by psychometrician
- [ ] Load tested for target concurrent sessions
- [ ] Security audit passed (no context leakage)
- [ ] Monitoring dashboards configured
- [ ] Alert rules set up (struggling candidates, errors)
- [ ] Runbook documented (incident response)

---

## Next Steps

1. **Build MVP**: Implement Steps 1-4 (multi-agent + basic IRT)
2. **Test Isolation**: Run isolation tests extensively
3. **Add Monitoring**: Implement Step 5 (OpenTelemetry)
4. **Pilot Test**: Run 5-10 real interviews
5. **Tune Algorithms**: Adjust IRT learning rate, difficulty ranges
6. **Add Advanced Features**: Hint generation, struggle detection
7. **Scale & Harden**: Load testing, security audit

---

## Additional Resources

- **Full Architecture Doc**: `./INTERVIEW_AGENT_ARCHITECTURE.md`
- **Claude Agent SDK**: https://docs.claude.com/en/docs/agent-sdk/subagents
- **IRT Primer**: https://en.wikipedia.org/wiki/Item_response_theory
- **OpenTelemetry**: https://opentelemetry.io/docs/

---

**Last Updated**: 2025-11-13
