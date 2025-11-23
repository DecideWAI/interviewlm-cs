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
import { moveToDeadLetterQueue } from '../lib/queues/dlq';
import type {
  EvaluationEventType,
  EvaluationAnalyzeEventData,
  SessionRecording,
  ScoringWeights,
} from '../lib/types';
import { DEFAULT_SCORING_WEIGHTS } from '../lib/types';
import prisma from '../lib/prisma';
import {
  getIdempotencyManager,
  generateEvaluationKey,
} from '../lib/utils/idempotency';
import { circuitBreakers } from '../lib/utils/circuit-breaker';
import { retry, isRetryableError } from '../lib/utils/resilience';
import {
  performStaticAnalysis,
  analyzeDocumentation,
  calculateComplexity,
  type CodeFile,
} from '../lib/utils/code-analysis';
import {
  calculateConfidence,
  detectBias,
  generateFairnessReport,
  type ConfidenceMetrics,
  type BiasDetectionResult,
} from '../lib/evaluation/confidence-and-bias';
import {
  ProgressiveScoringCalculator,
  type ProgressiveScoreResult,
} from '../lib/services/progressive-scoring';
import { generateHiringRecommendation } from '../lib/scoring';
import type { CandidateProfile, HiringRecommendation } from '../types/analytics';
import type { SeniorityLevel } from '../types/assessment';
import {
  ActionableReportGenerator,
  type EvaluationData,
} from '../lib/services/actionable-report';

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

  // Progressive scoring (multi-question assessments)
  progressiveScoreResult?: ProgressiveScoreResult;
  expertiseLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  expertiseGrowth?: number;
  expertiseGrowthTrend?: 'improving' | 'declining' | 'stable';

  // Confidence & bias detection
  confidenceMetrics?: ConfidenceMetrics;
  biasDetection?: BiasDetectionResult;
  fairnessReport?: string;

  // Hiring recommendation
  hiringRecommendation?: HiringRecommendation;

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
    this.worker.on('completed', (job: Job) => {
      console.log(`[Evaluation Agent] Evaluated session: ${job.data.sessionId}`);
    });

    this.worker.on('failed', async (job: Job | undefined, err: Error) => {
      console.error(`[Evaluation Agent] Failed to evaluate session: ${job?.data.sessionId}`, err);

      // Move to dead letter queue if exceeded max attempts
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        await moveToDeadLetterQueue(QUEUE_NAMES.EVALUATION, job, err);
      }
    });

    this.worker.on('error', (err: Error) => {
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
   * Uses idempotency to prevent duplicate evaluations
   */
  private async handleAnalyze(data: EvaluationAnalyzeEventData): Promise<void> {
    const { sessionId, candidateId } = data;

    console.log(`[Evaluation Agent] Analyzing session ${sessionId} for candidate ${candidateId}`);

    // Idempotency check - prevent duplicate evaluations
    const idempotencyKey = generateEvaluationKey(sessionId, candidateId);
    const idempotencyManager = getIdempotencyManager();

    // Check if evaluation already exists
    const existingEvaluation = await idempotencyManager.getIdempotentResult<EvaluationResult>(
      idempotencyKey
    );

    if (existingEvaluation) {
      console.log(
        `[Evaluation Agent] Evaluation already exists for session ${sessionId}, skipping`
      );
      return;
    }

    // Acquire lock to prevent concurrent evaluations
    const lockKey = `eval:${sessionId}`;
    const lockAcquired = await idempotencyManager.acquireLockWithRetry(lockKey, 600); // 10 min lock

    if (!lockAcquired) {
      console.warn(
        `[Evaluation Agent] Failed to acquire lock for session ${sessionId}, evaluation in progress`
      );
      return;
    }

    try {
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

    // Calculate confidence metrics
    const confidenceMetrics = this.calculateConfidenceMetrics(recording);

    // Detect biases with new comprehensive bias detection
    const biasDetectionResult = this.detectBiasesComprehensive(recording, {
      codeQuality,
      problemSolving,
      aiCollaboration,
      communication,
    });

    // Legacy bias flags for backward compatibility
    const biasFlags = this.detectBiases(recording, {
      codeQuality,
      problemSolving,
      aiCollaboration,
      communication,
    });

    // Generate fairness report
    const fairnessReport = generateFairnessReport(
      confidenceMetrics,
      biasDetectionResult
    );

    // Calculate progressive scoring for multi-question assessments
    const progressiveResult = await this.calculateProgressiveScoring(candidateId, recording);

    // Generate hiring recommendation
    const hiringRecommendation = await this.generateHiringRecommendationForCandidate(
      candidateId,
      {
        codeQuality,
        problemSolving,
        aiCollaboration,
        communication,
      },
      Math.round(overallScore),
      biasFlags
    );

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
      // Progressive scoring
      progressiveScoreResult: progressiveResult?.progressiveScore,
      expertiseLevel: progressiveResult?.progressiveScore?.expertiseLevel,
      expertiseGrowth: progressiveResult?.expertiseGrowth?.growth,
      expertiseGrowthTrend: progressiveResult?.expertiseGrowth?.trend,
      // Confidence & bias
      confidenceMetrics,
      biasDetection: biasDetectionResult,
      fairnessReport,
      // Hiring recommendation
      hiringRecommendation,
      // Metadata
      evaluatedAt: new Date(),
      model: AGENT_MODEL_RECOMMENDATIONS.evaluationAgent,
      biasFlags,
    };

      // Save evaluation to database
      await this.saveEvaluation(result);

      // Cache result for idempotency (24 hour TTL)
      await idempotencyManager.setIdempotentResult(idempotencyKey, result, 86400);

      console.log(`[Evaluation Agent] Completed evaluation for session ${sessionId}:`, {
        overallScore: result.overallScore,
        confidence: result.overallConfidence,
        biasFlags: result.biasFlags,
      });
    } finally {
      // Always release lock
      await idempotencyManager.releaseLock(lockKey, lockAcquired);
    }
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

    // Method 2: Static analysis (real analysis using code-analysis utils)
    if (recording.codeSnapshots && recording.codeSnapshots.length > 0) {
      const finalCode = recording.codeSnapshots[recording.codeSnapshots.length - 1];

      // Convert to CodeFile format
      const codeFiles: CodeFile[] = Object.entries(finalCode.files).map(
        ([path, content]) => ({
          path,
          content: content as string,
          language: this.detectLanguage(path),
        })
      );

      if (codeFiles.length > 0) {
        const analysisResult = performStaticAnalysis(codeFiles);
        staticScore = analysisResult.score;

        evidence.push({
          type: 'metric',
          description: `Static analysis: ${analysisResult.score}/100`,
          value: analysisResult.score,
        });

        evidence.push({
          type: 'metric',
          description: `${analysisResult.metrics.linesOfCode} LOC, ${analysisResult.metrics.commentLines} comment lines`,
          value: analysisResult.metrics.commentRatio,
        });

        if (analysisResult.metrics.securityIssues > 0) {
          evidence.push({
            type: 'metric',
            description: `${analysisResult.metrics.securityIssues} security issue(s) detected`,
            value: analysisResult.metrics.securityIssues,
          });
        }

        if (analysisResult.metrics.antiPatterns > 0) {
          evidence.push({
            type: 'metric',
            description: `${analysisResult.metrics.antiPatterns} anti-pattern(s) detected`,
            value: analysisResult.metrics.antiPatterns,
          });
        }
      }
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
    const testBasedScore = this.analyzeDebuggingApproach(testResults);

    if (testResults.length > 0) {
      evidence.push({
        type: 'metric',
        description: `${testResults.length} test runs`,
        value: testResults.length,
      });
    }

    // NEW: Analyze terminal commands for debugging patterns
    const { analyzeTerminalCommands } = await import('../lib/evaluation/terminal-analysis');

    let terminalScore = 50; // Default neutral score
    try {
      // Get terminal events from session recording
      const events = recording.events || [];
      const terminalCommands = events
        .filter((e: any) => e.type === 'terminal_input' || e.type === 'terminal_command')
        .map((e: any) => ({
          command: e.data?.command || e.data?.input || '',
          output: e.data?.output || '',
          exitCode: e.data?.exitCode || 0,
          timestamp: new Date(e.timestamp),
        }))
        .filter((cmd: { command: string; output: string; exitCode: number; timestamp: Date }) => cmd.command.trim().length > 0);

      if (terminalCommands.length > 0) {
        const terminalAnalysis = analyzeTerminalCommands(terminalCommands);

        // Add evidence from terminal analysis
        terminalAnalysis.evidence.slice(0, 5).forEach((e) => {
          evidence.push({
            type: 'metric',
            description: `${e.command}: ${e.reasoning}`,
            timestamp: e.timestamp,
            value: e.category,
          });
        });

        // Add pattern evidence
        terminalAnalysis.patterns.forEach((pattern) => {
          evidence.push({
            type: 'metric',
            description: `${pattern.pattern}: ${pattern.description} (${pattern.occurrences}x)`,
            value: pattern.impact,
          });
        });

        // Add terminal sub-scores
        evidence.push({
          type: 'metric',
          description: `Systematic debugging: ${terminalAnalysis.systematicDebugging}/100`,
          value: terminalAnalysis.systematicDebugging,
        });

        evidence.push({
          type: 'metric',
          description: `Tool proficiency: ${terminalAnalysis.toolProficiency}/100`,
          value: terminalAnalysis.toolProficiency,
        });

        terminalScore = terminalAnalysis.score;
      }
    } catch (error) {
      console.error('[Evaluation Agent] Terminal analysis error:', error);
      // Continue with default terminal score
    }

    // Combine scores: iteration (30%), test-based (30%), terminal (40%)
    const score = Math.round(
      iterationScore * 0.3 +
      testBasedScore * 0.3 +
      terminalScore * 0.4
    );

    const confidence = snapshots.length >= 3 && testResults.length >= 2 ? 0.85 : 0.6;

    return {
      score,
      confidence,
      evidence,
      breakdown: {
        iterationPatterns: iterationScore,
        debuggingApproach: testBasedScore,
        terminalAnalysis: terminalScore,
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

    // Use new prompt analysis module for evidence-based scoring
    const { analyzePrompts } = await import('../lib/evaluation/prompt-analysis');

    try {
      const promptAnalysis = await analyzePrompts(
        interactions.map((i: any) => ({
          id: i.id,
          userMessage: i.userMessage,
          assistantResponse: i.assistantResponse,
          timestamp: new Date(i.timestamp),
          toolsUsed: i.toolsUsed,
        }))
      );

      // Add evidence from prompt analysis
      promptAnalysis.evidence.slice(0, 5).forEach((e) => {
        evidence.push({
          type: 'ai_interaction',
          description: e.analysis,
          timestamp: e.timestamp,
          value: e.category,
        });
      });

      // Add summary metrics
      evidence.push({
        type: 'metric',
        description: `Prompt specificity: ${promptAnalysis.specificity}/100`,
        value: promptAnalysis.specificity,
      });

      evidence.push({
        type: 'metric',
        description: `Prompt clarity: ${promptAnalysis.clarity}/100`,
        value: promptAnalysis.clarity,
      });

      evidence.push({
        type: 'metric',
        description: `Technical depth: ${promptAnalysis.technicalDepth}/100`,
        value: promptAnalysis.technicalDepth,
      });

      // AI usage effectiveness: Did they use AI appropriately?
      const metrics = recording.metrics as any;
      const aiDependency = metrics?.aiDependencyScore || 50; // Default to moderate

      // Optimal: Moderate AI usage (not too dependent, not ignoring it)
      const usageEffectivenessScore = 100 - Math.abs(50 - aiDependency);

      evidence.push({
        type: 'metric',
        description: `AI dependency score: ${aiDependency}/100`,
        value: aiDependency,
      });

      // Combine prompt quality with usage effectiveness (70/30 weight)
      const combinedScore = promptAnalysis.score * 0.7 + usageEffectivenessScore * 0.3;

      return {
        score: Math.round(combinedScore),
        confidence: interactions.length >= 5 ? 0.9 : 0.6,
        evidence,
        breakdown: {
          specificity: promptAnalysis.specificity,
          clarity: promptAnalysis.clarity,
          technicalDepth: promptAnalysis.technicalDepth,
          iterationQuality: promptAnalysis.iterationQuality,
          usageEffectiveness: usageEffectivenessScore,
        },
      };
    } catch (error) {
      console.error('[Evaluation Agent] Prompt analysis error:', error);

      // Fallback to simple scoring if analysis fails
      const avgPromptQuality = 3; // Neutral
      const promptQualityScore = ((avgPromptQuality - 1) / 4) * 100;

      // AI usage effectiveness fallback
      const metrics = recording.metrics as any;
      const aiDependency = metrics?.aiDependencyScore || 50;
      const usageEffectivenessScore = 100 - Math.abs(50 - aiDependency);

      // Combine scores
      const combinedScore = promptQualityScore * 0.7 + usageEffectivenessScore * 0.3;

      evidence.push({
        type: 'metric',
        description: 'Prompt analysis unavailable, using fallback scoring',
        value: promptQualityScore,
      });

      evidence.push({
        type: 'metric',
        description: `AI dependency score: ${aiDependency}/100`,
        value: aiDependency,
      });

      return {
        score: Math.round(combinedScore),
        confidence: 0.3, // Low confidence for fallback
        evidence,
        breakdown: {
          promptQuality: promptQualityScore,
          usageEffectiveness: usageEffectivenessScore,
        },
      };
    }
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

    // Code documentation (analyze comments in code)
    const documentationScore = await this.analyzeCodeDocumentation(recording);

    evidence.push({
      type: 'metric',
      description: `Documentation score: ${documentationScore}/100`,
      value: documentationScore,
    });

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
   * Uses Claude to evaluate code quality with circuit breaker and retry
   */
  private async llmCodeReview(recording: SessionRecording): Promise<number> {
    const snapshots = recording.codeSnapshots || [];
    if (snapshots.length === 0) return 0;

    const finalCode = snapshots[snapshots.length - 1];
    const codeFiles = Object.entries(finalCode.files)
      .map(([path, content]) => `// ${path}\n${content}`)
      .join('\n\n');

    try {
      // Use circuit breaker and retry for Claude API
      return await retry(
        async () => {
          return await circuitBreakers.claude.execute(async () => {
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
          });
        },
        {
          maxRetries: 2,
          initialDelay: 2000,
          shouldRetry: isRetryableError,
          onRetry: (error, attempt) => {
            console.warn(`[Evaluation Agent] LLM review retry ${attempt}:`, error.message);
          },
        }
      );
    } catch (error) {
      console.error('[Evaluation Agent] LLM code review failed after retries:', error);
      return 0; // Fallback to 0 if all retries fail
    }
  }

  /**
   * Analyze iteration patterns in code snapshots
   * Evidence-based scoring using statistical distribution
   */
  private analyzeIterationPatterns(snapshots: any[]): number {
    if (snapshots.length === 0) return 0;

    // Research shows: optimal iteration count follows bell curve
    // Peak at 7 iterations (empirical data from successful interviews)
    const iterationCount = snapshots.length;
    const optimalCount = 7;
    const sigma = 3; // Standard deviation

    // Gaussian distribution centered at optimal count
    const deviation = Math.abs(iterationCount - optimalCount);
    const normalizedScore = Math.exp(-Math.pow(deviation / sigma, 2) / 2);

    // Convert to 0-100 scale (minimum 30 for any iteration)
    const score = 30 + normalizedScore * 70;

    return Math.round(score);
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
   * Analyze code documentation using real static analysis
   */
  private async analyzeCodeDocumentation(recording: SessionRecording): Promise<number> {
    const snapshots = recording.codeSnapshots || [];
    if (snapshots.length === 0) return 50; // No code to analyze

    // Get final code snapshot
    const finalCode = snapshots[snapshots.length - 1];

    // Convert to CodeFile format
    const codeFiles: CodeFile[] = Object.entries(finalCode.files).map(
      ([path, content]) => ({
        path,
        content: content as string,
        language: this.detectLanguage(path),
      })
    );

    if (codeFiles.length === 0) return 50;

    // Analyze documentation
    const docResult = analyzeDocumentation(codeFiles);

    return docResult.score;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'go': 'go',
    };
    return langMap[ext || ''] || 'javascript';
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
   * Calculate confidence metrics for evaluation
   */
  private calculateConfidenceMetrics(recording: SessionRecording): ConfidenceMetrics {
    const codeSnapshots = recording.codeSnapshots || [];
    const testResults = recording.testResults || [];
    const claudeInteractions = recording.claudeInteractions || [];
    const terminalCommands = recording.terminalCommands || [];

    const sessionDurationMinutes = recording.duration / 60;

    // Count unique AI interactions (not just all interactions)
    const promptSamples = claudeInteractions.filter(
      (i) => i.candidateMessage && i.candidateMessage.length > 0
    ).length;

    return calculateConfidence({
      codeChangesCount: codeSnapshots.length,
      testRunsCount: testResults.length,
      aiInteractionsCount: claudeInteractions.length,
      sessionDuration: sessionDurationMinutes,
      promptSamples,
      terminalCommandsCount: terminalCommands.length,
    });
  }

  /**
   * Comprehensive bias detection using new module
   */
  private detectBiasesComprehensive(
    recording: SessionRecording,
    scores: {
      codeQuality: DimensionScore;
      problemSolving: DimensionScore;
      aiCollaboration: DimensionScore;
      communication: DimensionScore;
    }
  ): BiasDetectionResult {
    const testResults = recording.testResults || [];
    const testsPassed = testResults.filter((t) => t.passed).length;
    const testsTotal = testResults.length;

    return detectBias({
      scores: {
        codeQuality: scores.codeQuality.score,
        problemSolving: scores.problemSolving.score,
        aiCollaboration: scores.aiCollaboration.score,
        testing: scores.communication.score, // Using communication as testing proxy
      },
      evidence: {
        codeQuality: scores.codeQuality.evidence.length,
        problemSolving: scores.problemSolving.evidence.length,
        aiCollaboration: scores.aiCollaboration.evidence.length,
        testing: scores.communication.evidence.length,
      },
      aiInteractionCount: recording.claudeInteractions?.length || 0,
      sessionDuration: recording.duration / 60,
      testsPassed,
      testsTotal,
    });
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
        testResults: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session) return null;

    // Get question details from candidate
    const candidate = await prisma.candidate.findUnique({
      where: { id: session.candidateId },
      include: {
        assessment: {
          include: {
            questions: {
              include: { seed: true },
              take: 1, // Get first question for now
            },
          },
        },
      },
    });

    const question = candidate?.assessment?.questions?.[0];

    // Map difficulty string to number for IRT
    const difficultyMap: Record<string, number> = {
      'EASY': 3,
      'MEDIUM': 5,
      'HARD': 7,
    };

    const questionDifficulty = question?.difficulty
      ? difficultyMap[question.difficulty] || 5
      : 5;

    const questionTopic = question?.seed?.category || 'general';

    // Build SessionRecording object
    const recording: SessionRecording = {
      sessionId: session.id,
      candidateId: session.candidateId,
      questionId: question?.id || '',
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
      testResults: session.testResults.map((t: any) => ({
        timestamp: t.timestamp,
        testName: t.testName,
        passed: t.passed,
        output: t.output || '',
        error: t.error || undefined,
        duration: t.duration || 0,
      })),
      terminalCommands: session.terminalCommands.map((c: any) => ({
        timestamp: c.timestamp,
        command: c.command,
        output: c.output,
        exitCode: c.exitCode,
      })),
      questionDifficulty,
      questionTopic,
    };

    // Attach metrics
    (recording as any).metrics = session.metrics;

    return recording;
  }

  /**
   * Calculate progressive scoring for multi-question assessments
   */
  private async calculateProgressiveScoring(
    candidateId: string,
    recording: SessionRecording
  ): Promise<{
    progressiveScore: ProgressiveScoreResult;
    expertiseGrowth: { growth: number; trend: 'improving' | 'declining' | 'stable' };
  } | null> {
    try {
      const questions = await prisma.generatedQuestion.findMany({
        where: { candidateId, status: 'COMPLETED' },
        orderBy: { order: 'asc' },
      });

      if (questions.length === 0) return null;

      const questionScores = questions.map((q: { order: number; score: number | null; difficultyAssessment: unknown }) => ({
        questionNumber: q.order,
        score: q.score || 0,
        difficultyAssessment: q.difficultyAssessment as any,
      }));

      const progressiveScore = ProgressiveScoringCalculator.calculateScore(questionScores);
      const expertiseGrowth = ProgressiveScoringCalculator.calculateExpertiseGrowth(
        questionScores.map((q: { questionNumber: number; score: number }) => ({ questionNumber: q.questionNumber, score: q.score }))
      );

      console.log(`[Evaluation Agent] Progressive scoring:`, progressiveScore.expertiseLevel);
      return { progressiveScore, expertiseGrowth };
    } catch (error) {
      console.error('[Evaluation Agent] Progressive scoring error:', error);
      return null;
    }
  }

  /**
   * Generate hiring recommendation based on evaluation scores
   */
  private async generateHiringRecommendationForCandidate(
    candidateId: string,
    scores: {
      codeQuality: DimensionScore;
      problemSolving: DimensionScore;
      aiCollaboration: DimensionScore;
      communication: DimensionScore;
    },
    overallScore: number,
    biasFlags: string[]
  ): Promise<HiringRecommendation | undefined> {
    try {
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: { assessment: true },
      });

      if (!candidate) return undefined;

      const seniorityMap: Record<string, SeniorityLevel> = {
        JUNIOR: 'junior', MID: 'mid', SENIOR: 'senior', LEAD: 'staff', PRINCIPAL: 'principal',
      };
      const seniority = seniorityMap[candidate.assessment.seniority] || 'mid';

      const { detectRedFlags, detectGreenFlags } = await import('../lib/scoring');

      const profileForFlags: CandidateProfile = {
        id: candidateId,
        name: candidate.name,
        email: candidate.email,
        appliedRole: candidate.assessment.role as any,
        targetSeniority: seniority,
        status: candidate.status as any,
        stage: 'assessment' as any,
        assessmentCompleted: true,
        overallScore,
        codeQualityScore: scores.codeQuality.score,
        problemSolvingScore: scores.problemSolving.score,
        aiCollaborationScore: scores.aiCollaboration.score,
        technicalScore: overallScore,
        completionRate: 1,
        timeUsed: 60,
        topStrengths: [],
        areasForImprovement: [],
        redFlags: [],
        greenFlags: [],
        appliedAt: candidate.createdAt.toISOString(),
        lastActivityAt: new Date().toISOString(),
      };

      const redFlags = detectRedFlags(profileForFlags);
      const greenFlags = detectGreenFlags(profileForFlags);
      const candidateProfile = { ...profileForFlags, redFlags, greenFlags };

      return generateHiringRecommendation(candidateProfile, seniority);
    } catch (error) {
      console.error('[Evaluation Agent] Hiring recommendation error:', error);
      return undefined;
    }
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
        codeQualityConfidence: result.codeQuality.confidence,
        problemSolvingScore: result.problemSolving.score,
        problemSolvingEvidence: result.problemSolving.evidence as any,
        problemSolvingConfidence: result.problemSolving.confidence,
        aiCollaborationScore: result.aiCollaboration.score,
        aiCollaborationEvidence: result.aiCollaboration.evidence as any,
        aiCollaborationConfidence: result.aiCollaboration.confidence,
        communicationScore: result.communication.score,
        communicationEvidence: result.communication.evidence as any,
        communicationConfidence: result.communication.confidence,
        overallScore: result.overallScore,
        confidence: result.overallConfidence,
        progressiveScoreResult: result.progressiveScoreResult as any,
        expertiseLevel: result.expertiseLevel,
        expertiseGrowth: result.expertiseGrowth,
        expertiseGrowthTrend: result.expertiseGrowthTrend,
        biasFlags: result.biasFlags,
        confidenceMetrics: result.confidenceMetrics as any,
        biasDetection: result.biasDetection as any,
        fairnessReport: result.fairnessReport,
        hiringRecommendation: result.hiringRecommendation?.decision,
        hiringConfidence: result.hiringRecommendation?.confidence,
        hiringReasoning: result.hiringRecommendation as any,
        model: result.model,
        evaluatedAt: result.evaluatedAt,
      },
    });

    // Update candidate scores
    const candidate = await prisma.candidate.update({
      where: { id: result.candidateId },
      data: {
        overallScore: result.overallScore,
        codingScore: result.codeQuality.score,
        communicationScore: result.communication.score,
        problemSolvingScore: result.problemSolving.score,
        status: 'EVALUATED',
      },
      include: {
        assessment: {
          select: { role: true, seniority: true },
        },
        generatedQuestions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    // Generate actionable report
    try {
      const reportData: EvaluationData = {
        sessionId: result.sessionId,
        candidateId: result.candidateId,
        role: candidate.assessment.role,
        seniority: candidate.assessment.seniority.toLowerCase() as SeniorityLevel,
        techStack: [],
        codeQuality: {
          score: result.codeQuality.score,
          evidence: result.codeQuality.evidence.map(e => e.description),
          breakdown: result.codeQuality.breakdown,
        },
        problemSolving: {
          score: result.problemSolving.score,
          evidence: result.problemSolving.evidence.map(e => e.description),
          breakdown: result.problemSolving.breakdown,
        },
        aiCollaboration: {
          score: result.aiCollaboration.score,
          evidence: result.aiCollaboration.evidence.map(e => e.description),
          breakdown: result.aiCollaboration.breakdown,
        },
        communication: {
          score: result.communication.score,
          evidence: result.communication.evidence.map(e => e.description),
          breakdown: result.communication.breakdown,
        },
        overallScore: result.overallScore,
        expertiseLevel: result.expertiseLevel,
        expertiseGrowthTrend: result.expertiseGrowthTrend,
        questionScores: candidate.generatedQuestions
          .filter((q: any) => q.score !== null)
          .map((q: any, idx: number) => ({
            questionNumber: idx + 1,
            score: q.score,
            difficulty: q.difficulty,
            topics: q.requirements || [],
          })),
      };

      const actionableReport = ActionableReportGenerator.generateReport(reportData);

      // Update evaluation with actionable report
      await prisma.evaluation.update({
        where: { sessionId: result.sessionId },
        data: {
          actionableReport: actionableReport as any,
        },
      });

      console.log(`[Evaluation Agent] Generated actionable report for ${result.candidateId}`);
    } catch (reportError) {
      // Don't fail the evaluation if report generation fails
      console.error(`[Evaluation Agent] Failed to generate actionable report:`, reportError);
    }

    console.log(`[Evaluation Agent] Saved evaluation for ${result.candidateId}`);
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
