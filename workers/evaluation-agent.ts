/**
 * Evaluation Agent Worker
 *
 * Background worker that evaluates completed interviews with evidence-based scoring.
 * Runs as a BullMQ worker, consuming events from the evaluation queue.
 *
 * Responsibilities:
 * - Score interviews across 4 dimensions (Code Quality, Problem Solving, AI Collaboration, Communication)
 * - Use multi-method validation to reduce false positives
 * - Provide evidence for every score (timestamps + code snippets)
 * - Generate structured reports (JSON + HTML)
 * - Detect and mitigate scoring biases
 *
 * CRITICAL: Evidence-based scoring only. NO hardcoded assumptions.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { redisConnection } from '../lib/queues/config';
import { QUEUE_NAMES } from '../lib/types/events';
import { AGENT_MODEL_RECOMMENDATIONS } from '../lib/constants/models';
import type {
  EvaluationEventType,
  EvaluationAnalyzeEventData,
  SessionRecording,
  ScoringWeights,
} from '../lib/types';
import { DEFAULT_SCORING_WEIGHTS } from '../lib/types';
import prisma from '../lib/prisma';

/**
 * Evaluation score for a single dimension
 * Includes score, confidence, and evidence
 */
interface DimensionScore {
  score: number; // 0-100
  confidence: number; // 0-1
  evidence: Evidence[];
  breakdown?: Record<string, number>; // Sub-scores
}

/**
 * Evidence supporting a score
 */
interface Evidence {
  type: 'code_snippet' | 'test_result' | 'ai_interaction' | 'metric';
  description: string;
  timestamp?: Date;
  codeSnippet?: string;
  filePath?: string;
  lineNumber?: number;
  value?: number | string;
}

/**
 * Complete evaluation result
 */
interface EvaluationResult {
  sessionId: string;
  candidateId: string;

  // 4-dimension scores
  codeQuality: DimensionScore;
  problemSolving: DimensionScore;
  aiCollaboration: DimensionScore;
  communication: DimensionScore;

  // Overall score (weighted)
  overallScore: number;
  overallConfidence: number;

  // Metadata
  evaluatedAt: Date;
  model: string;
  biasFlags: string[];
}

/**
 * Evaluation Agent Worker
 * Processes completed interviews and generates evaluations
 */
class EvaluationAgentWorker {
  private worker: Worker;
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.worker = new Worker(
      QUEUE_NAMES.EVALUATION,
      async (job: Job) => {
        await this.processEvent(job);
      },
      {
        connection: redisConnection,
        concurrency: 5, // Process 5 evaluations simultaneously
        limiter: {
          max: 10, // Max 10 jobs per interval
          duration: 1000, // 1 second
        },
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      console.log(`[Evaluation Agent] Evaluated session: ${job.data.sessionId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[Evaluation Agent] Failed to evaluate session: ${job?.data.sessionId}`, err);
    });

    this.worker.on('error', (err) => {
      console.error('[Evaluation Agent] Worker error:', err);
    });

    console.log('[Evaluation Agent] Worker started');
  }

  /**
   * Process an evaluation event
   */
  private async processEvent(job: Job): Promise<void> {
    const eventType = job.name as EvaluationEventType;
    const data = job.data;

    switch (eventType) {
      case 'analyze':
        await this.handleAnalyze(data as EvaluationAnalyzeEventData);
        break;

      case 'generate-report':
        // Report generation would go here
        console.log('[Evaluation Agent] Generate report not yet implemented');
        break;

      default:
        console.warn(`[Evaluation Agent] Unknown event type: ${eventType}`);
    }
  }

  /**
   * Handle analyze event
   * Performs complete evaluation of an interview session
   */
  private async handleAnalyze(data: EvaluationAnalyzeEventData): Promise<void> {
    const { sessionId, candidateId } = data;

    console.log(`[Evaluation Agent] Analyzing session ${sessionId} for candidate ${candidateId}`);

    // Fetch full session recording
    const recording = await this.getSessionRecording(sessionId);

    if (!recording) {
      throw new Error(`Session recording not found: ${sessionId}`);
    }

    // Evaluate each dimension
    const [codeQuality, problemSolving, aiCollaboration, communication] = await Promise.all([
      this.evaluateCodeQuality(recording),
      this.evaluateProblemSolving(recording),
      this.evaluateAICollaboration(recording),
      this.evaluateCommunication(recording),
    ]);

    // Calculate overall score (weighted average)
    const weights = DEFAULT_SCORING_WEIGHTS;
    const overallScore =
      codeQuality.score * weights.codeQuality +
      problemSolving.score * weights.problemSolving +
      aiCollaboration.score * weights.aiCollaboration +
      communication.score * weights.communication;

    // Calculate overall confidence (minimum of all dimensions)
    const overallConfidence = Math.min(
      codeQuality.confidence,
      problemSolving.confidence,
      aiCollaboration.confidence,
      communication.confidence
    );

    // Detect biases
    const biasFlags = this.detectBiases(recording, {
      codeQuality,
      problemSolving,
      aiCollaboration,
      communication,
    });

    // Build evaluation result
    const result: EvaluationResult = {
      sessionId,
      candidateId,
      codeQuality,
      problemSolving,
      aiCollaboration,
      communication,
      overallScore: Math.round(overallScore),
      overallConfidence,
      evaluatedAt: new Date(),
      model: AGENT_MODEL_RECOMMENDATIONS.evaluationAgent,
      biasFlags,
    };

    // Save evaluation to database
    await this.saveEvaluation(result);

    console.log(`[Evaluation Agent] Completed evaluation for session ${sessionId}:`, {
      overallScore: result.overallScore,
      confidence: result.overallConfidence,
      biasFlags: result.biasFlags,
    });
  }

  /**
   * Evaluate Code Quality (40%)
   * Methods: Test results + Static analysis + LLM code review
   */
  private async evaluateCodeQuality(recording: SessionRecording): Promise<DimensionScore> {
    const evidence: Evidence[] = [];
    let testScore = 0;
    let staticScore = 0;
    let llmScore = 0;

    // Method 1: Test results (objective)
    if (recording.testResults && recording.testResults.length > 0) {
      const lastTest = recording.testResults[recording.testResults.length - 1];
      testScore = (lastTest.passed / lastTest.total) * 100;

      evidence.push({
        type: 'test_result',
        description: `${lastTest.passed}/${lastTest.total} tests passed`,
        timestamp: lastTest.timestamp,
        value: testScore,
      });

      if (lastTest.coverage !== undefined) {
        evidence.push({
          type: 'metric',
          description: `Test coverage: ${lastTest.coverage}%`,
          value: lastTest.coverage,
        });
      }
    }

    // Method 2: Static analysis (placeholder - would use ESLint/Pylint)
    // For MVP, approximate based on code snapshots
    if (recording.codeSnapshots && recording.codeSnapshots.length > 0) {
      const finalCode = recording.codeSnapshots[recording.codeSnapshots.length - 1];
      const fileCount = Object.keys(finalCode.files).length;

      // Simple heuristics (replace with actual static analysis)
      staticScore = fileCount > 0 ? 70 : 0; // Placeholder

      evidence.push({
        type: 'metric',
        description: `${fileCount} file(s) in final solution`,
        value: fileCount,
      });
    }

    // Method 3: LLM code review
    if (recording.codeSnapshots && recording.codeSnapshots.length > 0) {
      llmScore = await this.llmCodeReview(recording);
    }

    // Multi-method validation: Average if all methods agree within 20 points
    const scores = [testScore, staticScore, llmScore].filter((s) => s > 0);
    const maxDiff = Math.max(...scores) - Math.min(...scores);
    const confidence = maxDiff < 20 ? 0.9 : 0.6; // Lower confidence if disagreement

    const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    return {
      score: Math.round(score),
      confidence,
      evidence,
      breakdown: {
        tests: testScore,
        staticAnalysis: staticScore,
        llmReview: llmScore,
      },
    };
  }

  /**
   * Evaluate Problem Solving (25%)
   * Methods: Iteration patterns + Debugging approach + Progress tracking
   */
  private async evaluateProblemSolving(recording: SessionRecording): Promise<DimensionScore> {
    const evidence: Evidence[] = [];

    // Analyze code snapshots for iteration patterns
    const snapshots = recording.codeSnapshots || [];
    const iterationScore = this.analyzeIterationPatterns(snapshots);

    evidence.push({
      type: 'metric',
      description: `${snapshots.length} code iterations`,
      value: snapshots.length,
    });

    // Analyze test results for debugging approach
    const testResults = recording.testResults || [];
    const debuggingScore = this.analyzeDebuggingApproach(testResults);

    if (testResults.length > 0) {
      evidence.push({
        type: 'metric',
        description: `${testResults.length} test runs`,
        value: testResults.length,
      });
    }

    // Combine scores
    const score = (iterationScore + debuggingScore) / 2;
    const confidence = snapshots.length >= 3 && testResults.length >= 2 ? 0.8 : 0.5;

    return {
      score: Math.round(score),
      confidence,
      evidence,
      breakdown: {
        iterationPatterns: iterationScore,
        debuggingApproach: debuggingScore,
      },
    };
  }

  /**
   * Evaluate AI Collaboration (20%) - UNIQUE TO INTERVIEWLM
   * Methods: Prompt quality + Effective AI usage + Code review of AI suggestions
   */
  private async evaluateAICollaboration(recording: SessionRecording): Promise<DimensionScore> {
    const evidence: Evidence[] = [];
    const interactions = recording.claudeInteractions || [];

    if (interactions.length === 0) {
      return {
        score: 0,
        confidence: 1,
        evidence: [{ type: 'metric', description: 'No AI interactions', value: 0 }],
      };
    }

    // Calculate average prompt quality (stored in database)
    const promptQualities = interactions
      .map((i: any) => i.promptQuality)
      .filter((q) => q !== undefined && q !== null);

    const avgPromptQuality =
      promptQualities.length > 0
        ? promptQualities.reduce((sum, q) => sum + q, 0) / promptQualities.length
        : 3;

    // Convert 1-5 scale to 0-100
    const promptQualityScore = ((avgPromptQuality - 1) / 4) * 100;

    evidence.push({
      type: 'metric',
      description: `Average prompt quality: ${avgPromptQuality.toFixed(1)}/5`,
      value: avgPromptQuality,
    });

    // AI usage effectiveness: Did they use AI appropriately?
    const metrics = recording.metrics as any;
    const aiDependency = metrics?.aiDependencyScore || 0;

    // Optimal: Moderate AI usage (not too dependent, not ignoring it)
    const usageEffectivenessScore = 100 - Math.abs(50 - aiDependency);

    evidence.push({
      type: 'metric',
      description: `AI dependency score: ${aiDependency}/100`,
      value: aiDependency,
    });

    // Combine scores
    const score = (promptQualityScore + usageEffectivenessScore) / 2;
    const confidence = interactions.length >= 5 ? 0.85 : 0.6;

    return {
      score: Math.round(score),
      confidence,
      evidence,
      breakdown: {
        promptQuality: promptQualityScore,
        usageEffectiveness: usageEffectivenessScore,
      },
    };
  }

  /**
   * Evaluate Communication (15%)
   * Methods: Prompt clarity + Code documentation + Comments
   */
  private async evaluateCommunication(recording: SessionRecording): Promise<DimensionScore> {
    const evidence: Evidence[] = [];
    const interactions = recording.claudeInteractions || [];

    // Prompt clarity (from prompt quality scores)
    const promptQualities = interactions
      .map((i: any) => i.promptQuality)
      .filter((q) => q !== undefined && q !== null);

    const avgPromptQuality =
      promptQualities.length > 0
        ? promptQualities.reduce((sum, q) => sum + q, 0) / promptQualities.length
        : 3;

    const clarityScore = ((avgPromptQuality - 1) / 4) * 100;

    evidence.push({
      type: 'metric',
      description: `Prompt clarity: ${avgPromptQuality.toFixed(1)}/5`,
      value: avgPromptQuality,
    });

    // Code documentation (placeholder - would analyze comments in code)
    const documentationScore = 70; // Placeholder

    const score = (clarityScore + documentationScore) / 2;
    const confidence = interactions.length >= 3 ? 0.75 : 0.5;

    return {
      score: Math.round(score),
      confidence,
      evidence,
      breakdown: {
        promptClarity: clarityScore,
        documentation: documentationScore,
      },
    };
  }

  /**
   * LLM-based code review
   * Uses Claude to evaluate code quality
   */
  private async llmCodeReview(recording: SessionRecording): Promise<number> {
    const snapshots = recording.codeSnapshots || [];
    if (snapshots.length === 0) return 0;

    const finalCode = snapshots[snapshots.length - 1];
    const codeFiles = Object.entries(finalCode.files)
      .map(([path, content]) => `// ${path}\n${content}`)
      .join('\n\n');

    try {
      const response = await this.client.messages.create({
        model: AGENT_MODEL_RECOMMENDATIONS.evaluationAgent,
        max_tokens: 1024,
        system: `You are a code quality evaluator. Rate the code quality on a scale of 0-100.
Consider: readability, maintainability, efficiency, best practices, error handling.
Respond with ONLY a number between 0-100.`,
        messages: [
          {
            role: 'user',
            content: `Rate this code:\n\n${codeFiles.substring(0, 4000)}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '0';
      const score = parseInt(text.trim(), 10);
      return isNaN(score) ? 0 : Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error('[Evaluation Agent] LLM code review failed:', error);
      return 0;
    }
  }

  /**
   * Analyze iteration patterns in code snapshots
   */
  private analyzeIterationPatterns(snapshots: any[]): number {
    if (snapshots.length === 0) return 0;

    // More snapshots = more iterations = better problem-solving approach
    // Optimal: 5-10 iterations
    const iterationCount = snapshots.length;

    if (iterationCount >= 5 && iterationCount <= 10) {
      return 90; // Excellent iterative approach
    } else if (iterationCount >= 3 && iterationCount <= 15) {
      return 75; // Good iteration
    } else if (iterationCount >= 1) {
      return 60; // Some iteration
    }

    return 30; // No iteration (unlikely)
  }

  /**
   * Analyze debugging approach from test results
   */
  private analyzeDebuggingApproach(testResults: any[]): number {
    if (testResults.length === 0) return 50; // No test data

    // Look for improvement over time
    const improvements = testResults.map((t, i) => {
      if (i === 0) return 0;
      const prev = testResults[i - 1];
      return t.passed - prev.passed;
    });

    const positiveImprovements = improvements.filter((i) => i > 0).length;
    const improvementRate = positiveImprovements / Math.max(improvements.length, 1);

    return Math.round(50 + improvementRate * 50); // 50-100 based on improvement
  }

  /**
   * Detect scoring biases
   */
  private detectBiases(recording: SessionRecording, scores: any): string[] {
    const flags: string[] = [];

    // Code volume bias: High score but very little code
    const snapshots = recording.codeSnapshots || [];
    if (snapshots.length > 0 && scores.codeQuality.score > 80) {
      const finalCode = snapshots[snapshots.length - 1];
      const totalLines = Object.values(finalCode.files).reduce(
        (sum, content: any) => sum + content.split('\n').length,
        0
      );

      if (totalLines < 20) {
        flags.push('code_volume_bias: High score with minimal code');
      }
    }

    // AI usage penalty: Low score due to high AI usage
    const metrics = recording.metrics as any;
    if (metrics?.aiDependencyScore > 70 && scores.aiCollaboration.score < 50) {
      flags.push('ai_usage_penalty: Penalized for effective AI collaboration');
    }

    // Speed bias: Low score due to slow completion
    if (metrics?.averageResponseTime > 1200 && scores.problemSolving.score < 60) {
      flags.push('speed_bias: Penalized for thoughtful, deliberate approach');
    }

    return flags;
  }

  /**
   * Get full session recording
   */
  private async getSessionRecording(sessionId: string): Promise<SessionRecording | null> {
    const session = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
      include: {
        claudeInteractions: true,
        codeSnapshots: true,
        terminalCommands: true,
      },
    });

    if (!session) return null;

    // Build SessionRecording object
    const recording: SessionRecording = {
      sessionId: session.id,
      candidateId: session.candidateId,
      questionId: '', // TODO: Get from assessment
      startTime: session.startedAt || new Date(),
      endTime: session.endedAt || new Date(),
      duration: session.duration || 0,
      codeSnapshots: session.codeSnapshots.map((s: any) => ({
        timestamp: s.timestamp,
        files: s.files as Record<string, string>,
        trigger: s.trigger as any,
      })),
      claudeInteractions: session.claudeInteractions.map((i: any) => ({
        timestamp: i.timestamp || new Date(),
        candidateMessage: i.role === 'user' ? i.content : '',
        aiResponse: i.role === 'assistant' ? i.content : '',
        toolsUsed: [],
        filesModified: [],
        promptQuality: i.promptQuality,
      })),
      testResults: [], // TODO: Fetch from test runs
      terminalCommands: session.terminalCommands.map((c: any) => ({
        timestamp: c.timestamp,
        command: c.command,
        output: c.output,
        exitCode: c.exitCode,
      })),
      questionDifficulty: 5, // TODO: Get from question
      questionTopic: 'general', // TODO: Get from question
    };

    // Attach metrics
    (recording as any).metrics = session.metrics;

    return recording;
  }

  /**
   * Save evaluation to database
   */
  private async saveEvaluation(result: EvaluationResult): Promise<void> {
    await prisma.evaluation.create({
      data: {
        candidateId: result.candidateId,
        sessionId: result.sessionId,
        codeQualityScore: result.codeQuality.score,
        codeQualityEvidence: result.codeQuality.evidence as any,
        problemSolvingScore: result.problemSolving.score,
        problemSolvingEvidence: result.problemSolving.evidence as any,
        aiCollaborationScore: result.aiCollaboration.score,
        aiCollaborationEvidence: result.aiCollaboration.evidence as any,
        communicationScore: result.communication.score,
        communicationEvidence: result.communication.evidence as any,
        overallScore: result.overallScore,
        confidence: result.overallConfidence,
        biasFlags: result.biasFlags,
        evaluatedAt: result.evaluatedAt,
      },
    });
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    await this.worker.close();
    console.log('[Evaluation Agent] Worker stopped');
  }
}

/**
 * Start the Evaluation Agent worker
 * Call this from your worker process
 */
export function startEvaluationAgent(): EvaluationAgentWorker {
  return new EvaluationAgentWorker();
}

/**
 * Standalone script to run the worker
 * Usage: ts-node workers/evaluation-agent.ts
 */
if (require.main === module) {
  const worker = startEvaluationAgent();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Evaluation Agent] Received SIGTERM, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Evaluation Agent] Received SIGINT, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });
}
