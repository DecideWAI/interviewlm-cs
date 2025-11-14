# Interview Agent - Data Flows & Interaction Patterns

**Visual guide to how data flows through the Interview Agent system**

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INTERVIEW SESSION                              │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Session Orchestrator (Parent)                    │ │
│  │                                                                      │ │
│  │  Responsibilities:                                                  │ │
│  │  • Global state management (session time, current question, etc.)   │ │
│  │  • Event routing between agents                                     │ │
│  │  • Context isolation enforcement                                    │ │
│  │  • Response filtering for candidate                                 │ │
│  └──────────────┬─────────────────────────────────┬───────────────────┘ │
│                 │                                 │                      │
│                 │                                 │                      │
│    ┌────────────▼──────────────┐    ┌────────────▼─────────────────┐   │
│    │   Candidate Agent         │    │   Interview Agent            │   │
│    │   (Worker - VISIBLE)      │    │   (Worker - HIDDEN)          │   │
│    │                           │    │                              │   │
│    │  ┌─────────────────────┐  │    │  ┌────────────────────────┐ │   │
│    │  │ System Prompt       │  │    │  │ System Prompt          │ │   │
│    │  │ "Help candidate     │  │    │  │ "Observe and evaluate  │ │   │
│    │  │  solve problems"    │  │    │  │  candidate performance"│ │   │
│    │  └─────────────────────┘  │    │  └────────────────────────┘ │   │
│    │                           │    │                              │   │
│    │  Tools:                   │    │  Tools:                      │   │
│    │  ✓ Code Editor            │    │  ✓ Analytics DB             │   │
│    │  ✓ Terminal               │    │  ✓ Question Generator       │   │
│    │  ✓ File System            │    │  ✓ IRT Scorer               │   │
│    │  ✓ Test Runner            │    │  ✓ Metrics Query            │   │
│    │  ✗ Assessment DB          │    │  ✗ Candidate Chat           │   │
│    │                           │    │                              │   │
│    │  Context:                 │    │  Context:                    │   │
│    │  • Candidate messages     │    │  • Event stream              │   │
│    │  • Current code           │    │  • Performance metrics       │   │
│    │  • Test results           │    │  • Session analytics         │   │
│    │  • File tree              │    │  • Question history          │   │
│    └───────────────────────────┘    └──────────────────────────────┘   │
│                 ▲                                 │                      │
│                 │                                 │                      │
│                 │                                 ▼                      │
│            [FILTERED                        [OBSERVES                   │
│             RESPONSE]                        EVENTS ONLY]                │
│                 │                                 │                      │
└─────────────────┼─────────────────────────────────┼──────────────────────┘
                  │                                 │
                  │                                 │
        ┌─────────▼──────────┐          ┌──────────▼─────────┐
        │   CANDIDATE UI     │          │   EVENT STREAM     │
        │                    │          │                    │
        │  • Code Editor     │──────────▶  • code_change    │
        │  • Terminal        │          │  • test_run       │
        │  • AI Chat         │──────────▶  • ai_prompt      │
        │  • File Explorer   │          │  • file_op        │
        └────────────────────┘          └────────────────────┘
                                                  │
                                        ┌─────────▼──────────┐
                                        │   DATA STORAGE     │
                                        │                    │
                                        │  • Session Logs    │
                                        │  • Metrics DB      │
                                        │  • Code Snapshots  │
                                        │  • Question Bank   │
                                        └────────────────────┘
```

---

## Data Flow 1: Candidate Sends AI Message

**Scenario**: Candidate asks "How do I implement a binary search?"

```
┌──────────────┐
│  Candidate   │
│  Types msg   │
└──────┬───────┘
       │
       │ "How do I implement a binary search?"
       │
       ▼
┌────────────────────────────────────────┐
│   Frontend (Interview UI)              │
│                                        │
│   POST /api/session/{id}/chat          │
└────────┬───────────────────────────────┘
         │
         │ HTTP Request
         │
         ▼
┌────────────────────────────────────────────────────────┐
│   Backend API Handler                                  │
│                                                        │
│   1. Validate session                                  │
│   2. Route to Candidate Agent ONLY                     │
│   3. Publish observation event (async)                 │
└────────┬──────────────────────────────┬────────────────┘
         │                              │
         │ Message                      │ Event (async)
         │                              │
         ▼                              ▼
┌─────────────────────────┐    ┌────────────────────────┐
│  Candidate Agent        │    │  Event Stream          │
│                         │    │                        │
│  Chat([{                │    │  publish({             │
│    role: "user",        │    │    type: "ai_prompt",  │
│    content: "How..."    │    │    data: {...}         │
│  }])                    │    │  })                    │
└────────┬────────────────┘    └────────┬───────────────┘
         │                              │
         │ Claude API                   │ Subscribe
         │ Response                     │
         │                              ▼
         ▼                     ┌────────────────────────┐
┌─────────────────────────┐   │  Interview Agent       │
│  Response:              │   │                        │
│  "Binary search..."     │   │  observeEvent({        │
│  [code example]         │   │    type: "ai_prompt",  │
│                         │   │    promptQuality: 0.7, │
│  Tools: [codeEditor]    │   │    ...                 │
│                         │   │  })                    │
└────────┬────────────────┘   │                        │
         │                    │  → Analyze prompt      │
         │                    │  → Update metrics      │
         │ Return             │  → Check if candidate  │
         │                    │    needs intervention  │
         ▼                    └────────────────────────┘
┌─────────────────────────┐
│  Response Filter        │
│                         │
│  • Remove theta         │
│  • Remove difficulty    │
│  • Remove hints         │
└────────┬────────────────┘
         │
         │ Filtered Response
         │
         ▼
┌─────────────────────────┐
│  Candidate UI           │
│                         │
│  Display: "Binary       │
│  search is..."          │
└─────────────────────────┘
```

**Key Points**:
- Candidate Agent responds immediately (synchronous)
- Interview Agent observes asynchronously (non-blocking)
- No Interview Agent data reaches candidate

---

## Data Flow 2: Candidate Runs Tests

**Scenario**: Candidate clicks "Run Tests" - 3 pass, 2 fail

```
┌──────────────┐
│  Candidate   │
│  Runs Tests  │
└──────┬───────┘
       │
       │ Click "Run Tests"
       │
       ▼
┌────────────────────────────────────────┐
│   Test Runner (Modal Sandbox)          │
│                                        │
│   Execute: npm test                    │
│   Results: ✓✓✓✗✗                      │
└────────┬───────────────────────────────┘
         │
         │ TestResults { passed: 3, failed: 2 }
         │
         ▼
┌────────────────────────────────────────────────────────┐
│   Event Stream                                         │
│                                                        │
│   publish({                                            │
│     type: "test_run",                                  │
│     sessionId: "abc123",                               │
│     data: {                                            │
│       passed: 3,                                       │
│       failed: 2,                                       │
│       executionTime: 1.2,                              │
│       errors: ["Expected 5, got 3", "..."]             │
│     }                                                  │
│   })                                                   │
└────────┬───────────────────────────────────────────────┘
         │
         │ Event published
         │
         ▼
┌────────────────────────────────────────────────────────┐
│   Interview Agent (Subscriber)                         │
│                                                        │
│   observeEvent(testRunEvent)                           │
│                                                        │
│   STEP 1: Update IRT Score                            │
│   ┌──────────────────────────────────────────────┐    │
│   │ currentTheta = 0.5                           │    │
│   │ questionDifficulty = 0.3                     │    │
│   │ wasCorrect = false (2 tests failed)          │    │
│   │                                              │    │
│   │ expectedP = irt(0.5, 0.3) = 0.55             │    │
│   │ actualP = 0 (failed)                         │    │
│   │ error = 0 - 0.55 = -0.55                     │    │
│   │                                              │    │
│   │ newTheta = 0.5 + (0.3 * -0.55) = 0.335       │    │
│   │            ^^^   ^^^learning rate             │    │
│   └──────────────────────────────────────────────┘    │
│                                                        │
│   STEP 2: Analyze Struggles                           │
│   ┌──────────────────────────────────────────────┐    │
│   │ recentFailures = 2 (this question)           │    │
│   │ timeSinceLastPass = 8 minutes                │    │
│   │ codeChangeFrequency = 15/min (high)          │    │
│   │                                              │    │
│   │ strugglingIndicators = 3 → STRUGGLING!       │    │
│   └──────────────────────────────────────────────┘    │
│                                                        │
│   STEP 3: Generate Decision                           │
│   ┌──────────────────────────────────────────────┐    │
│   │ Decision: {                                  │    │
│   │   action: "provide_hint",                    │    │
│   │   params: {                                  │    │
│   │     hintLevel: "moderate",                   │    │
│   │     hintText: "Consider edge case..."        │    │
│   │   },                                         │    │
│   │   reasoning: "Candidate struggling for 8m"   │    │
│   │ }                                            │    │
│   └──────────────────────────────────────────────┘    │
└────────┬───────────────────────────────────────────────┘
         │
         │ Decision
         │
         ▼
┌────────────────────────────────────────────────────────┐
│   Session Orchestrator                                 │
│                                                        │
│   processDecision(decision)                            │
│                                                        │
│   if (action === "provide_hint") {                     │
│     sessionState.availableHints.push(hint);            │
│     notifyCandidate("Hint available");                 │
│   }                                                    │
└────────┬───────────────────────────────────────────────┘
         │
         │ Notification
         │
         ▼
┌─────────────────────────┐
│  Candidate UI           │
│                         │
│  [!] Hint Available     │
│  Click to reveal        │
└─────────────────────────┘
```

**Key Points**:
- Test results flow to Interview Agent
- IRT score updated based on performance
- Decision made to provide hint
- Candidate sees hint notification (not Interview Agent reasoning)

---

## Data Flow 3: Adaptive Question Generation

**Scenario**: Candidate completes question successfully, Interview Agent generates next question

```
┌──────────────┐
│  Candidate   │
│  Solves Q2   │
└──────┬───────┘
       │
       │ All tests pass ✓✓✓✓✓
       │
       ▼
┌────────────────────────────────────────┐
│   Test Runner                          │
│   Result: 5/5 passed, time: 3.2 min    │
└────────┬───────────────────────────────┘
         │
         │ TestResults
         │
         ▼
┌────────────────────────────────────────────────────────┐
│   Interview Agent                                      │
│                                                        │
│   STEP 1: Update Ability                              │
│   ┌──────────────────────────────────────────────┐    │
│   │ currentTheta = 0.3                           │    │
│   │ questionDifficulty = 0.2                     │    │
│   │ wasCorrect = true                            │    │
│   │ timeRatio = 3.2 / 5.0 = 0.64 (fast!)        │    │
│   │                                              │    │
│   │ performance = 1.0                            │    │
│   │ speedBonus = 0.2 (solved quickly)            │    │
│   │                                              │    │
│   │ newTheta = 0.3 + 0.3 * (1.2 - 0.55)          │    │
│   │          = 0.3 + 0.195 = 0.495               │    │
│   │          ≈ 0.5 (rounded)                     │    │
│   └──────────────────────────────────────────────┘    │
│                                                        │
│   STEP 2: Select Question Seed                        │
│   ┌──────────────────────────────────────────────┐    │
│   │ targetDifficulty = 0.5 (new theta)           │    │
│   │ coveredTopics = ["arrays", "strings"]        │    │
│   │ timeRemaining = 22 minutes                   │    │
│   │                                              │    │
│   │ Query question bank:                         │    │
│   │   WHERE difficulty BETWEEN 0.0 AND 1.0       │    │
│   │   AND topic NOT IN coveredTopics             │    │
│   │   AND timeEstimate < 22                      │    │
│   │                                              │    │
│   │ Candidates:                                  │    │
│   │   - "hash-maps-seed-001" (diff: 0.4)         │    │
│   │   - "recursion-seed-003" (diff: 0.6)         │    │
│   │   - "trees-seed-002" (diff: 0.5) ← BEST      │    │
│   │                                              │    │
│   │ Selected: "trees-seed-002"                   │    │
│   └──────────────────────────────────────────────┘    │
│                                                        │
│   STEP 3: Generate Question via LLM                   │
│   ┌──────────────────────────────────────────────┐    │
│   │ Prompt to Claude:                            │    │
│   │                                              │    │
│   │ "Generate a coding question:                 │    │
│   │  Seed: trees-seed-002                        │    │
│   │  Difficulty: 0.5                             │    │
│   │  Topic: Binary Search Trees                  │    │
│   │  Candidate ability: 0.5                      │    │
│   │                                              │    │
│   │  Requirements:                               │    │
│   │  - Test BST operations                       │    │
│   │  - Provide 30% scaffolding                   │    │
│   │  - Include 5 test cases                      │    │
│   │  - Expected time: 8-10 minutes"              │    │
│   │                                              │    │
│   │ Response: {                                  │    │
│   │   title: "BST Insert and Search",            │    │
│   │   description: "Implement insert()...",      │    │
│   │   starterCode: "class BST { ... }",          │    │
│   │   testCases: [...],                          │    │
│   │   hints: [...]                               │    │
│   │ }                                            │    │
│   └──────────────────────────────────────────────┘    │
│                                                        │
│   Output: Question object                             │
└────────┬───────────────────────────────────────────────┘
         │
         │ Question
         │
         ▼
┌────────────────────────────────────────────────────────┐
│   Session Orchestrator                                 │
│                                                        │
│   updateSessionState({                                 │
│     currentQuestion: newQuestion,                      │
│     questionNumber: 3,                                 │
│     coveredTopics: [..., "trees"],                     │
│   })                                                   │
└────────┬───────────────────────────────────────────────┘
         │
         │ Update UI
         │
         ▼
┌────────────────────────────────────────┐
│   Response Filter                      │
│                                        │
│   Remove from question:                │
│   • hints (stored server-side)         │
│   • difficulty score                   │
│   • expected solution                  │
│   • hidden test cases                  │
└────────┬───────────────────────────────┘
         │
         │ Filtered Question
         │
         ▼
┌─────────────────────────┐
│  Candidate UI           │
│                         │
│  ═════════════════      │
│  Question 3 of 5        │
│  ═════════════════      │
│                         │
│  BST Insert and Search  │
│                         │
│  Implement insert()...  │
│                         │
│  [Starter code loaded]  │
└─────────────────────────┘
```

**Key Points**:
- Ability increases due to fast, correct solution
- Next question difficulty matches new ability (0.5)
- LLM generates question dynamically from seed
- Sensitive data (hints, solutions) filtered before showing candidate

---

## Data Flow 4: Context Isolation Verification

**Scenario**: Ensuring Interview Agent context never leaks to Candidate Agent

```
┌───────────────────────────────────────────────────────────────┐
│                    Session State (Orchestrator)               │
│                                                               │
│  globalState = {                                              │
│    sessionId: "abc123",                                       │
│    startTime: 1699876543,                                     │
│    currentQuestionId: "q3",                                   │
│    timeRemaining: 1200,                                       │
│  }                                                            │
└───────────┬───────────────────────────────┬───────────────────┘
            │                               │
            │ Extract candidate view        │ Extract assessment view
            │                               │
            ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│  Candidate Agent Context │    │  Interview Agent Context     │
│                          │    │                              │
│  {                       │    │  {                           │
│    sessionId: "abc123",  │    │    sessionId: "abc123",      │
│    currentQuestion: {    │    │    abilityEstimate: 0.5,     │
│      id: "q3",           │    │    confidence: 0.82,         │
│      title: "BST...",    │    │    currentDifficulty: 0.5,   │
│      description: "...", │    │    performanceHistory: [     │
│      starterCode: "..."  │    │      { q: 1, correct: true,  │
│    },                    │    │        time: 4.2, theta: 0.2 │
│    conversationHistory: [│    │      },                       │
│      { user: "How..." }, │    │      { q: 2, correct: true,  │
│      { ai: "Try..." }    │    │        time: 3.2, theta: 0.5 │
│    ]                     │    │      }                        │
│  }                       │    │    ],                         │
│                          │    │    nextQuestionPreview: {     │
│  ✓ Has: Current question │    │      seedId: "trees-002",    │
│  ✗ Missing: Difficulty   │    │      difficulty: 0.5         │
│  ✗ Missing: Theta        │    │    },                         │
│  ✗ Missing: Hints        │    │    strugglingIndicators: 0,   │
│  ✗ Missing: Next Q       │    │    interventionNeeded: false  │
│                          │    │  }                            │
│                          │    │                              │
│                          │    │  ✓ Has: All metrics          │
│                          │    │  ✗ Missing: Candidate chat   │
└──────────────────────────┘    └──────────────────────────────┘
            │                               │
            │                               │
    ┌───────▼────────┐            ┌────────▼─────────┐
    │ Claude API     │            │ Claude API       │
    │ Conversation   │            │ Conversation     │
    │ ID: cand-abc   │            │ ID: intv-abc     │
    └────────────────┘            └──────────────────┘
          │                                 │
          │ NEVER share IDs                 │
          │ NEVER share contexts            │
          │                                 │
          └────────────┬────────────────────┘
                       │
                       ▼
            ┌────────────────────┐
            │  Audit Log         │
            │                    │
            │  Verify:           │
            │  • No shared msgs  │
            │  • Different IDs   │
            │  • Isolated tools  │
            └────────────────────┘
```

**Verification Tests**:

```typescript
// Test 1: Separate conversation IDs
assert(
  candidateAgent.conversationId !== interviewAgent.conversationId,
  "Agents must have different conversation IDs"
);

// Test 2: Context isolation
const candidateContext = candidateAgent.getContext();
const interviewContext = interviewAgent.getContext();

assert(
  !candidateContext.abilityEstimate,
  "Candidate agent should not have ability estimate"
);

assert(
  !interviewContext.conversationHistory,
  "Interview agent should not have candidate chat history"
);

// Test 3: No shared messages
const candidateMsgs = candidateAgent.getMessages();
const interviewMsgs = interviewAgent.getMessages();

const sharedMsgIds = candidateMsgs
  .map(m => m.id)
  .filter(id => interviewMsgs.some(m => m.id === id));

assert(
  sharedMsgIds.length === 0,
  "No messages should be shared between agents"
);

// Test 4: API response filtering
const apiResponse = {
  sessionId: "abc123",
  currentQuestion: {...},
  abilityEstimate: 0.5,  // ← Should be removed
  nextQuestion: {...},    // ← Should be removed
};

const filteredResponse = ResponseFilter.filterForCandidate(apiResponse);

assert(
  !filteredResponse.abilityEstimate,
  "Ability estimate leaked to candidate!"
);

assert(
  !filteredResponse.nextQuestion,
  "Next question leaked to candidate!"
);
```

---

## Event Stream Architecture

### Event Types and Handlers

```
┌─────────────────────────────────────────────────────────┐
│                    Event Stream (Redis Pub/Sub)         │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ code_change  │  │  test_run    │  │  ai_prompt   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│              Interview Agent (Subscriber)               │
│                                                         │
│  handleCodeChange(event) {                              │
│    • Track code quality metrics                        │
│    • Detect syntax errors                              │
│    • Measure code delta                                │
│  }                                                      │
│                                                         │
│  handleTestRun(event) {                                 │
│    • Update IRT score                                   │
│    • Detect struggles                                   │
│    • Decide next action                                 │
│  }                                                      │
│                                                         │
│  handleAIPrompt(event) {                                │
│    • Score prompt quality                               │
│    • Track AI dependency                                │
│    • Analyze problem-solving approach                   │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

### Event Processing Pipeline

```
Event Published
      │
      ▼
┌─────────────┐
│  Validator  │  ← Ensure event schema valid
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Enricher   │  ← Add timestamp, session context
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Router     │  ← Determine which agents need event
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Processor  │  ← Interview Agent processes
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Persister  │  ← Save to metrics DB
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Notifier   │  ← Update dashboards, alerts
└─────────────┘
```

---

## State Management

### Session State Lifecycle

```
Session Start
      │
      ▼
┌─────────────────────────────────────────┐
│  Initialize Session State               │
│                                         │
│  {                                      │
│    sessionId: uuid(),                   │
│    candidateId: "...",                  │
│    startTime: now(),                    │
│    currentQuestion: generateInitial(),  │
│    abilityEstimate: 0.0,                │
│    coveredTopics: [],                   │
│    questionHistory: [],                 │
│    status: "in_progress"                │
│  }                                      │
└──────────────┬──────────────────────────┘
               │
               ▼
     ┌─────────────────────┐
     │  Question Loop      │
     │                     │
     │  1. Present Q       │
     │  2. Candidate works │
     │  3. Submit answer   │
     │  4. Update theta    │
     │  5. Next Q          │
     └────────┬────────────┘
              │
              │ Repeat 4-6 times
              │
              ▼
     ┌─────────────────────┐
     │  Convergence        │
     │                     │
     │  theta stable ±0.1  │
     │  or time expired    │
     └────────┬────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  Finalize Session                       │
│                                         │
│  {                                      │
│    ...state,                            │
│    endTime: now(),                      │
│    finalAbility: theta,                 │
│    confidence: calculate(),             │
│    status: "completed",                 │
│    report: generateReport()             │
│  }                                      │
└─────────────────────────────────────────┘
              │
              ▼
     ┌─────────────────────┐
     │  Archive & Report   │
     │                     │
     │  • Save to S3       │
     │  • Email candidate  │
     │  • Update dashboard │
     └─────────────────────┘
```

---

## Security Layers

### Multi-Layer Isolation

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Network Isolation                             │
│                                                         │
│  Candidate Endpoints          Interview Endpoints       │
│  /api/candidate/*             /internal/assessment/*    │
│  ↓ Public access              ↓ System-only            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  LAYER 2: API-Level Filtering                           │
│                                                         │
│  ResponseFilter.filterForCandidate(data)                │
│  → Removes: theta, difficulty, hints, next question     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Agent Context Isolation                       │
│                                                         │
│  Separate Claude conversation IDs                       │
│  Separate system prompts                                │
│  Separate tool access                                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  LAYER 4: Data Access Control                           │
│                                                         │
│  Candidate Agent: code, files, terminal                 │
│  Interview Agent: metrics, questions, analytics         │
│  NO OVERLAP                                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  LAYER 5: Audit Logging                                 │
│                                                         │
│  All agent actions logged to immutable store            │
│  Tamper detection via hashing                           │
│  Post-session review available                          │
└─────────────────────────────────────────────────────────┘
```

---

## Monitoring Dashboard Views

### Real-Time Session Monitor (Admin View)

```
┌─────────────────────────────────────────────────────────────┐
│  Interview Sessions - Live Monitor                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Active Sessions: 12                                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Session: abc123        Candidate: Sarah J.            │ │
│  │ ─────────────────────────────────────────────────────│ │
│  │ Question: 3/5          Time Remaining: 18:32          │ │
│  │ Topic: Binary Trees    Difficulty: ●●●○○ (0.6)        │ │
│  │ Ability: θ = 0.58      Confidence: 84%                │ │
│  │                                                       │ │
│  │ Performance Trend:                                    │ │
│  │   Code Quality:  ▁▃▅▆█ [Improving]                   │ │
│  │   Test Pass Rate: ▅▅▇▇█ [Stable]                     │ │
│  │   AI Dependency:  ▇▅▃▃▁ [Decreasing - Good!]         │ │
│  │                                                       │ │
│  │ Status: ✓ On track                                    │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Session: def456        Candidate: Mike T.             │ │
│  │ ─────────────────────────────────────────────────────│ │
│  │ Question: 2/5          Time Remaining: 26:15          │ │
│  │ Topic: Hash Maps       Difficulty: ●●○○○ (0.4)        │ │
│  │ Ability: θ = 0.21      Confidence: 62%                │ │
│  │                                                       │ │
│  │ Performance Trend:                                    │ │
│  │   Code Quality:  ▅▃▃▂▁ [Declining]                   │ │
│  │   Test Pass Rate: ▅▃▁▁▁ [Failing]                    │ │
│  │   AI Dependency:  ▃▅▇▇█ [Increasing - Struggling]    │ │
│  │                                                       │ │
│  │ Status: ⚠ Struggling - Hint provided 3m ago           │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Alerts:                                                    │
│  ⚠ Session def456: Candidate struggling for 8 minutes      │
│  ℹ Session abc123: Advanced to question 4                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary: Key Data Flows

| Flow | Trigger | Path | Latency | Visibility |
|------|---------|------|---------|------------|
| **Candidate Message** | User types in chat | UI → Candidate Agent → UI | <1s | Candidate sees response |
| **Test Run** | User clicks "Run Tests" | UI → Sandbox → Event Stream → Interview Agent | <3s | Candidate sees test results only |
| **Question Advancement** | Tests pass | Event → Interview Agent → LLM → Orchestrator → UI | <5s | Candidate sees new question (filtered) |
| **Hint Generation** | Struggling detected | Interview Agent → Orchestrator → UI | <2s | Candidate sees hint notification |
| **Ability Update** | Every test run | Event → Interview Agent → IRT Scorer → Metrics DB | <100ms | Admin dashboard only |

---

**Last Updated**: 2025-11-13
