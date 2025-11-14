# Interview Agent Architecture Research Report

**Date**: 2025-11-13
**Purpose**: Architecture design for background Interview Agent in InterviewLM platform

---

## Executive Summary

This report synthesizes research on building a background Interview Agent for the InterviewLM technical assessment platform. The Interview Agent is a hidden orchestrator that monitors candidate progress in real-time, adjusts question difficulty dynamically, and generates adaptive challenges without direct candidate interaction.

**Key Findings:**
- Use **Orchestrator-Worker pattern** with Claude Agent SDK for multi-agent architecture
- Implement **context isolation** to prevent candidate-facing agent from accessing Interview Agent context
- Apply **Item Response Theory (IRT)** combined with AI for adaptive question generation
- Leverage **OpenTelemetry** and event streams for real-time monitoring
- Use **question seeds** with difficulty mappings for controlled assessment progression

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Multi-Agent System Design](#multi-agent-system-design)
3. [Context Isolation Strategy](#context-isolation-strategy)
4. [Adaptive Question Generation](#adaptive-question-generation)
5. [Real-Time Monitoring Implementation](#real-time-monitoring-implementation)
6. [Question Seed System](#question-seed-system)
7. [Tools and Data Access Requirements](#tools-and-data-access-requirements)
8. [Security and Isolation Mechanisms](#security-and-isolation-mechanisms)
9. [Implementation Roadmap](#implementation-roadmap)
10. [References and Resources](#references-and-resources)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERVIEW SESSION                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐        ┌────────────────────────┐ │
│  │  Candidate-Facing    │        │  Interview Agent       │ │
│  │  Claude Agent        │        │  (BACKGROUND/HIDDEN)   │ │
│  │                      │        │                        │ │
│  │  - Coding help       │        │  - Progress monitor    │ │
│  │  - AI assistance     │        │  - Question generator  │ │
│  │  - Tool usage        │        │  - Difficulty adjuster │ │
│  │  - Terminal/Editor   │        │  - Performance scorer  │ │
│  └──────────────────────┘        └────────────────────────┘ │
│           │                                  │                │
│           │                                  │                │
│           └──────────┬───────────────────────┘                │
│                      │                                        │
│              ┌───────▼────────┐                              │
│              │  Orchestrator   │                              │
│              │                 │                              │
│              │ - Session state │                              │
│              │ - Event routing │                              │
│              │ - Context mgmt  │                              │
│              └─────────────────┘                              │
│                      │                                        │
├──────────────────────┼────────────────────────────────────────┤
│                      │                                        │
│              ┌───────▼────────┐                              │
│              │   Data Layer    │                              │
│              │                 │                              │
│              │ - Session logs  │                              │
│              │ - Code snapshots│                              │
│              │ - Test results  │                              │
│              │ - Metrics DB    │                              │
│              └─────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

### Core Principle: Observer Pattern with Orchestration

The Interview Agent operates as a **background observer** that:
1. **Never directly interacts** with the candidate
2. **Monitors events** from candidate activity (code changes, test runs, AI prompts)
3. **Generates decisions** (next question, difficulty adjustment, hints)
4. **Updates configuration** that the candidate-facing system uses

This follows the **Observer/Observation Pattern** from agentic AI design:
- **Observe**: Monitor candidate actions via event stream
- **Reason**: Analyze performance using IRT and ML models
- **Act**: Generate adaptive questions/hints
- **Verify**: Validate assessment quality and fairness

---

## Multi-Agent System Design

### Recommended Pattern: Hierarchical Orchestrator-Worker

Based on Azure AI Architecture Center and Claude Agent SDK best practices:

```typescript
// Conceptual architecture

interface InterviewSession {
  orchestrator: SessionOrchestrator;
  candidateAgent: CandidateAssistantAgent;  // Visible to candidate
  interviewAgent: InterviewObserverAgent;    // Hidden background agent
  sharedState: SessionState;
}

class SessionOrchestrator {
  // Maintains global state
  globalState: {
    sessionId: string;
    currentQuestion: Question;
    performanceHistory: PerformanceMetric[];
    difficultyLevel: number;
    timeElapsed: number;
  };

  // Routes events between agents
  async routeEvent(event: SessionEvent) {
    // Send code/test events to Interview Agent
    if (event.type === 'code_change' || event.type === 'test_run') {
      await this.interviewAgent.observe(event);
    }

    // Send candidate prompts to Candidate Agent
    if (event.type === 'candidate_message') {
      await this.candidateAgent.handleMessage(event);
    }
  }

  // Coordinates state updates
  async updateAssessment(decision: AssessmentDecision) {
    // Interview Agent makes decision
    // Orchestrator updates shared state
    // Candidate Agent sees new question/config
  }
}
```

### Agent Roles

#### 1. Session Orchestrator (Parent Agent)
- **Responsibility**: Global coordination, state management, event routing
- **Tools Access**: All tools, full session data
- **Context**: High-level session state (compact)
- **Implementation**: Main Claude Agent SDK instance with streaming mode

**Key Functions:**
```typescript
- initializeSession(config: AssessmentConfig)
- routeEvent(event: SessionEvent) -> void
- updateGlobalState(update: StateUpdate) -> void
- delegateToSubagent(task: Task, agent: Agent) -> Result
- aggregateResults(results: AgentResult[]) -> SessionSummary
```

#### 2. Candidate Assistant Agent (Worker - Visible)
- **Responsibility**: Help candidate with coding, answer questions, provide AI assistance
- **Tools Access**: Code editor, terminal, file system, test runner
- **Context**: Candidate conversation history + current code
- **Constraints**:
  - NO access to Interview Agent context
  - NO visibility into assessment scoring logic
  - NO knowledge of upcoming questions

**Key Functions:**
```typescript
- respondToCandidate(message: string) -> Response
- suggestCodeFix(error: Error) -> Suggestion
- explainConcept(topic: string) -> Explanation
- runTests() -> TestResults
```

#### 3. Interview Agent (Worker - Hidden)
- **Responsibility**: Monitor progress, generate questions, adjust difficulty
- **Tools Access**: Analytics DB, question bank, IRT scoring engine
- **Context**: Performance metrics + assessment config (isolated from candidate)
- **Constraints**:
  - NO direct communication with candidate
  - Outputs decisions to orchestrator only
  - Operates on observation data streams

**Key Functions:**
```typescript
- observeProgress(events: SessionEvent[]) -> ProgressAnalysis
- generateNextQuestion(seed: QuestionSeed, difficulty: number) -> Question
- adjustDifficulty(performance: PerformanceMetric[]) -> DifficultyLevel
- scoreSubmission(code: Code, tests: TestResults) -> Score
- detectStruggles() -> Intervention | null
```

---

## Context Isolation Strategy

### Challenge: Preventing Context Leakage

The candidate-facing agent must NOT have access to:
- Assessment scoring logic
- Upcoming questions or hints
- Interview Agent's reasoning about performance
- Difficulty adjustment decisions

### Solution: Multi-Layer Isolation

#### Layer 1: Separate Claude API Instances

```typescript
// Different API clients with isolated contexts

const candidateAgentClient = new AnthropicSDK({
  apiKey: process.env.ANTHROPIC_API_KEY,
  sessionId: `candidate-${sessionId}`,
  systemPrompt: CANDIDATE_ASSISTANT_PROMPT, // Helpful coding assistant
});

const interviewAgentClient = new AnthropicSDK({
  apiKey: process.env.ANTHROPIC_API_KEY,
  sessionId: `interview-${sessionId}`,
  systemPrompt: INTERVIEW_OBSERVER_PROMPT, // Assessment evaluator
});
```

**Isolation Mechanism:**
- Each agent uses separate Claude API conversation threads
- System prompts define distinct roles and constraints
- No shared conversation history between agents

#### Layer 2: Subagent Memory Isolation (Claude Agent SDK)

From Claude Agent SDK documentation:

> "Subagents maintain separate context from the main agent, preventing information overload and keeping interactions focused. Each agent maintains its own working memory for task execution."

```typescript
// Using Claude Agent SDK subagents

const orchestrator = new Agent({
  name: "SessionOrchestrator",
  systemPrompt: "You coordinate an interview session...",
});

// Candidate agent as subagent
const candidateAgent = orchestrator.createSubagent({
  name: "CandidateAssistant",
  systemPrompt: "You help candidates solve coding problems...",
  tools: [codeEditor, terminal, testRunner],
  // This agent's context is ISOLATED
});

// Interview agent as separate subagent
const interviewAgent = orchestrator.createSubagent({
  name: "InterviewObserver",
  systemPrompt: "You evaluate candidate performance and generate questions...",
  tools: [analyticsDB, questionGenerator, irtScorer],
  // This agent's context is ISOLATED from candidateAgent
});
```

**Key Properties:**
- Subagents have **isolated context windows**
- Only return relevant results to orchestrator (not full context)
- **No direct communication** between subagents
- Orchestrator controls information flow via `InvocationContext.branch`

#### Layer 3: Data Access Control

```typescript
// Tool-level access restrictions

const candidateTools = [
  codeEditorTool,
  terminalTool,
  fileSystemTool,
  testRunnerTool,
  // NO access to assessment DB
];

const interviewTools = [
  assessmentDBTool,      // Read candidate metrics
  questionGeneratorTool,  // Generate new questions
  irtScorerTool,         // Score performance
  // NO access to candidate conversation
];
```

#### Layer 4: Event-Driven Communication (One-Way Only)

```typescript
// Interview Agent observes events but never responds to candidate

interface SessionEventStream {
  // Candidate actions flow TO Interview Agent
  on('code_change', (code) => interviewAgent.observe(code));
  on('test_run', (results) => interviewAgent.observe(results));
  on('prompt_submitted', (prompt) => interviewAgent.observe(prompt));

  // Interview Agent decisions flow TO Orchestrator
  on('difficulty_adjustment', (level) => orchestrator.updateDifficulty(level));
  on('question_generated', (q) => orchestrator.setNextQuestion(q));

  // NEVER: interviewAgent -> candidateAgent direct communication
}
```

### Verification: How to Test Isolation

1. **Context Inspection**: Log all prompts sent to each agent - verify no cross-contamination
2. **Information Probing**: Ask candidate agent about assessment logic - should have no knowledge
3. **Network Analysis**: Monitor API calls - each agent should have separate conversation IDs
4. **Token Tracking**: Measure context window usage - should be independent

---

## Adaptive Question Generation

### Foundation: Item Response Theory (IRT)

Item Response Theory is a psychometric framework for adaptive testing. Modern implementations combine IRT with LLMs for dynamic question generation.

#### IRT Core Concepts

**Ability Parameter (θ)**: Candidate's skill level (-∞ to +∞, typically -3 to +3)

**Question Parameters:**
- **Difficulty (b)**: How hard is the question (-3 to +3)
- **Discrimination (a)**: How well does it differentiate skill levels
- **Guessing (c)**: Probability of correct answer by chance

**Probability Function:**
```
P(correct | θ, a, b, c) = c + (1-c) / (1 + e^(-a(θ-b)))
```

#### IRT + AI Implementation

Recent research shows pretrained transformers (T5, BERT) can generate questions with specific IRT parameters:

```typescript
interface IRTQuestionGenerator {
  // Generate question with target difficulty
  async generateQuestion(params: {
    topic: string;
    targetDifficulty: number;    // b parameter (-3 to +3)
    discrimination: number;       // a parameter (0.5 to 2.5)
    currentAbility: number;       // θ estimate
    context: string;              // "Express.js routing"
  }): Promise<Question>;

  // Update ability estimate after response
  updateAbilityEstimate(
    currentTheta: number,
    questionDifficulty: number,
    wasCorrect: boolean
  ): number;
}
```

**Example Flow:**

1. **Initial Estimate**: Start at θ = 0 (average ability)
2. **Present Question**: Generate question at difficulty b = 0
3. **Observe Response**:
   - If correct quickly → increase θ estimate
   - If incorrect or slow → decrease θ estimate
4. **Adapt**: Generate next question at b ≈ θ (maximizes information gain)
5. **Converge**: After 5-10 questions, θ estimate stabilizes

#### Difficulty Control Mechanisms

From research on adaptive assessment:

```typescript
class AdaptiveDifficultyController {
  // Three-dimensional difficulty control
  adjustDifficulty(performance: PerformanceMetric): DifficultyParams {
    return {
      // 1. Conceptual complexity
      conceptComplexity: this.calculateConceptual(performance),

      // 2. Code length/scaffolding
      scaffolding: this.calculateScaffolding(performance),

      // 3. Time pressure
      timeLimit: this.calculateTimeLimit(performance),
    };
  }

  private calculateConceptual(perf: PerformanceMetric): number {
    // Based on: correctness, code quality, AI prompt sophistication
    const baseLevel = perf.correctness * 0.4 +
                     perf.codeQuality * 0.3 +
                     perf.promptQuality * 0.3;

    // Progressive adjustment (avoid large jumps)
    return this.currentLevel + (baseLevel - this.currentLevel) * 0.3;
  }

  private calculateScaffolding(perf: PerformanceMetric): number {
    // More struggling = more scaffolding (starter code, hints)
    if (perf.strugglingIndicators > 3) return 0.8; // High scaffolding
    if (perf.strugglingIndicators > 1) return 0.5; // Medium
    return 0.2; // Minimal scaffolding
  }

  private calculateTimeLimit(perf: PerformanceMetric): number {
    // Adaptive time based on solving speed
    const avgTimeRatio = perf.actualTime / perf.expectedTime;
    if (avgTimeRatio < 0.7) return 0.8; // Fast solver, reduce time
    if (avgTimeRatio > 1.5) return 1.5; // Slow solver, extend time
    return 1.0;
  }
}
```

### Question Seed System

Inspired by gaming's Dynamic Difficulty Adjustment (DDA), question seeds provide controlled variation:

#### Seed Architecture

```typescript
interface QuestionSeed {
  seedId: string;              // "express-routing-seed-001"
  topic: string;               // "Express.js middleware"
  baseDifficulty: number;      // IRT b parameter
  variants: QuestionVariant[]; // Different implementations of same concept
  metadata: {
    discriminationPower: number;
    averageSolveTime: number;
    passingRate: number;
    skills: string[];
  };
}

interface QuestionVariant {
  variantId: string;
  templateCode: string;
  testCases: TestCase[];
  difficultyModifier: number;  // Adjusts base difficulty
  hints: Hint[];
  expectedApproach: string;
}
```

#### Seed Selection Algorithm

```typescript
class QuestionSeedSelector {
  async selectSeed(context: SelectionContext): Promise<QuestionSeed> {
    const { currentAbility, topicHistory, timeRemaining } = context;

    // 1. Filter by topic (avoid repetition, ensure coverage)
    const validTopics = this.getNextTopics(topicHistory);

    // 2. Filter by difficulty (target ±0.5 of current ability)
    const targetDifficulty = currentAbility;
    const difficultyRange = [targetDifficulty - 0.5, targetDifficulty + 0.5];

    // 3. Query seed database
    const candidateSeeds = await this.seedDB.query({
      topics: validTopics,
      difficulty: { min: difficultyRange[0], max: difficultyRange[1] },
      notUsedInSession: context.sessionId,
    });

    // 4. Select seed with highest information value
    return this.selectMaxInformation(candidateSeeds, currentAbility);
  }

  // Fisher Information - measures how much we learn from response
  private selectMaxInformation(seeds: QuestionSeed[], theta: number): QuestionSeed {
    return seeds.reduce((best, seed) => {
      const info = this.fisherInformation(seed, theta);
      return info > this.fisherInformation(best, theta) ? seed : best;
    });
  }

  private fisherInformation(seed: QuestionSeed, theta: number): number {
    const { baseDifficulty: b, metadata: { discriminationPower: a } } = seed;
    const p = this.irtProbability(theta, a, b);
    // I(θ) = a² * p * (1-p)
    return Math.pow(a, 2) * p * (1 - p);
  }
}
```

#### Dynamic Question Generation

Combine seeds with LLM generation:

```typescript
class QuestionGenerator {
  async generate(seed: QuestionSeed, ability: number): Promise<Question> {
    // Select variant based on ability
    const variant = this.selectVariant(seed, ability);

    // Use LLM to customize question
    const prompt = `
      Generate a coding question based on this seed:

      Topic: ${seed.topic}
      Difficulty Level: ${ability.toFixed(2)} (IRT scale)
      Base Template: ${variant.templateCode}

      Requirements:
      - Adjust complexity to match difficulty ${ability}
      - Ensure question tests: ${seed.metadata.skills.join(', ')}
      - Include starter code with ${variant.difficultyModifier}% scaffolding
      - Generate test cases that validate correct solution

      Return JSON with: { title, description, starterCode, testCases, hints }
    `;

    const response = await this.llm.generate(prompt);
    return this.parseQuestion(response, seed, variant);
  }

  private selectVariant(seed: QuestionSeed, ability: number): QuestionVariant {
    // Map ability to variant difficulty
    // ability < -0.5 → easier variant
    // ability > 0.5 → harder variant
    const targetDifficulty = seed.baseDifficulty + ability;

    return seed.variants.reduce((best, variant) => {
      const variantDiff = seed.baseDifficulty + variant.difficultyModifier;
      const currentBest = seed.baseDifficulty + best.difficultyModifier;

      return Math.abs(variantDiff - targetDifficulty) <
             Math.abs(currentBest - targetDifficulty) ? variant : best;
    });
  }
}
```

---

## Real-Time Monitoring Implementation

### Event Stream Architecture

```typescript
// Event-driven monitoring using WebSocket + Server-Sent Events (SSE)

interface SessionEventStream {
  // Candidate activity events
  events: {
    code_change: CodeChangeEvent;
    test_run: TestRunEvent;
    ai_prompt: AIPromptEvent;
    file_operation: FileOperationEvent;
    terminal_command: TerminalCommandEvent;
  };

  // Interview Agent observation
  subscribe(eventType: string, handler: EventHandler): void;
  publish(event: SessionEvent): void;
}

// Event types
interface CodeChangeEvent {
  sessionId: string;
  timestamp: number;
  filePath: string;
  diff: CodeDiff;
  linesChanged: number;
  syntaxErrors: SyntaxError[];
}

interface TestRunEvent {
  sessionId: string;
  timestamp: number;
  passed: number;
  failed: number;
  coverage: number;
  executionTime: number;
  errorMessages: string[];
}

interface AIPromptEvent {
  sessionId: string;
  timestamp: number;
  promptText: string;
  promptLength: number;
  promptQuality: number;  // Scored by separate classifier
  responseLength: number;
  toolsUsed: string[];
}
```

### OpenTelemetry Integration

Based on Claude Code's official OpenTelemetry support:

```typescript
import { trace, metrics } from '@opentelemetry/api';

class InterviewAgentMonitor {
  private tracer = trace.getTracer('interview-agent');
  private meter = metrics.getMeter('interview-agent');

  // Metrics
  private assessmentDuration = this.meter.createHistogram('assessment_duration_seconds');
  private questionChanges = this.meter.createCounter('question_changes_total');
  private difficultyLevel = this.meter.createObservableGauge('current_difficulty_level');
  private candidateAbility = this.meter.createObservableGauge('estimated_ability_theta');

  async observeSession(sessionId: string) {
    const span = this.tracer.startSpan('observe_session', {
      attributes: { sessionId },
    });

    try {
      // Monitor event stream
      this.eventStream.subscribe('*', async (event) => {
        const eventSpan = this.tracer.startSpan(`event.${event.type}`, {
          parent: span,
          attributes: {
            eventType: event.type,
            timestamp: event.timestamp,
          },
        });

        // Process event
        await this.processEvent(event);

        eventSpan.end();
      });

    } finally {
      span.end();
    }
  }

  private async processEvent(event: SessionEvent) {
    // Update metrics based on event type
    if (event.type === 'test_run') {
      this.assessmentDuration.record(event.timestamp - this.sessionStart);

      // Trigger difficulty adjustment if needed
      const shouldAdjust = await this.shouldAdjustDifficulty(event);
      if (shouldAdjust) {
        this.questionChanges.add(1);
        await this.adjustDifficulty();
      }
    }
  }
}
```

### Real-Time Progress Tracking

```typescript
class ProgressTracker {
  // Track multiple dimensions of progress
  private metrics = {
    // Code quality metrics
    codeQuality: new TimeSeriesMetric(),
    testPassRate: new TimeSeriesMetric(),
    syntaxErrors: new TimeSeriesMetric(),

    // AI usage metrics
    promptQuality: new TimeSeriesMetric(),
    aiDependency: new TimeSeriesMetric(),  // % of code from AI vs candidate

    // Problem-solving metrics
    approachQuality: new TimeSeriesMetric(),
    timeEfficiency: new TimeSeriesMetric(),
    strugglingIndicators: new TimeSeriesMetric(),
  };

  async analyzeProgress(events: SessionEvent[]): Promise<ProgressAnalysis> {
    // Real-time analysis updated on each event
    const recentEvents = events.slice(-10); // Last 10 events

    return {
      // Overall performance
      abilityEstimate: this.calculateAbility(events),
      confidence: this.calculateConfidence(events),

      // Trends
      improving: this.detectTrend(this.metrics.codeQuality) > 0,
      struggling: this.detectStruggling(recentEvents),

      // Specific skills
      skillProfile: {
        coding: this.assessCodingSkill(events),
        aiPrompting: this.assessPromptingSkill(events),
        debugging: this.assessDebuggingSkill(events),
        testing: this.assessTestingSkill(events),
      },

      // Recommendations
      nextAction: this.recommendNextAction(events),
    };
  }

  private detectStruggling(events: SessionEvent[]): boolean {
    const indicators = [
      // Same test failing repeatedly
      this.repeatedFailures(events) > 3,

      // Many small code changes (trial and error)
      this.codeChangeFrequency(events) > 10,

      // Long time without progress
      this.timeSinceLastPass(events) > 600, // 10 minutes

      // Heavy AI dependency
      this.aiDependencyRatio(events) > 0.8,
    ];

    return indicators.filter(Boolean).length >= 2;
  }
}
```

### Monitoring Dashboard (Backend)

```typescript
// Server-side monitoring for interview coordinators (not exposed to candidates)

interface MonitoringDashboard {
  // Real-time session overview
  activeSessions: {
    sessionId: string;
    candidateName: string;
    currentQuestion: string;
    difficultyLevel: number;
    abilityEstimate: number;
    timeElapsed: number;
    progress: number; // 0-100%
    flags: AlertFlag[];
  }[];

  // Alerts for intervention
  alerts: {
    type: 'struggling' | 'cheating_suspected' | 'technical_issue';
    sessionId: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    timestamp: number;
  }[];
}

class InterviewMonitoringService {
  async getRealtimeMetrics(sessionId: string): Promise<SessionMetrics> {
    // Pull from OpenTelemetry metrics backend
    const metrics = await this.otelCollector.query({
      metric: 'interview_session.*',
      filters: { sessionId },
      timeRange: 'last_5m',
    });

    return {
      currentAbility: metrics.get('estimated_ability_theta'),
      questionNumber: metrics.get('question_changes_total'),
      codeQuality: this.aggregateCodeQuality(metrics),
      aiUsagePattern: this.analyzeAIUsage(metrics),
    };
  }

  // Detect potential cheating or anomalies
  async detectAnomalies(sessionId: string): Promise<AnomalyReport> {
    const events = await this.getSessionEvents(sessionId);

    return {
      suspiciousPatterns: [
        this.detectCopyPaste(events),
        this.detectExternalAssistance(events),
        this.detectUnusualSpeed(events),
      ].filter(Boolean),
    };
  }
}
```

---

## Tools and Data Access Requirements

### Interview Agent Tool Suite

```typescript
// Tools available ONLY to Interview Agent (not candidate agent)

const interviewAgentTools = [
  // 1. Question Generation
  {
    name: 'generate_question',
    description: 'Generate new question from seed with target difficulty',
    parameters: {
      seedId: 'string',
      targetDifficulty: 'number',
      currentAbility: 'number',
      topicConstraints: 'string[]',
    },
  },

  // 2. Performance Analysis
  {
    name: 'analyze_performance',
    description: 'Analyze candidate performance from event history',
    parameters: {
      events: 'SessionEvent[]',
      analysisType: 'code_quality | ai_usage | problem_solving',
    },
  },

  // 3. IRT Scoring
  {
    name: 'update_ability_estimate',
    description: 'Update theta estimate based on response',
    parameters: {
      currentTheta: 'number',
      questionDifficulty: 'number',
      response: 'QuestionResponse',
    },
  },

  // 4. Difficulty Adjustment
  {
    name: 'adjust_difficulty',
    description: 'Recommend difficulty adjustment',
    parameters: {
      currentDifficulty: 'number',
      performanceMetrics: 'PerformanceMetric',
      adjustmentReason: 'string',
    },
  },

  // 5. Hint Generation
  {
    name: 'generate_hint',
    description: 'Generate contextual hint based on struggle analysis',
    parameters: {
      currentCode: 'string',
      testFailures: 'TestResult[]',
      hintLevel: 'subtle | moderate | explicit',
    },
  },

  // 6. Session Analytics
  {
    name: 'query_session_metrics',
    description: 'Query time-series metrics from OpenTelemetry',
    parameters: {
      sessionId: 'string',
      metrics: 'string[]',
      timeRange: 'string',
    },
  },
];
```

### Data Access Requirements

#### Read Access

```typescript
interface InterviewAgentDataAccess {
  // Session-specific data (read-only)
  session: {
    id: string;
    candidate: {
      id: string;
      // NO PII (name, email) - only ID
    };
    assessmentConfig: AssessmentConfiguration;
    startTime: number;
    currentState: SessionState;
  };

  // Historical performance data
  candidateHistory: {
    previousAttempts: number;
    averageScore: number;
    strengthAreas: string[];
    weaknessAreas: string[];
  };

  // Real-time event stream (read-only)
  eventStream: {
    codeChanges: CodeChangeEvent[];
    testRuns: TestRunEvent[];
    aiInteractions: AIPromptEvent[];
    terminalCommands: TerminalCommandEvent[];
  };

  // Question bank (read-only)
  questionBank: {
    seeds: QuestionSeed[];
    usedQuestions: string[];  // For this session
    availableQuestions: string[];
  };
}
```

#### Write Access

```typescript
interface InterviewAgentWriteAccess {
  // Assessment state updates
  updateAssessmentState: (update: {
    currentQuestion?: Question;
    difficultyLevel?: number;
    abilityEstimate?: number;
    hints?: Hint[];
  }) => Promise<void>;

  // Metrics recording
  recordMetric: (metric: {
    name: string;
    value: number;
    timestamp: number;
    metadata?: Record<string, any>;
  }) => Promise<void>;

  // Session logs (for post-assessment review)
  logDecision: (decision: {
    type: 'difficulty_change' | 'question_change' | 'hint_given';
    reasoning: string;
    timestamp: number;
  }) => Promise<void>;
}
```

### Data Storage Architecture

```typescript
// Recommended database structure

interface AssessmentDataStore {
  // Real-time session state (Redis/in-memory)
  sessionCache: {
    [`session:${sessionId}:state`]: SessionState;
    [`session:${sessionId}:events`]: SessionEvent[];  // Last 100 events
    [`session:${sessionId}:metrics`]: CurrentMetrics;
  };

  // Time-series metrics (InfluxDB/TimescaleDB)
  metricsDB: {
    measurement: 'session_metrics';
    tags: {
      sessionId: string;
      candidateId: string;
      metricType: string;
    };
    fields: {
      value: number;
      metadata: object;
    };
    timestamp: number;
  };

  // Question bank (PostgreSQL)
  questionDB: {
    seeds: QuestionSeed[];
    variants: QuestionVariant[];
    usage_history: QuestionUsage[];
  };

  // Session archive (PostgreSQL + S3)
  archiveDB: {
    sessions: SessionArchive[];
    codeSnapshots: string[];  // S3 URLs
    eventLogs: string[];      // S3 URLs
  };
}
```

---

## Security and Isolation Mechanisms

### Critical Security Requirements

1. **No Context Leakage**: Interview Agent insights must NEVER reach candidate
2. **No Prediction Access**: Candidate can't predict next questions
3. **No Scoring Visibility**: Candidate can't see ability estimates or scores
4. **Audit Trail**: All Interview Agent decisions must be logged for review

### Implementation Strategies

#### 1. Network-Level Isolation

```typescript
// Separate API endpoints with authentication

// Candidate-facing (authenticated as candidate)
POST /api/session/{sessionId}/chat
POST /api/session/{sessionId}/code
POST /api/session/{sessionId}/test

// Interview Agent (authenticated as system, internal only)
POST /internal/assessment/{sessionId}/analyze
POST /internal/assessment/{sessionId}/adjust-difficulty
GET /internal/assessment/{sessionId}/metrics

// Block candidate access to internal endpoints
middleware.requireRole(['system', 'admin'], '/internal/*');
```

#### 2. Response Filtering

```typescript
// Ensure no sensitive data leaks to candidate

class ResponseFilter {
  filterForCandidate(data: any): any {
    // Remove all Interview Agent fields
    const filtered = { ...data };

    delete filtered.abilityEstimate;
    delete filtered.difficultyLevel;
    delete filtered.nextQuestionPreview;
    delete filtered.assessmentScore;
    delete filtered.interviewAgentReasoning;

    return filtered;
  }
}

// Apply to all candidate-facing API responses
app.use('/api/session/*', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    return originalJson(this.responseFilter.filterForCandidate(data));
  };
  next();
});
```

#### 3. Audit Logging

```typescript
// Log all Interview Agent actions for compliance and debugging

class AuditLogger {
  async logAgentAction(action: {
    agentType: 'interview' | 'candidate';
    sessionId: string;
    actionType: string;
    inputs: any;
    outputs: any;
    reasoning?: string;
    timestamp: number;
  }) {
    // Immutable append-only log
    await this.auditDB.insert({
      ...action,
      hash: this.hash(action),  // Tamper detection
    });

    // Also export to OpenTelemetry
    this.otelLogger.emit('agent_action', action);
  }
}
```

#### 4. Question Bank Isolation

```typescript
// Prevent question leakage through API

class QuestionBankSecurity {
  async getNextQuestion(sessionId: string): Promise<Question> {
    // Interview Agent generates question
    const question = await this.interviewAgent.generateQuestion(sessionId);

    // Store full question (with answers, hints) in secure DB
    await this.secureDB.insert({
      questionId: question.id,
      fullQuestion: question,
      sessionId,
      shownAt: Date.now(),
    });

    // Return ONLY problem statement to candidate (no answers/hints)
    return {
      id: question.id,
      title: question.title,
      description: question.description,
      starterCode: question.starterCode,
      testCases: question.testCases.map(tc => ({
        input: tc.input,
        // NO EXPECTED OUTPUT shown to candidate for hidden tests
        visible: tc.visible,
      })),
      // NO hints, NO solution, NO difficulty level
    };
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal**: Basic multi-agent architecture with context isolation

- [ ] Set up Claude Agent SDK orchestrator
- [ ] Create separate candidate agent and interview agent instances
- [ ] Implement basic event stream (code changes, test runs)
- [ ] Verify context isolation with logging
- [ ] Build simple question rotation (no IRT yet)

**Deliverables**:
- Two agents running in parallel
- Event logging showing isolation
- Basic question sequencing

### Phase 2: Monitoring & Analytics (Week 3-4)

**Goal**: Real-time observability and performance tracking

- [ ] Integrate OpenTelemetry for metrics
- [ ] Build event processing pipeline
- [ ] Implement basic performance scoring
- [ ] Create monitoring dashboard (admin-only)
- [ ] Add anomaly detection alerts

**Deliverables**:
- OpenTelemetry metrics flowing to backend
- Dashboard showing live session metrics
- Alert system for struggling candidates

### Phase 3: Adaptive Question Generation (Week 5-6)

**Goal**: IRT-based difficulty adjustment and question seeds

- [ ] Implement IRT scoring engine
- [ ] Build question seed database
- [ ] Create LLM-based question generator
- [ ] Implement difficulty adjustment algorithm
- [ ] Test adaptive flow with pilot candidates

**Deliverables**:
- Question seed library (10+ seeds per topic)
- Working IRT ability estimation
- Adaptive difficulty in action

### Phase 4: Advanced Features (Week 7-8)

**Goal**: Hint generation, struggle detection, optimization

- [ ] Build contextual hint generator
- [ ] Implement struggle detection algorithm
- [ ] Add multi-dimensional difficulty control
- [ ] Optimize for response latency (<2s)
- [ ] A/B test different adaptation strategies

**Deliverables**:
- Smart hint system
- <2 second adaptation latency
- A/B test results

### Phase 5: Production Hardening (Week 9-10)

**Goal**: Security, compliance, scalability

- [ ] Security audit of context isolation
- [ ] Implement comprehensive audit logging
- [ ] Add rate limiting and abuse prevention
- [ ] Load testing for 100+ concurrent sessions
- [ ] Documentation and runbooks

**Deliverables**:
- Security audit report
- Scalability tested to 100+ concurrent sessions
- Complete documentation

---

## Technical Implementation Example

### Complete Interview Agent Class

```typescript
import { Agent, Message } from '@anthropic-ai/claude-sdk';
import { trace } from '@opentelemetry/api';

export class InterviewObserverAgent {
  private agent: Agent;
  private tracer = trace.getTracer('interview-agent');
  private irtScorer: IRTScorer;
  private questionGenerator: QuestionGenerator;
  private performanceTracker: PerformanceTracker;

  constructor(config: {
    sessionId: string;
    assessmentConfig: AssessmentConfiguration;
  }) {
    // Create isolated Claude agent instance
    this.agent = new Agent({
      name: 'InterviewObserver',
      systemPrompt: this.buildSystemPrompt(config.assessmentConfig),
      tools: this.buildToolSet(),
    });

    this.irtScorer = new IRTScorer();
    this.questionGenerator = new QuestionGenerator();
    this.performanceTracker = new PerformanceTracker(config.sessionId);
  }

  private buildSystemPrompt(config: AssessmentConfiguration): string {
    return `
You are an Interview Observer Agent for a technical assessment platform.

Your role:
1. Monitor candidate performance in real-time
2. Analyze code quality, test results, and AI usage patterns
3. Estimate candidate ability using Item Response Theory
4. Generate adaptive questions that match candidate skill level
5. Detect when candidates are struggling and suggest interventions

Assessment Configuration:
- Topics: ${config.topics.join(', ')}
- Duration: ${config.durationMinutes} minutes
- Starting Difficulty: ${config.startingDifficulty}
- Adaptation Strategy: ${config.adaptationStrategy}

Constraints:
- You NEVER communicate directly with the candidate
- You ONLY observe events and make recommendations
- All decisions must be justified with reasoning
- Maintain fairness and avoid bias

Output Format:
Always respond with structured JSON containing:
{
  "analysis": "Your reasoning",
  "abilityEstimate": theta_value,
  "confidence": 0-1,
  "recommendedAction": "next_question | adjust_difficulty | provide_hint | none",
  "actionParams": { ... }
}
    `.trim();
  }

  private buildToolSet() {
    return [
      this.analyzePerformanceTool(),
      this.generateQuestionTool(),
      this.updateAbilityTool(),
      this.queryMetricsTool(),
    ];
  }

  async observeEvents(events: SessionEvent[]): Promise<AssessmentDecision> {
    const span = this.tracer.startSpan('observe_events');

    try {
      // Update performance tracker
      await this.performanceTracker.ingestEvents(events);

      // Get current metrics
      const metrics = await this.performanceTracker.getCurrentMetrics();

      // Ask Interview Agent to analyze
      const response = await this.agent.chat([
        {
          role: 'user',
          content: JSON.stringify({
            action: 'analyze_and_recommend',
            events: events.slice(-10), // Last 10 events
            currentMetrics: metrics,
            timestamp: Date.now(),
          }),
        },
      ]);

      // Parse decision
      const decision = this.parseDecision(response);

      // Log for audit
      await this.auditLog('decision_made', decision);

      span.setAttributes({
        abilityEstimate: decision.abilityEstimate,
        confidence: decision.confidence,
        action: decision.recommendedAction,
      });

      return decision;

    } finally {
      span.end();
    }
  }

  async generateNextQuestion(context: QuestionContext): Promise<Question> {
    const span = this.tracer.startSpan('generate_question');

    try {
      // Select appropriate seed
      const seed = await this.questionGenerator.selectSeed({
        currentAbility: context.abilityEstimate,
        topicHistory: context.coveredTopics,
        timeRemaining: context.timeRemaining,
      });

      // Generate question variant
      const question = await this.questionGenerator.generate(
        seed,
        context.abilityEstimate
      );

      // Predict difficulty
      const predictedDifficulty = this.irtScorer.predictDifficulty(
        question,
        context.abilityEstimate
      );

      span.setAttributes({
        seedId: seed.seedId,
        targetDifficulty: context.abilityEstimate,
        predictedDifficulty,
      });

      return question;

    } finally {
      span.end();
    }
  }

  private parseDecision(response: Message): AssessmentDecision {
    // Extract JSON from response
    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Interview Agent response missing JSON');
    }

    return JSON.parse(jsonMatch[0]);
  }

  private async auditLog(action: string, data: any) {
    await this.auditLogger.log({
      agentType: 'interview',
      sessionId: this.sessionId,
      action,
      data,
      timestamp: Date.now(),
    });
  }
}
```

### Orchestrator Integration

```typescript
export class SessionOrchestrator {
  private candidateAgent: CandidateAssistantAgent;
  private interviewAgent: InterviewObserverAgent;
  private eventStream: EventStream;
  private sessionState: SessionState;

  async initialize(sessionId: string, config: AssessmentConfiguration) {
    // Create both agents with isolated contexts
    this.candidateAgent = new CandidateAssistantAgent({
      sessionId,
      allowedTools: ['code_editor', 'terminal', 'test_runner'],
    });

    this.interviewAgent = new InterviewObserverAgent({
      sessionId,
      assessmentConfig: config,
    });

    // Set up event routing
    this.eventStream.subscribe('*', async (event) => {
      // Route to appropriate agent
      if (this.isCandidateFacing(event)) {
        await this.candidateAgent.handleEvent(event);
      } else {
        // All events go to Interview Agent for observation
        await this.interviewAgent.observeEvents([event]);
      }
    });

    // Initialize with first question
    const firstQuestion = await this.interviewAgent.generateNextQuestion({
      abilityEstimate: 0, // Start at average
      coveredTopics: [],
      timeRemaining: config.durationMinutes * 60,
    });

    this.sessionState.currentQuestion = firstQuestion;
  }

  async handleCandidateMessage(message: string): Promise<string> {
    // Candidate messages go ONLY to candidate agent
    const response = await this.candidateAgent.respondToMessage(message);

    // Log interaction for Interview Agent observation
    this.eventStream.publish({
      type: 'ai_prompt',
      sessionId: this.sessionId,
      promptText: message,
      responseText: response,
      timestamp: Date.now(),
    });

    return response;
  }

  async handleTestRun(results: TestResults): Promise<void> {
    // Publish test results
    this.eventStream.publish({
      type: 'test_run',
      sessionId: this.sessionId,
      results,
      timestamp: Date.now(),
    });

    // Check if Interview Agent recommends action
    const decision = await this.interviewAgent.observeEvents(
      this.eventStream.getRecent(10)
    );

    // Execute recommended action
    if (decision.recommendedAction === 'next_question') {
      await this.advanceToNextQuestion(decision);
    } else if (decision.recommendedAction === 'provide_hint') {
      await this.provideHint(decision.actionParams);
    }
  }

  private async advanceToNextQuestion(decision: AssessmentDecision) {
    const nextQuestion = await this.interviewAgent.generateNextQuestion({
      abilityEstimate: decision.abilityEstimate,
      coveredTopics: this.sessionState.coveredTopics,
      timeRemaining: this.sessionState.timeRemaining,
    });

    this.sessionState.currentQuestion = nextQuestion;
    this.sessionState.coveredTopics.push(nextQuestion.topic);

    // Notify candidate (through filtered response)
    await this.notifyCandidateNewQuestion(nextQuestion);
  }
}
```

---

## References and Resources

### Academic Research

1. **Adaptive Question Generation with IRT**
   - "Adaptive Question–Answer Generation With Difficulty Control Using Item Response Theory and Pretrained Transformer Models" (IEEE, 2024)
   - ArXiv: https://arxiv.org/html/2508.14025v1

2. **Multi-Agent Systems**
   - "Agent Design Pattern Catalogue: A Collection of Architectural Patterns for Foundation Model based Agents" (ArXiv 2405.10467)
   - https://arxiv.org/abs/2405.10467

3. **AI Agent Observability**
   - "AgentSight: System-Level Observability for AI Agents Using eBPF" (ArXiv 2508.02736)
   - https://arxiv.org/html/2508.02736

### Industry Documentation

4. **Claude Agent SDK**
   - Official Docs: https://docs.claude.com/en/docs/agent-sdk/subagents
   - Subagent Guide: https://www.cursor-ide.com/blog/claude-subagents
   - Best Practices: https://skywork.ai/blog/claude-agent-sdk-best-practices-ai-agents-2025/

5. **Azure AI Agent Patterns**
   - AI Agent Orchestration Patterns: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns

6. **OpenTelemetry for AI Agents**
   - AI Agent Observability: https://opentelemetry.io/blog/2025/ai-agent-observability/
   - Claude Code Monitoring: https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/

### Tools and Platforms

7. **Observability Tools**
   - Langfuse: https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse
   - Comparison: https://research.aimultiple.com/agentic-monitoring/

8. **Assessment Platforms (Competitive Research)**
   - Vervoe: https://vervoe.com/
   - Glider AI: https://glider.ai/product/skill-assessment-software/
   - Codility: https://www.codility.com/

### Technical Implementations

9. **Multi-Agent Orchestration**
   - AWS Multi-Agent Orchestrator: https://www.infoq.com/news/2024/12/aws-multi-agent/
   - Event-Driven Multi-Agent: https://www.confluent.io/blog/event-driven-multi-agent-systems/

10. **GitHub Examples**
    - Claude Code Multi-Agent Observability: https://github.com/disler/claude-code-hooks-multi-agent-observability
    - Multi-Agent Orchestration: https://github.com/wshobson/agents

---

## Appendix: Key Takeaways

### Architecture Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Multi-Agent Pattern** | Orchestrator-Worker | Clear separation, proven scalability |
| **Context Isolation** | Subagent memory isolation + separate API instances | Prevents leakage, maintains security |
| **Adaptive Testing** | Item Response Theory + LLM generation | Psychometrically sound, flexible |
| **Monitoring** | OpenTelemetry + event streams | Industry standard, real-time capable |
| **Question System** | Seed-based with dynamic generation | Controlled variation, reusable |
| **Communication** | One-way event-driven | Interview Agent observes, never responds to candidate |

### Critical Success Factors

1. **Absolute Context Isolation**: Zero tolerance for leakage to candidate
2. **Low Latency**: <2s for difficulty adjustments, <5s for question generation
3. **Psychometric Validity**: IRT implementation must be mathematically sound
4. **Audit Trail**: Every decision logged and traceable
5. **Scalability**: Support 100+ concurrent sessions

### Next Steps

1. **Proof of Concept**: Build minimal orchestrator + 2 agents
2. **Validate Isolation**: Extensive testing to confirm no context leakage
3. **IRT Implementation**: Partner with psychometrician for validation
4. **Pilot Testing**: 10-20 real interviews to tune algorithms
5. **Production Deployment**: Gradual rollout with monitoring

---

**Document Version**: 1.0
**Last Updated**: 2025-11-13
**Author**: Research synthesis from web sources + InterviewLM context
