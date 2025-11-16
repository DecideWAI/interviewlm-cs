# Evaluation Agent Architecture for InterviewLM

**Document Version**: 1.0
**Date**: November 13, 2025
**Status**: Research & Design Complete

---

## Executive Summary

This document provides a comprehensive architecture for building an **Evaluation Agent** that analyzes completed interview sessions and generates evidence-based assessment reports. The agent runs post-interview to score candidates on multiple dimensions using AI-powered analysis grounded in observable data.

### Key Principles

1. **Evidence-Based Scoring**: All scores must reference specific, observable data points from the session
2. **No Assumptions**: The agent should never infer intent or capability beyond what's demonstrated
3. **Confidence Scoring**: Each assessment includes confidence levels based on data availability
4. **Transparency**: Every score includes justification with specific timestamps and examples
5. **Bias Mitigation**: Multiple evaluation strategies to reduce false positives and systematic biases

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EVALUATION AGENT                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Data         │  │ Analysis     │  │ Report       │      │
│  │ Aggregator   │→│ Engine       │→│ Generator    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Input: Session Recording Data                    │       │
│  │ - Code snapshots (diffs + final state)           │       │
│  │ - Claude interactions (prompts + responses)      │       │
│  │ - Terminal commands and output                   │       │
│  │ - Test results (pass/fail, timing)               │       │
│  │ - Session events (timeline)                      │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Multi-Dimensional Scoring                        │       │
│  │ 1. Code Quality (40%)                            │       │
│  │ 2. Problem Solving (25%)                         │       │
│  │ 3. AI Collaboration (20%)                        │       │
│  │ 4. Communication (15%)                           │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Output: Structured Evaluation Report             │       │
│  │ - Overall score (0-100)                          │       │
│  │ - Dimension breakdowns with evidence             │       │
│  │ - Skill level assessment (Junior/Mid/Senior)     │       │
│  │ - Confidence intervals                           │       │
│  │ - Detailed justifications with timestamps        │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Data Aggregation Layer

### 1.1 Input Data Schema

The Evaluation Agent requires comprehensive access to the session recording data already being captured by InterviewLM:

```typescript
interface SessionRecordingData {
  // Core session metadata
  session: {
    id: string;
    candidateId: string;
    assessmentId: string;
    startTime: Date;
    endTime: Date;
    duration: number; // seconds
    status: 'COMPLETED' | 'ABANDONED' | 'EXPIRED';
  };

  // Code evolution data
  codeSnapshots: Array<{
    id: string;
    timestamp: Date;
    fileId: string;
    fileName: string;
    language: string;
    contentHash: string;
    fullContent: string;
    diffFromPrevious?: {
      linesAdded: number;
      linesDeleted: number;
      linesModified: number;
      changes: DiffChange[];
    };
  }>;

  // AI interaction history
  claudeInteractions: Array<{
    id: string;
    timestamp: Date;
    prompt: string;
    response: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latency: number; // milliseconds
    stopReason: string;
  }>;

  // Terminal activity
  terminalEvents: Array<{
    timestamp: Date;
    type: 'input' | 'output';
    command?: string;
    output?: string;
    exitCode?: number;
  }>;

  // Test execution results
  testResults: Array<{
    id: string;
    timestamp: Date;
    testName: string;
    passed: boolean;
    output: string;
    error?: string;
    duration: number; // milliseconds
  }>;

  // Session timeline events
  events: Array<{
    id: string;
    timestamp: Date;
    type: string;
    data: Record<string, any>;
  }>;

  // Question context
  question: {
    id: string;
    title: string;
    description: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    expectedSolution?: string;
    testCases: Array<{
      name: string;
      hidden: boolean;
    }>;
  };
}
```

### 1.2 Data Aggregation Service

**File**: `lib/services/evaluationDataAggregator.ts`

```typescript
import { prisma } from '@/lib/prisma';

export class EvaluationDataAggregator {
  /**
   * Fetches and aggregates all session data for evaluation
   */
  async aggregateSessionData(sessionId: string): Promise<SessionRecordingData> {
    const sessionRecording = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
      include: {
        candidate: {
          include: {
            generatedQuestions: {
              orderBy: { order: 'asc' },
              take: 1,
            },
          },
        },
        codeSnapshots: {
          orderBy: { timestamp: 'asc' },
        },
        claudeInteractions: {
          orderBy: { timestamp: 'asc' },
        },
        testResults: {
          orderBy: { timestamp: 'asc' },
        },
        events: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!sessionRecording) {
      throw new Error(`Session recording not found: ${sessionId}`);
    }

    // Extract terminal events from general events
    const terminalEvents = sessionRecording.events
      .filter(e => e.type.startsWith('terminal_'))
      .map(e => ({
        timestamp: e.timestamp,
        type: e.type === 'terminal_input' ? 'input' : 'output',
        command: e.data.command,
        output: e.data.output,
        exitCode: e.data.exitCode,
      }));

    // Compute diffs between consecutive code snapshots
    const codeSnapshotsWithDiffs = this.computeCodeDiffs(
      sessionRecording.codeSnapshots
    );

    return {
      session: {
        id: sessionRecording.id,
        candidateId: sessionRecording.candidateId,
        assessmentId: sessionRecording.candidate.assessmentId,
        startTime: sessionRecording.startTime,
        endTime: sessionRecording.endTime!,
        duration: sessionRecording.duration!,
        status: sessionRecording.status as any,
      },
      codeSnapshots: codeSnapshotsWithDiffs,
      claudeInteractions: sessionRecording.claudeInteractions,
      terminalEvents,
      testResults: sessionRecording.testResults,
      events: sessionRecording.events,
      question: sessionRecording.candidate.generatedQuestions[0],
    };
  }

  /**
   * Computes diffs between consecutive code snapshots
   */
  private computeCodeDiffs(snapshots: any[]) {
    const result = [];
    for (let i = 0; i < snapshots.length; i++) {
      const current = snapshots[i];
      const previous = i > 0 ? snapshots[i - 1] : null;

      if (previous && previous.fileId === current.fileId) {
        const diff = this.diffLines(previous.fullContent, current.fullContent);
        result.push({
          ...current,
          diffFromPrevious: diff,
        });
      } else {
        result.push(current);
      }
    }
    return result;
  }

  /**
   * Simple line-based diff computation
   */
  private diffLines(oldContent: string, newContent: string) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let linesAdded = 0;
    let linesDeleted = 0;
    let linesModified = 0;

    // Simple heuristic: compare line counts
    if (newLines.length > oldLines.length) {
      linesAdded = newLines.length - oldLines.length;
    } else if (newLines.length < oldLines.length) {
      linesDeleted = oldLines.length - newLines.length;
    }

    // Count modified lines (lines that exist in both but differ)
    const minLength = Math.min(oldLines.length, newLines.length);
    for (let i = 0; i < minLength; i++) {
      if (oldLines[i] !== newLines[i]) {
        linesModified++;
      }
    }

    return {
      linesAdded,
      linesDeleted,
      linesModified,
      changes: [], // Detailed diff can be computed with jsdiff if needed
    };
  }
}
```

---

## 2. Analysis Engine

### 2.1 Multi-Dimensional Scoring Framework

Based on research from top tech companies (FAANG), technical interviews should evaluate 4 core dimensions:

#### Dimension 1: Code Quality (40% weight)

**Evidence Sources**:
- Final code snapshot (syntax, structure, patterns)
- Code evolution (refactoring, improvements)
- Test results (correctness, edge cases)
- Static analysis metrics (complexity, maintainability)

**Sub-Metrics**:
```typescript
interface CodeQualityScore {
  correctness: number;        // 0-100: Based on test pass rate
  codeStructure: number;      // 0-100: Naming, organization, modularity
  efficiency: number;         // 0-100: Time/space complexity
  errorHandling: number;      // 0-100: Edge cases, validation
  codeClarity: number;        // 0-100: Readability, comments
  testCoverage: number;       // 0-100: % of test cases passed

  overall: number;            // Weighted average
  confidence: number;         // 0-1: Confidence in assessment
  evidence: CodeQualityEvidence[];
}

interface CodeQualityEvidence {
  metric: string;
  value: number;
  justification: string;
  examples: Array<{
    timestamp: Date;
    fileId: string;
    lineNumber?: number;
    snippet?: string;
  }>;
}
```

**Analysis Approach**:

```typescript
class CodeQualityAnalyzer {
  /**
   * Analyzes code quality using both static analysis and LLM evaluation
   */
  async analyzeCodeQuality(
    codeSnapshots: CodeSnapshot[],
    testResults: TestResult[],
    question: Question
  ): Promise<CodeQualityScore> {
    // 1. Correctness: Objective metric from test results
    const correctness = this.calculateCorrectness(testResults);

    // 2. Static analysis metrics
    const finalCode = codeSnapshots[codeSnapshots.length - 1];
    const staticMetrics = await this.runStaticAnalysis(finalCode);

    // 3. LLM-based code review (with strict prompt)
    const llmReview = await this.llmCodeReview(finalCode, question);

    // 4. Code evolution analysis
    const evolutionScore = this.analyzeCodeEvolution(codeSnapshots);

    // Combine scores with confidence weighting
    return this.combineCodeQualityScores({
      correctness,
      staticMetrics,
      llmReview,
      evolutionScore,
    });
  }

  /**
   * Calculates correctness based on test pass rate
   * This is the most objective metric we have
   */
  private calculateCorrectness(testResults: TestResult[]): number {
    if (testResults.length === 0) return 0;

    const latestTestRun = this.getLatestTestRun(testResults);
    const passed = latestTestRun.filter(t => t.passed).length;
    const total = latestTestRun.length;

    return (passed / total) * 100;
  }

  /**
   * Runs static analysis on final code
   * Uses ESLint for JS/TS, Pylint for Python, etc.
   */
  private async runStaticAnalysis(codeSnapshot: CodeSnapshot) {
    // Use language-specific linters
    switch (codeSnapshot.language) {
      case 'typescript':
      case 'javascript':
        return this.analyzeJavaScript(codeSnapshot.fullContent);
      case 'python':
        return this.analyzePython(codeSnapshot.fullContent);
      case 'go':
        return this.analyzeGo(codeSnapshot.fullContent);
      default:
        return null;
    }
  }

  /**
   * LLM-based code review with structured output
   * Uses Claude with strict JSON schema to ensure consistency
   */
  private async llmCodeReview(
    codeSnapshot: CodeSnapshot,
    question: Question
  ): Promise<LLMCodeReview> {
    const prompt = `You are an expert code reviewer evaluating a candidate's solution to a coding challenge.

CHALLENGE:
${question.description}

CANDIDATE'S SOLUTION:
\`\`\`${codeSnapshot.language}
${codeSnapshot.fullContent}
\`\`\`

Evaluate the code on the following dimensions. For each dimension:
1. Provide a score (0-100)
2. Cite SPECIFIC evidence from the code (line numbers, snippets)
3. DO NOT make assumptions about intent
4. DO NOT penalize for style preferences unless they impact readability
5. Focus ONLY on what is demonstrable in the code

Return your evaluation in the following JSON format:
{
  "codeStructure": {
    "score": number,
    "evidence": [
      {
        "observation": "string (what you observed)",
        "location": "string (line numbers or function names)",
        "impact": "string (how this affects the score)"
      }
    ]
  },
  "efficiency": {
    "score": number,
    "evidence": [...]
  },
  "errorHandling": {
    "score": number,
    "evidence": [...]
  },
  "codeClarity": {
    "score": number,
    "evidence": [...]
  }
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.1, // Low temperature for consistency
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, // Structured output
    });

    return JSON.parse(response.content[0].text);
  }

  /**
   * Analyzes how the code evolved during the session
   * Progressive improvement indicates better problem-solving
   */
  private analyzeCodeEvolution(codeSnapshots: CodeSnapshot[]): EvolutionScore {
    if (codeSnapshots.length < 2) {
      return { score: 50, confidence: 0.3 }; // Low confidence
    }

    let improvementCount = 0;
    let regressionCount = 0;

    for (let i = 1; i < codeSnapshots.length; i++) {
      const prev = codeSnapshots[i - 1];
      const curr = codeSnapshots[i];

      // Check if code quality improved
      if (this.isImprovement(prev, curr)) {
        improvementCount++;
      } else if (this.isRegression(prev, curr)) {
        regressionCount++;
      }
    }

    const score = this.calculateEvolutionScore(
      improvementCount,
      regressionCount,
      codeSnapshots.length
    );

    return {
      score,
      confidence: Math.min(codeSnapshots.length / 10, 1.0),
      improvements: improvementCount,
      regressions: regressionCount,
    };
  }
}
```

#### Dimension 2: Problem Solving (25% weight)

**Evidence Sources**:
- Time to first code
- Number of iterations
- Debugging patterns (terminal activity)
- Test result progression
- AI interaction patterns

**Sub-Metrics**:
```typescript
interface ProblemSolvingScore {
  approach: number;           // 0-100: Strategic vs trial-and-error
  debugging: number;          // 0-100: Systematic debugging skills
  efficiency: number;         // 0-100: Time management
  adaptability: number;       // 0-100: Response to failures

  overall: number;
  confidence: number;
  evidence: ProblemSolvingEvidence[];
}
```

**Analysis Approach**:

```typescript
class ProblemSolvingAnalyzer {
  /**
   * Analyzes problem-solving approach from session timeline
   */
  async analyzeProblemSolving(
    codeSnapshots: CodeSnapshot[],
    testResults: TestResult[],
    terminalEvents: TerminalEvent[],
    claudeInteractions: ClaudeInteraction[],
    session: Session
  ): Promise<ProblemSolvingScore> {
    // 1. Analyze approach pattern
    const approachScore = this.analyzeApproach({
      codeSnapshots,
      testResults,
      claudeInteractions,
    });

    // 2. Debugging skills
    const debuggingScore = this.analyzeDebugging({
      terminalEvents,
      testResults,
      claudeInteractions,
    });

    // 3. Time efficiency
    const efficiencyScore = this.analyzeEfficiency({
      session,
      codeSnapshots,
      testResults,
    });

    // 4. Adaptability to failures
    const adaptabilityScore = this.analyzeAdaptability({
      testResults,
      codeSnapshots,
    });

    return {
      approach: approachScore.score,
      debugging: debuggingScore.score,
      efficiency: efficiencyScore.score,
      adaptability: adaptabilityScore.score,
      overall: this.weightedAverage([
        { value: approachScore.score, weight: 0.3 },
        { value: debuggingScore.score, weight: 0.3 },
        { value: efficiencyScore.score, weight: 0.2 },
        { value: adaptabilityScore.score, weight: 0.2 },
      ]),
      confidence: Math.min(
        approachScore.confidence,
        debuggingScore.confidence,
        efficiencyScore.confidence,
        adaptabilityScore.confidence
      ),
      evidence: [
        ...approachScore.evidence,
        ...debuggingScore.evidence,
        ...efficiencyScore.evidence,
        ...adaptabilityScore.evidence,
      ],
    };
  }

  /**
   * Determines if approach was strategic or trial-and-error
   */
  private analyzeApproach(data: {
    codeSnapshots: CodeSnapshot[];
    testResults: TestResult[];
    claudeInteractions: ClaudeInteraction[];
  }): ScoredEvidence {
    // Look for patterns:
    // - Strategic: Few iterations, tests pass early, focused questions
    // - Trial-and-error: Many iterations, random changes, desperate questions

    const iterations = this.countSignificantIterations(data.codeSnapshots);
    const testProgressionPattern = this.analyzeTestProgression(data.testResults);
    const questionQuality = this.analyzeQuestionQuality(data.claudeInteractions);

    // Strategic approach indicators:
    const strategicIndicators = [];
    if (iterations < 5) {
      strategicIndicators.push({
        observation: `Only ${iterations} significant code iterations`,
        impact: 'Suggests planning before implementation',
      });
    }
    if (testProgressionPattern === 'steady_improvement') {
      strategicIndicators.push({
        observation: 'Test pass rate improved steadily',
        impact: 'Indicates systematic debugging',
      });
    }
    if (questionQuality === 'high') {
      strategicIndicators.push({
        observation: 'Questions were specific and goal-oriented',
        impact: 'Shows clear understanding of problem',
      });
    }

    // Calculate score
    const score = this.calculateApproachScore(strategicIndicators.length);

    return {
      score,
      confidence: data.codeSnapshots.length > 3 ? 0.8 : 0.5,
      evidence: strategicIndicators,
    };
  }

  /**
   * Analyzes debugging skills from terminal activity
   */
  private analyzeDebugging(data: {
    terminalEvents: TerminalEvent[];
    testResults: TestResult[];
    claudeInteractions: ClaudeInteraction[];
  }): ScoredEvidence {
    // Look for:
    // - Use of debugging tools (console.log, debugger, pdb)
    // - Systematic testing of hypotheses
    // - Reading error messages carefully (not just copy-pasting to Claude)

    const debuggingCommands = data.terminalEvents.filter(e =>
      e.type === 'input' &&
      this.isDebuggingCommand(e.command)
    );

    const errorAnalysisQuality = this.analyzeErrorHandling(
      data.claudeInteractions,
      data.testResults
    );

    const evidence = [];
    if (debuggingCommands.length > 0) {
      evidence.push({
        observation: `Used debugging commands ${debuggingCommands.length} times`,
        examples: debuggingCommands.slice(0, 3).map(cmd => cmd.command),
        impact: 'Demonstrates systematic debugging approach',
      });
    }

    if (errorAnalysisQuality === 'high') {
      evidence.push({
        observation: 'Asked specific questions about error messages',
        impact: 'Shows ability to interpret and analyze errors',
      });
    }

    const score = this.calculateDebuggingScore(evidence);

    return {
      score,
      confidence: debuggingCommands.length > 0 ? 0.7 : 0.4,
      evidence,
    };
  }
}
```

#### Dimension 3: AI Collaboration (20% weight)

**This is unique to InterviewLM** - evaluating how well candidates use AI assistance.

**Evidence Sources**:
- Prompt quality (specific vs vague)
- Context provided in prompts
- Response utilization rate
- Independence vs over-reliance

**Sub-Metrics**:
```typescript
interface AICollaborationScore {
  promptQuality: number;      // 0-100: Specific, contextual prompts
  contextAwareness: number;   // 0-100: Includes relevant context
  responseUtilization: number;// 0-100: Actually uses AI suggestions
  independence: number;       // 0-100: Doesn't over-rely on AI

  overall: number;
  confidence: number;
  evidence: AICollaborationEvidence[];
}
```

**Analysis Approach**:

```typescript
class AICollaborationAnalyzer {
  /**
   * Analyzes quality of AI collaboration
   */
  async analyzeAICollaboration(
    claudeInteractions: ClaudeInteraction[],
    codeSnapshots: CodeSnapshot[]
  ): Promise<AICollaborationScore> {
    if (claudeInteractions.length === 0) {
      return {
        promptQuality: 0,
        contextAwareness: 0,
        responseUtilization: 0,
        independence: 100, // Solved without AI
        overall: 25, // Neutral score
        confidence: 1.0,
        evidence: [{
          observation: 'No AI interactions',
          impact: 'Solved problem independently',
        }],
      };
    }

    // 1. Prompt quality analysis
    const promptQuality = await this.analyzePromptQuality(claudeInteractions);

    // 2. Context awareness
    const contextAwareness = this.analyzeContextAwareness(claudeInteractions);

    // 3. Response utilization
    const responseUtilization = this.analyzeResponseUtilization(
      claudeInteractions,
      codeSnapshots
    );

    // 4. Independence score (penalize over-reliance)
    const independence = this.analyzeIndependence(
      claudeInteractions,
      codeSnapshots
    );

    return {
      promptQuality: promptQuality.score,
      contextAwareness: contextAwareness.score,
      responseUtilization: responseUtilization.score,
      independence: independence.score,
      overall: this.weightedAverage([
        { value: promptQuality.score, weight: 0.3 },
        { value: contextAwareness.score, weight: 0.2 },
        { value: responseUtilization.score, weight: 0.3 },
        { value: independence.score, weight: 0.2 },
      ]),
      confidence: Math.min(
        promptQuality.confidence,
        contextAwareness.confidence,
        responseUtilization.confidence
      ),
      evidence: [
        ...promptQuality.evidence,
        ...contextAwareness.evidence,
        ...responseUtilization.evidence,
        ...independence.evidence,
      ],
    };
  }

  /**
   * Uses LLM to evaluate prompt quality
   * Meta-evaluation: Using Claude to evaluate Claude usage
   */
  private async analyzePromptQuality(
    interactions: ClaudeInteraction[]
  ): Promise<ScoredEvidence> {
    const prompts = interactions.map(i => i.prompt);

    const evaluationPrompt = `You are evaluating the quality of prompts used by a developer during a coding interview.

PROMPTS TO EVALUATE:
${prompts.map((p, i) => `[${i + 1}] ${p}`).join('\n\n')}

For each prompt, evaluate:
1. **Specificity**: Is the question clear and specific?
2. **Context**: Does the prompt include relevant code/error messages?
3. **Goal-orientation**: Is it clear what the developer wants to achieve?

Assign each prompt a quality score:
- 0-40: Vague, no context, unclear goal (e.g., "help me fix this")
- 41-70: Somewhat specific, minimal context (e.g., "how do I sort an array?")
- 71-100: Very specific, includes context, clear goal (e.g., "I'm getting TypeError: cannot read property 'length' of undefined on line 23. Here's my code: [code]. How can I fix this?")

Return JSON:
{
  "prompts": [
    {
      "index": number,
      "score": number,
      "reasoning": "string"
    }
  ],
  "overallScore": number,
  "patterns": ["string (observed patterns, e.g., 'improved over time')"]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: 'user', content: evaluationPrompt }],
      response_format: { type: 'json_object' },
    });

    const evaluation = JSON.parse(response.content[0].text);

    return {
      score: evaluation.overallScore,
      confidence: Math.min(interactions.length / 5, 1.0),
      evidence: evaluation.patterns.map(pattern => ({
        observation: pattern,
        examples: evaluation.prompts
          .filter(p => p.reasoning.includes(pattern))
          .map(p => prompts[p.index - 1]),
      })),
    };
  }

  /**
   * Determines if candidate used AI suggestions effectively
   */
  private analyzeResponseUtilization(
    interactions: ClaudeInteraction[],
    codeSnapshots: CodeSnapshot[]
  ): ScoredEvidence {
    // For each AI response, check if the suggestion was incorporated into code

    const utilizedCount = interactions.filter((interaction, idx) => {
      // Find code snapshots after this interaction
      const subsequentSnapshots = codeSnapshots.filter(
        snap => snap.timestamp > interaction.timestamp
      );

      if (subsequentSnapshots.length === 0) return false;

      // Simple heuristic: Check if response contained code and if it appears in subsequent snapshots
      const codeInResponse = this.extractCodeFromResponse(interaction.response);
      if (!codeInResponse) return false;

      // Check if any subsequent snapshot contains similar code
      return subsequentSnapshots.some(snap =>
        this.containsSimilarCode(snap.fullContent, codeInResponse)
      );
    }).length;

    const utilizationRate = (utilizedCount / interactions.length) * 100;

    const evidence = [];
    if (utilizationRate > 70) {
      evidence.push({
        observation: `Utilized ${utilizationRate.toFixed(0)}% of AI suggestions`,
        impact: 'Effectively incorporated AI guidance',
      });
    } else if (utilizationRate < 30) {
      evidence.push({
        observation: `Only utilized ${utilizationRate.toFixed(0)}% of AI suggestions`,
        impact: 'May indicate ignoring AI assistance or asking ineffective questions',
      });
    }

    return {
      score: utilizationRate,
      confidence: 0.6, // Medium confidence (heuristic-based)
      evidence,
    };
  }

  /**
   * Checks if candidate over-relied on AI vs solving independently
   */
  private analyzeIndependence(
    interactions: ClaudeInteraction[],
    codeSnapshots: CodeSnapshot[]
  ): ScoredEvidence {
    const totalCodeChanges = codeSnapshots.length;
    const aiInteractionCount = interactions.length;

    // Red flags for over-reliance:
    // - More AI interactions than code iterations
    // - Asking AI to write entire functions
    // - Not attempting to debug before asking AI

    const interactionRatio = aiInteractionCount / totalCodeChanges;
    const overRelianceIndicators = [];

    if (interactionRatio > 0.5) {
      overRelianceIndicators.push({
        observation: `${aiInteractionCount} AI interactions for ${totalCodeChanges} code changes`,
        impact: 'High interaction ratio suggests over-reliance',
      });
    }

    // Check for "write entire function" prompts
    const delegationPrompts = interactions.filter(i =>
      /write|create|implement|generate|code.*function/.test(i.prompt.toLowerCase())
    );

    if (delegationPrompts.length > interactions.length * 0.3) {
      overRelianceIndicators.push({
        observation: `${delegationPrompts.length} prompts asking AI to write code`,
        examples: delegationPrompts.slice(0, 2).map(p => p.prompt),
        impact: 'Excessive delegation to AI',
      });
    }

    // Calculate independence score (inverse of over-reliance)
    const score = overRelianceIndicators.length === 0 ? 100 :
                  overRelianceIndicators.length === 1 ? 70 : 40;

    return {
      score,
      confidence: 0.7,
      evidence: overRelianceIndicators,
    };
  }
}
```

#### Dimension 4: Communication (15% weight)

**Evidence Sources**:
- Prompt clarity and grammar
- Question formulation
- Code comments
- README documentation (if added)

**Sub-Metrics**:
```typescript
interface CommunicationScore {
  clarity: number;            // 0-100: Clear, well-structured questions
  documentation: number;      // 0-100: Code comments, README
  technicalWriting: number;   // 0-100: Technical accuracy in prompts

  overall: number;
  confidence: number;
  evidence: CommunicationEvidence[];
}
```

---

## 3. Scoring Methodologies

### 3.1 Evidence-Based Scoring Framework

**Core Principle**: Every score must be justified with specific, observable evidence.

```typescript
interface ScoredDimension {
  score: number;              // 0-100
  confidence: number;         // 0-1 (how confident we are in this score)
  evidence: Evidence[];       // Supporting evidence
  dataQuality: DataQuality;   // Quality/completeness of input data
}

interface Evidence {
  type: 'code' | 'test' | 'ai_interaction' | 'terminal' | 'timeline';
  observation: string;        // What was observed
  timestamp?: Date;           // When it occurred
  location?: string;          // Where in code/session
  snippet?: string;           // Code snippet or example
  impact: string;             // How this affects the score
  weight: number;             // 0-1: How much this evidence matters
}

interface DataQuality {
  completeness: number;       // 0-1: How complete is the data
  reliability: number;        // 0-1: How reliable are the measurements
  sample_size: number;        // Number of data points
  missing_data: string[];     // What data is missing
}
```

### 3.2 Confidence Scoring

**Confidence depends on**:
1. **Data completeness**: More data = higher confidence
2. **Measurement reliability**: Objective metrics (test results) > subjective (code style)
3. **Sample size**: More iterations, tests, interactions = higher confidence
4. **Consistency**: Scores from multiple methods agree = higher confidence

```typescript
class ConfidenceCalculator {
  calculateConfidence(
    dimension: string,
    dataPoints: number,
    objectiveMetricAvailable: boolean,
    multipleMethodsAgree: boolean
  ): number {
    let confidence = 0.5; // Base confidence

    // Factor 1: Data volume
    if (dataPoints < 3) confidence *= 0.6;
    else if (dataPoints < 10) confidence *= 0.8;
    else confidence *= 1.0;

    // Factor 2: Objectivity
    if (objectiveMetricAvailable) confidence *= 1.2;
    else confidence *= 0.9;

    // Factor 3: Method agreement
    if (multipleMethodsAgree) confidence *= 1.1;
    else confidence *= 0.95;

    return Math.min(confidence, 1.0);
  }
}
```

### 3.3 Avoiding False Positives

**Strategy 1: Multi-Method Validation**

Use multiple independent analysis methods and only give high scores when they agree:

```typescript
class FalsePositiveMitigation {
  /**
   * Validates a score using multiple independent methods
   */
  async validateScore(
    dimension: string,
    primaryScore: number,
    data: SessionRecordingData
  ): Promise<ValidatedScore> {
    const methods = this.getValidationMethods(dimension);
    const scores = await Promise.all(
      methods.map(method => method.analyze(data))
    );

    // Check for agreement (all methods within 20 points)
    const agreement = this.checkAgreement(scores);

    if (agreement) {
      return {
        score: this.average(scores),
        confidence: 0.9,
        validated: true,
      };
    } else {
      // Methods disagree - low confidence
      return {
        score: this.average(scores),
        confidence: 0.4,
        validated: false,
        warning: 'Validation methods produced conflicting scores',
      };
    }
  }
}
```

**Strategy 2: Require Specific Evidence**

Never give high scores without specific, demonstrable evidence:

```typescript
class EvidenceValidator {
  /**
   * Validates that claimed score is supported by evidence
   */
  validateEvidence(score: number, evidence: Evidence[]): boolean {
    // High scores require strong evidence
    const requiredEvidenceCount = score > 80 ? 3 : score > 60 ? 2 : 1;

    if (evidence.length < requiredEvidenceCount) {
      console.warn(`Score ${score} requires at least ${requiredEvidenceCount} pieces of evidence`);
      return false;
    }

    // Each evidence must have specific examples
    const allHaveExamples = evidence.every(e =>
      e.snippet || e.location || e.timestamp
    );

    if (!allHaveExamples) {
      console.warn('Evidence missing specific examples');
      return false;
    }

    return true;
  }
}
```

**Strategy 3: Bias Detection & Correction**

Test for known biases and adjust scores:

```typescript
class BiasDetector {
  /**
   * Detects and corrects for known evaluation biases
   */
  detectBiases(evaluation: EvaluationReport): BiasReport {
    const biases = [];

    // Bias 1: Code volume bias (more code = better score)
    const codeVolumeCorrelation = this.correlate(
      evaluation.codeSnapshots.map(s => s.fullContent.length),
      evaluation.scores.codeQuality.score
    );
    if (codeVolumeCorrelation > 0.7) {
      biases.push({
        type: 'code_volume_bias',
        severity: 'medium',
        recommendation: 'Review if score is based on quality vs quantity',
      });
    }

    // Bias 2: AI usage bias (using AI = lower score)
    if (evaluation.claudeInteractions.length > 5 &&
        evaluation.scores.problemSolving.score < 60) {
      biases.push({
        type: 'ai_usage_penalty_bias',
        severity: 'high',
        recommendation: 'Using AI effectively should not penalize problem-solving score',
      });
    }

    // Bias 3: Speed bias (faster = better, ignoring quality)
    const timeEfficiency = evaluation.session.duration / 3600; // hours
    if (timeEfficiency < 0.5 && evaluation.scores.overall > 80) {
      biases.push({
        type: 'speed_bias',
        severity: 'low',
        recommendation: 'Verify quality wasn\'t compromised for speed',
      });
    }

    return { biases, adjusted: this.adjustForBiases(evaluation, biases) };
  }
}
```

### 3.4 Skill Level Assessment

Map numeric scores to skill levels with confidence intervals:

```typescript
interface SkillLevel {
  level: 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF';
  confidence: number;
  reasoning: string[];
  comparableScores?: number; // Percentile vs other candidates
}

class SkillLevelAssessor {
  assessSkillLevel(evaluation: EvaluationReport): SkillLevel {
    const overallScore = evaluation.scores.overall;

    // Base level determination
    let level: SkillLevel['level'];
    if (overallScore >= 85) level = 'STAFF';
    else if (overallScore >= 75) level = 'SENIOR';
    else if (overallScore >= 60) level = 'MID';
    else level = 'JUNIOR';

    // Adjust based on dimension breakdown
    const reasoning = [];

    // Strong code quality indicates higher level
    if (evaluation.scores.codeQuality.overall > 85) {
      reasoning.push('Exceptional code quality indicates senior-level skills');
      if (level === 'MID') level = 'SENIOR';
    }

    // AI collaboration excellence is differentiator
    if (evaluation.scores.aiCollaboration.overall > 80) {
      reasoning.push('Advanced AI collaboration skills demonstrate modern development practices');
    }

    // Problem-solving approach matters more than speed
    if (evaluation.scores.problemSolving.approach > 80) {
      reasoning.push('Strategic problem-solving approach indicates experience');
    }

    // Calculate confidence
    const confidence = Math.min(
      ...Object.values(evaluation.scores).map(s => s.confidence)
    );

    return {
      level,
      confidence,
      reasoning,
    };
  }
}
```

---

## 4. Report Generation

### 4.1 Structured Output Schema

Use JSON Schema to ensure consistent report format:

```typescript
interface EvaluationReport {
  // Metadata
  metadata: {
    sessionId: string;
    candidateId: string;
    assessmentId: string;
    evaluatedAt: Date;
    evaluationVersion: string;
  };

  // Overall summary
  summary: {
    overallScore: number;        // 0-100
    skillLevel: SkillLevel;
    recommendation: 'STRONG_HIRE' | 'HIRE' | 'MAYBE' | 'NO_HIRE';
    confidence: number;          // 0-1
    keyStrengths: string[];
    keyWeaknesses: string[];
  };

  // Dimension scores
  scores: {
    codeQuality: CodeQualityScore;
    problemSolving: ProblemSolvingScore;
    aiCollaboration: AICollaborationScore;
    communication: CommunicationScore;
    overall: number;
  };

  // Session context
  context: {
    duration: number;            // seconds
    question: {
      title: string;
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    };
    testPassRate: number;        // 0-100
    codeIterations: number;
    aiInteractions: number;
    terminalCommands: number;
  };

  // Timeline highlights
  timeline: Array<{
    timestamp: Date;
    event: string;
    significance: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    description: string;
  }>;

  // Data quality report
  dataQuality: {
    completeness: number;        // 0-1
    reliability: number;         // 0-1
    missingData: string[];
    warnings: string[];
  };

  // Bias detection
  biasReport: {
    biasesDetected: BiasDetection[];
    adjustmentsMade: string[];
  };
}
```

### 4.2 Report Generation Service

```typescript
class EvaluationReportGenerator {
  async generateReport(
    sessionId: string
  ): Promise<EvaluationReport> {
    // 1. Aggregate session data
    const aggregator = new EvaluationDataAggregator();
    const sessionData = await aggregator.aggregateSessionData(sessionId);

    // 2. Run all analyses
    const codeQualityAnalyzer = new CodeQualityAnalyzer();
    const problemSolvingAnalyzer = new ProblemSolvingAnalyzer();
    const aiCollaborationAnalyzer = new AICollaborationAnalyzer();
    const communicationAnalyzer = new CommunicationAnalyzer();

    const [codeQuality, problemSolving, aiCollaboration, communication] =
      await Promise.all([
        codeQualityAnalyzer.analyzeCodeQuality(
          sessionData.codeSnapshots,
          sessionData.testResults,
          sessionData.question
        ),
        problemSolvingAnalyzer.analyzeProblemSolving(
          sessionData.codeSnapshots,
          sessionData.testResults,
          sessionData.terminalEvents,
          sessionData.claudeInteractions,
          sessionData.session
        ),
        aiCollaborationAnalyzer.analyzeAICollaboration(
          sessionData.claudeInteractions,
          sessionData.codeSnapshots
        ),
        communicationAnalyzer.analyzeCommunication(
          sessionData.claudeInteractions,
          sessionData.codeSnapshots
        ),
      ]);

    // 3. Calculate overall score (weighted average)
    const overallScore = this.calculateOverallScore({
      codeQuality: codeQuality.overall,
      problemSolving: problemSolving.overall,
      aiCollaboration: aiCollaboration.overall,
      communication: communication.overall,
    });

    // 4. Assess skill level
    const skillLevelAssessor = new SkillLevelAssessor();
    const skillLevel = skillLevelAssessor.assessSkillLevel({
      scores: {
        codeQuality,
        problemSolving,
        aiCollaboration,
        communication,
        overall: overallScore,
      },
    });

    // 5. Detect biases
    const biasDetector = new BiasDetector();
    const biasReport = biasDetector.detectBiases({
      scores: {
        codeQuality,
        problemSolving,
        aiCollaboration,
        communication,
        overall: overallScore,
      },
      codeSnapshots: sessionData.codeSnapshots,
      claudeInteractions: sessionData.claudeInteractions,
      session: sessionData.session,
    });

    // 6. Generate summary
    const summary = this.generateSummary({
      overallScore,
      skillLevel,
      scores: { codeQuality, problemSolving, aiCollaboration, communication },
    });

    // 7. Extract timeline highlights
    const timeline = this.extractTimelineHighlights(sessionData);

    // 8. Assess data quality
    const dataQuality = this.assessDataQuality(sessionData);

    // 9. Generate final report
    const report: EvaluationReport = {
      metadata: {
        sessionId: sessionData.session.id,
        candidateId: sessionData.session.candidateId,
        assessmentId: sessionData.session.assessmentId,
        evaluatedAt: new Date(),
        evaluationVersion: '1.0.0',
      },
      summary,
      scores: {
        codeQuality,
        problemSolving,
        aiCollaboration,
        communication,
        overall: overallScore,
      },
      context: {
        duration: sessionData.session.duration,
        question: {
          title: sessionData.question.title,
          difficulty: sessionData.question.difficulty,
        },
        testPassRate: this.calculateTestPassRate(sessionData.testResults),
        codeIterations: sessionData.codeSnapshots.length,
        aiInteractions: sessionData.claudeInteractions.length,
        terminalCommands: sessionData.terminalEvents.filter(e => e.type === 'input').length,
      },
      timeline,
      dataQuality,
      biasReport,
    };

    // 10. Store report in database
    await this.storeReport(report);

    return report;
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(scores: {
    codeQuality: number;
    problemSolving: number;
    aiCollaboration: number;
    communication: number;
  }): number {
    return (
      scores.codeQuality * 0.40 +
      scores.problemSolving * 0.25 +
      scores.aiCollaboration * 0.20 +
      scores.communication * 0.15
    );
  }

  /**
   * Generates executive summary
   */
  private generateSummary(data: {
    overallScore: number;
    skillLevel: SkillLevel;
    scores: {
      codeQuality: CodeQualityScore;
      problemSolving: ProblemSolvingScore;
      aiCollaboration: AICollaborationScore;
      communication: CommunicationScore;
    };
  }) {
    // Determine recommendation
    let recommendation: 'STRONG_HIRE' | 'HIRE' | 'MAYBE' | 'NO_HIRE';
    if (data.overallScore >= 85 && data.skillLevel.confidence > 0.7) {
      recommendation = 'STRONG_HIRE';
    } else if (data.overallScore >= 70) {
      recommendation = 'HIRE';
    } else if (data.overallScore >= 55) {
      recommendation = 'MAYBE';
    } else {
      recommendation = 'NO_HIRE';
    }

    // Identify strengths (dimensions scoring >75)
    const keyStrengths = [];
    if (data.scores.codeQuality.overall > 75) {
      keyStrengths.push(`Strong code quality (${data.scores.codeQuality.overall}/100)`);
    }
    if (data.scores.problemSolving.overall > 75) {
      keyStrengths.push(`Excellent problem-solving approach (${data.scores.problemSolving.overall}/100)`);
    }
    if (data.scores.aiCollaboration.overall > 75) {
      keyStrengths.push(`Advanced AI collaboration skills (${data.scores.aiCollaboration.overall}/100)`);
    }

    // Identify weaknesses (dimensions scoring <60)
    const keyWeaknesses = [];
    if (data.scores.codeQuality.overall < 60) {
      keyWeaknesses.push(`Code quality needs improvement (${data.scores.codeQuality.overall}/100)`);
    }
    if (data.scores.problemSolving.overall < 60) {
      keyWeaknesses.push(`Problem-solving approach could be more systematic (${data.scores.problemSolving.overall}/100)`);
    }
    if (data.scores.aiCollaboration.overall < 60 && data.scores.aiCollaboration.overall > 0) {
      keyWeaknesses.push(`AI collaboration skills need development (${data.scores.aiCollaboration.overall}/100)`);
    }

    return {
      overallScore: data.overallScore,
      skillLevel: data.skillLevel,
      recommendation,
      confidence: Math.min(
        data.scores.codeQuality.confidence,
        data.scores.problemSolving.confidence,
        data.scores.aiCollaboration.confidence,
        data.scores.communication.confidence
      ),
      keyStrengths,
      keyWeaknesses,
    };
  }

  /**
   * Extracts significant timeline events
   */
  private extractTimelineHighlights(
    sessionData: SessionRecordingData
  ): EvaluationReport['timeline'] {
    const highlights = [];

    // First code
    if (sessionData.codeSnapshots.length > 0) {
      highlights.push({
        timestamp: sessionData.codeSnapshots[0].timestamp,
        event: 'First code written',
        significance: 'NEUTRAL',
        description: 'Candidate began implementing solution',
      });
    }

    // First passing test
    const firstPass = sessionData.testResults.find(t => t.passed);
    if (firstPass) {
      highlights.push({
        timestamp: firstPass.timestamp,
        event: 'First passing test',
        significance: 'POSITIVE',
        description: `Test "${firstPass.testName}" passed`,
      });
    }

    // All tests passing
    const testRuns = this.groupTestRuns(sessionData.testResults);
    const allPassRun = testRuns.find(run => run.every(t => t.passed));
    if (allPassRun) {
      highlights.push({
        timestamp: allPassRun[allPassRun.length - 1].timestamp,
        event: 'All tests passing',
        significance: 'POSITIVE',
        description: 'Solution completed successfully',
      });
    }

    // Major refactors (>50 lines changed)
    sessionData.codeSnapshots.forEach(snapshot => {
      if (snapshot.diffFromPrevious) {
        const totalChanges =
          snapshot.diffFromPrevious.linesAdded +
          snapshot.diffFromPrevious.linesDeleted +
          snapshot.diffFromPrevious.linesModified;

        if (totalChanges > 50) {
          highlights.push({
            timestamp: snapshot.timestamp,
            event: 'Major refactor',
            significance: 'NEUTRAL',
            description: `${totalChanges} lines changed in ${snapshot.fileName}`,
          });
        }
      }
    });

    return highlights.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Assesses quality and completeness of session data
   */
  private assessDataQuality(sessionData: SessionRecordingData): DataQuality {
    const missingData = [];
    const warnings = [];

    // Check for minimum data requirements
    if (sessionData.codeSnapshots.length < 2) {
      missingData.push('code_snapshots');
      warnings.push('Insufficient code snapshots for evolution analysis');
    }

    if (sessionData.testResults.length === 0) {
      missingData.push('test_results');
      warnings.push('No test results available - cannot assess correctness');
    }

    if (sessionData.claudeInteractions.length === 0) {
      warnings.push('No AI interactions - AI collaboration score not applicable');
    }

    if (sessionData.terminalEvents.length === 0) {
      warnings.push('No terminal activity recorded - debugging analysis limited');
    }

    // Calculate completeness
    const requiredDataPoints = ['codeSnapshots', 'testResults', 'claudeInteractions', 'terminalEvents'];
    const availableDataPoints = requiredDataPoints.filter(key => {
      return sessionData[key]?.length > 0;
    });
    const completeness = availableDataPoints.length / requiredDataPoints.length;

    // Calculate reliability
    const reliability = this.calculateReliability(sessionData);

    return {
      completeness,
      reliability,
      missingData,
      warnings,
    };
  }
}
```

### 4.3 Human-Readable Report Template

In addition to structured JSON, generate human-readable HTML/PDF reports:

```typescript
class ReportRenderer {
  renderHTML(report: EvaluationReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Evaluation Report - ${report.metadata.candidateId}</title>
  <style>
    body { font-family: 'Inter', sans-serif; max-width: 900px; margin: 0 auto; padding: 40px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .score { font-size: 48px; font-weight: bold; color: ${this.getScoreColor(report.summary.overallScore)}; }
    .dimension { margin: 20px 0; padding: 15px; border-left: 4px solid #5E6AD2; }
    .evidence { background: #fafafa; padding: 10px; margin: 10px 0; border-radius: 4px; }
    .timeline { border-left: 2px solid #ddd; padding-left: 20px; }
  </style>
</head>
<body>
  <h1>Technical Assessment Evaluation</h1>

  <div class="summary">
    <div class="score">${report.summary.overallScore}/100</div>
    <p><strong>Skill Level:</strong> ${report.summary.skillLevel.level} (${(report.summary.skillLevel.confidence * 100).toFixed(0)}% confidence)</p>
    <p><strong>Recommendation:</strong> ${report.summary.recommendation}</p>

    <h3>Key Strengths</h3>
    <ul>
      ${report.summary.keyStrengths.map(s => `<li>${s}</li>`).join('')}
    </ul>

    <h3>Areas for Development</h3>
    <ul>
      ${report.summary.keyWeaknesses.map(w => `<li>${w}</li>`).join('')}
    </ul>
  </div>

  <h2>Dimension Breakdown</h2>

  <div class="dimension">
    <h3>Code Quality (40% weight): ${report.scores.codeQuality.overall}/100</h3>
    <p><strong>Confidence:</strong> ${(report.scores.codeQuality.confidence * 100).toFixed(0)}%</p>

    <h4>Sub-Scores</h4>
    <ul>
      <li>Correctness: ${report.scores.codeQuality.correctness}/100</li>
      <li>Code Structure: ${report.scores.codeQuality.codeStructure}/100</li>
      <li>Efficiency: ${report.scores.codeQuality.efficiency}/100</li>
      <li>Error Handling: ${report.scores.codeQuality.errorHandling}/100</li>
      <li>Code Clarity: ${report.scores.codeQuality.codeClarity}/100</li>
      <li>Test Coverage: ${report.scores.codeQuality.testCoverage}/100</li>
    </ul>

    <h4>Evidence</h4>
    ${report.scores.codeQuality.evidence.map(e => `
      <div class="evidence">
        <p><strong>${e.metric}</strong></p>
        <p>${e.justification}</p>
        ${e.examples.length > 0 ? `
          <details>
            <summary>View Examples</summary>
            ${e.examples.map(ex => `<pre>${ex.snippet || ex.fileId}</pre>`).join('')}
          </details>
        ` : ''}
      </div>
    `).join('')}
  </div>

  <!-- Similar sections for Problem Solving, AI Collaboration, Communication -->

  <h2>Session Timeline</h2>
  <div class="timeline">
    ${report.timeline.map(event => `
      <div style="margin: 10px 0;">
        <strong>${event.timestamp.toLocaleTimeString()}</strong> - ${event.event}
        <br><small>${event.description}</small>
      </div>
    `).join('')}
  </div>

  <h2>Data Quality Report</h2>
  <p><strong>Completeness:</strong> ${(report.dataQuality.completeness * 100).toFixed(0)}%</p>
  <p><strong>Reliability:</strong> ${(report.dataQuality.reliability * 100).toFixed(0)}%</p>
  ${report.dataQuality.warnings.length > 0 ? `
    <h3>Warnings</h3>
    <ul>
      ${report.dataQuality.warnings.map(w => `<li>${w}</li>`).join('')}
    </ul>
  ` : ''}

  <h2>Bias Detection</h2>
  ${report.biasReport.biasesDetected.length > 0 ? `
    <p>The following potential biases were detected and corrected:</p>
    <ul>
      ${report.biasReport.biasesDetected.map(b => `<li>${b.type}: ${b.recommendation}</li>`).join('')}
    </ul>
  ` : '<p>No significant biases detected.</p>'}

  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
    <p><small>Generated by InterviewLM Evaluation Agent v${report.metadata.evaluationVersion}</small></p>
    <p><small>Evaluated at: ${report.metadata.evaluatedAt.toLocaleString()}</small></p>
  </footer>
</body>
</html>
    `;
  }

  private getScoreColor(score: number): string {
    if (score >= 80) return '#10B981'; // green
    if (score >= 60) return '#F59E0B'; // amber
    return '#EF4444'; // red
  }
}
```

---

## 5. Implementation Roadmap

### Phase 1: MVP (Week 1)
- [x] Data aggregation service
- [x] Code quality analyzer (basic)
- [x] Test result processor
- [x] Simple scoring algorithm
- [x] JSON report generation

**Deliverable**: Basic evaluation reports with code quality + test scores

### Phase 2: Enhanced Analysis (Week 2)
- [ ] Problem-solving analyzer
- [ ] AI collaboration analyzer
- [ ] Communication analyzer
- [ ] Confidence scoring
- [ ] Evidence validation

**Deliverable**: Full 4-dimension evaluation with confidence scores

### Phase 3: Advanced Features (Week 3)
- [ ] LLM-based code review
- [ ] Skill level assessment
- [ ] Bias detection & mitigation
- [ ] HTML/PDF report rendering
- [ ] Comparative analytics (vs other candidates)

**Deliverable**: Production-ready evaluation agent

### Phase 4: Optimization (Week 4)
- [ ] Caching and performance optimization
- [ ] Batch evaluation processing
- [ ] Real-time evaluation progress
- [ ] Integration with dashboard UI

---

## 6. API Endpoints

### 6.1 Trigger Evaluation

**`POST /api/sessions/[id]/evaluate`**

Triggers evaluation for a completed session.

```typescript
// Request
{
  "sessionId": "string",
  "options": {
    "skipCache": boolean,        // Re-evaluate even if report exists
    "includeDebugInfo": boolean, // Include detailed debug info
    "format": "json" | "html"    // Report format
  }
}

// Response
{
  "evaluationId": "string",
  "status": "processing" | "completed" | "failed",
  "estimatedTime": number,      // seconds
  "reportUrl": "string"         // URL to fetch report when ready
}
```

### 6.2 Get Evaluation Report

**`GET /api/evaluations/[id]`**

Retrieves evaluation report.

```typescript
// Response
{
  "report": EvaluationReport,
  "generatedAt": "string (ISO date)",
  "format": "json" | "html",
  "cached": boolean
}
```

### 6.3 Batch Evaluation

**`POST /api/evaluations/batch`**

Evaluates multiple sessions in batch.

```typescript
// Request
{
  "sessionIds": string[],
  "options": {
    "priority": "high" | "normal" | "low",
    "notifyOnComplete": boolean
  }
}

// Response
{
  "batchId": "string",
  "status": "queued",
  "totalSessions": number,
  "estimatedTime": number
}
```

---

## 7. Database Schema

```sql
-- Evaluation reports table
CREATE TABLE evaluation_reports (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES session_recordings(id),
  version VARCHAR(10) NOT NULL DEFAULT '1.0.0',

  -- Overall scores
  overall_score DECIMAL(5,2) NOT NULL,
  code_quality_score DECIMAL(5,2) NOT NULL,
  problem_solving_score DECIMAL(5,2) NOT NULL,
  ai_collaboration_score DECIMAL(5,2) NOT NULL,
  communication_score DECIMAL(5,2) NOT NULL,

  -- Skill assessment
  skill_level VARCHAR(20) NOT NULL, -- JUNIOR, MID, SENIOR, STAFF
  skill_level_confidence DECIMAL(3,2) NOT NULL,
  recommendation VARCHAR(20) NOT NULL, -- STRONG_HIRE, HIRE, MAYBE, NO_HIRE

  -- Full report JSON
  report_json JSONB NOT NULL,

  -- Metadata
  evaluation_duration_ms INT NOT NULL,
  data_quality_score DECIMAL(3,2),
  biases_detected TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX(session_id),
  INDEX(overall_score),
  INDEX(skill_level),
  INDEX(recommendation)
);

-- Evaluation evidence table (for detailed evidence storage)
CREATE TABLE evaluation_evidence (
  id UUID PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES evaluation_reports(id),
  dimension VARCHAR(50) NOT NULL, -- code_quality, problem_solving, etc.
  metric VARCHAR(100) NOT NULL,

  score DECIMAL(5,2) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,

  observation TEXT NOT NULL,
  justification TEXT NOT NULL,

  -- Reference to session data
  timestamp TIMESTAMP,
  file_id VARCHAR(255),
  line_number INT,
  code_snippet TEXT,

  weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX(report_id),
  INDEX(dimension),
  INDEX(metric)
);

-- Evaluation cache table (to avoid re-evaluating)
CREATE TABLE evaluation_cache (
  session_id UUID PRIMARY KEY REFERENCES session_recordings(id),
  report_id UUID NOT NULL REFERENCES evaluation_reports(id),
  cache_key VARCHAR(64) NOT NULL, -- Hash of session data + evaluation version
  expires_at TIMESTAMP NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

Test individual analyzers in isolation:

```typescript
describe('CodeQualityAnalyzer', () => {
  it('should score 100% for all tests passing', async () => {
    const testResults = [
      { testName: 'test1', passed: true },
      { testName: 'test2', passed: true },
    ];

    const analyzer = new CodeQualityAnalyzer();
    const score = analyzer.calculateCorrectness(testResults);

    expect(score).toBe(100);
  });

  it('should score 50% for half tests passing', async () => {
    const testResults = [
      { testName: 'test1', passed: true },
      { testName: 'test2', passed: false },
    ];

    const analyzer = new CodeQualityAnalyzer();
    const score = analyzer.calculateCorrectness(testResults);

    expect(score).toBe(50);
  });

  it('should have high confidence with >5 code snapshots', () => {
    const codeSnapshots = Array(10).fill({ /* ... */ });

    const confidence = new ConfidenceCalculator().calculateConfidence(
      'code_quality',
      codeSnapshots.length,
      true,
      true
    );

    expect(confidence).toBeGreaterThan(0.8);
  });
});
```

### 8.2 Integration Tests

Test full evaluation pipeline:

```typescript
describe('Evaluation Pipeline', () => {
  it('should generate complete evaluation report', async () => {
    const sessionId = 'test-session-123';

    // Create mock session data
    await setupMockSessionData(sessionId);

    const generator = new EvaluationReportGenerator();
    const report = await generator.generateReport(sessionId);

    expect(report.summary.overallScore).toBeDefined();
    expect(report.scores.codeQuality).toBeDefined();
    expect(report.scores.problemSolving).toBeDefined();
    expect(report.timeline).toHaveLength(greaterThan(0));
  });

  it('should detect and mitigate biases', async () => {
    const sessionId = 'test-session-with-bias';

    // Create session with known bias (e.g., lots of AI usage)
    await setupBiasedSessionData(sessionId);

    const generator = new EvaluationReportGenerator();
    const report = await generator.generateReport(sessionId);

    expect(report.biasReport.biasesDetected.length).toBeGreaterThan(0);
    expect(report.biasReport.adjustmentsMade).toBeDefined();
  });
});
```

### 8.3 Validation Tests

Validate against human evaluations:

```typescript
describe('Human Evaluation Agreement', () => {
  it('should agree with human evaluation within 10 points', async () => {
    // Use pre-evaluated sessions with human scores
    const testSessions = await loadHumanEvaluatedSessions();

    for (const session of testSessions) {
      const generator = new EvaluationReportGenerator();
      const report = await generator.generateReport(session.id);

      const aiScore = report.summary.overallScore;
      const humanScore = session.humanEvaluationScore;

      const difference = Math.abs(aiScore - humanScore);

      expect(difference).toBeLessThan(10); // Within 10 points
    }
  });
});
```

---

## 9. Cost Analysis

### Per-Evaluation Costs

| Component | Cost | Notes |
|-----------|------|-------|
| Claude API (LLM review) | $0.05 | ~5K input + 2K output tokens |
| Static analysis | $0.00 | Free (ESLint, Pylint) |
| Database queries | $0.001 | Minimal |
| Report generation | $0.001 | Computation |
| **Total per evaluation** | **~$0.052** | |

### At Scale

- 1,000 evaluations/month: **$52/month**
- 10,000 evaluations/month: **$520/month**

### Optimization Opportunities

1. **Cache LLM reviews**: Same code = same review (-80% LLM cost)
2. **Batch evaluations**: Process multiple sessions in single LLM call (-50% cost)
3. **Tiered evaluation**: Quick evaluation for screening, detailed for final candidates
4. **Progressive evaluation**: Evaluate during session, finalize at end (-30% post-processing time)

---

## 10. Key Takeaways

### What Makes This Evaluation Agent Effective

1. **Evidence-Based**: Every score references specific, observable data
2. **Multi-Dimensional**: Evaluates 4 distinct competencies with different evidence sources
3. **Confidence-Aware**: Includes confidence scores based on data quality
4. **Bias-Resistant**: Multiple validation methods and bias detection
5. **Transparent**: Full justification with timestamps and code snippets
6. **AI-Native**: Evaluates AI collaboration skills (unique differentiator)

### Avoiding Common Pitfalls

❌ **Don't**: Assume intent or capability beyond what's demonstrated
✅ **Do**: Only score based on observable actions

❌ **Don't**: Give high scores without specific evidence
✅ **Do**: Require multiple pieces of evidence for scores >80

❌ **Don't**: Penalize using AI
✅ **Do**: Reward effective AI collaboration

❌ **Don't**: Use single evaluation method
✅ **Do**: Validate with multiple independent analyses

❌ **Don't**: Ignore data quality issues
✅ **Do**: Report confidence levels and missing data

### Success Metrics

- **Accuracy**: Agreement with human evaluations within 10 points (target: >85%)
- **Reliability**: Consistent scores for similar performances (variance <5%)
- **Speed**: Evaluation completes in <30 seconds per session
- **Cost**: <$0.10 per evaluation
- **Transparency**: All scores include justification + evidence

---

## 11. Next Steps

1. **Implement MVP** (Phase 1): Basic evaluation with code quality + tests
2. **Validate against human evaluations**: Build dataset of human-scored sessions
3. **Iterate on scoring algorithms**: Tune weights based on validation data
4. **Add advanced features** (Phases 2-3): Full 4-dimension evaluation
5. **Integrate with dashboard**: Display evaluation reports in UI
6. **Optimize for scale** (Phase 4): Caching, batching, performance

---

**Document Status**: ✅ Design Complete
**Ready for Implementation**: Yes
**Estimated Timeline**: 4 weeks to production-ready
**Dependencies**: Session recording infrastructure (already complete)
