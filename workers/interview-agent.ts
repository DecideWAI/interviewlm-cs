/**
 * Interview Agent Worker
 *
 * Background worker that observes candidate progress and adapts interview difficulty.
 * Runs as a BullMQ worker, consuming events from the interview queue.
 *
 * Responsibilities:
 * - Track candidate progress metrics (NOT exposed to candidate)
 * - Estimate ability using Item Response Theory (IRT)
 * - Detect struggling indicators
 * - Adjust question difficulty adaptively
 * - Generate next questions based on performance
 *
 * CRITICAL: This agent is HIDDEN from candidates. It observes only.
 */

import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/queues/config';
import { QUEUE_NAMES } from '../lib/types/events';
import { moveToDeadLetterQueue } from '../lib/queues/dlq';
import type {
  InterviewEventType,
  AIInteractionEventData,
  CodeChangedEventData,
  TestRunEventData,
  QuestionAnsweredEventData,
  SessionStartedEventData,
  SessionCompleteEventData,
} from '../lib/types/events';
import prisma from '../lib/prisma';
import { proactiveAssistance } from '../lib/services/proactive-assistance';
import { recordCodeSnapshot } from '../lib/services/sessions';

/**
 * Interview metrics tracked for each session
 * These are stored in the database but NEVER exposed to candidates
 */
interface InterviewMetrics {
  sessionId: string;

  // IRT (Item Response Theory) parameters
  irtTheta: number; // Ability estimate (-3 to +3, 0 = average)
  irtStandardError: number; // Confidence in theta estimate

  // Progress tracking
  questionsAnswered: number;
  questionsCorrect: number;
  questionsIncorrect: number;

  // AI usage metrics
  aiInteractionsCount: number;
  averagePromptQuality: number;
  aiDependencyScore: number; // 0-100, higher = more dependent

  // Struggle indicators
  strugglingIndicators: string[];
  averageResponseTime: number; // seconds
  testFailureRate: number; // 0-1

  // Adaptive difficulty
  currentDifficulty: number; // 1-10
  recommendedNextDifficulty: number;

  // Timestamps
  lastUpdated: Date;
}

/**
 * Interview Agent Worker
 * Processes events and updates session metrics
 */
class InterviewAgentWorker {
  private worker: Worker;
  private metricsCache: Map<string, InterviewMetrics> = new Map();

  constructor() {
    this.worker = new Worker(
      QUEUE_NAMES.INTERVIEW,
      async (job: Job) => {
        await this.processEvent(job);
      },
      {
        connection: redisConnection,
        concurrency: 10, // Process 10 interviews simultaneously
        limiter: {
          max: 100, // Max 100 jobs per interval
          duration: 1000, // 1 second interval
        },
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      console.log(`[Interview Agent] Processed event: ${job.name} for session ${job.data.sessionId}`);
    });

    this.worker.on('failed', async (job, err) => {
      console.error(`[Interview Agent] Failed to process event: ${job?.name}`, err);

      // Move to dead letter queue if exceeded max attempts
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        await moveToDeadLetterQueue(QUEUE_NAMES.INTERVIEW, job, err);
      }
    });

    this.worker.on('error', (err) => {
      console.error('[Interview Agent] Worker error:', err);
    });

    console.log('[Interview Agent] Worker started');
  }

  /**
   * Process an interview event
   */
  private async processEvent(job: Job): Promise<void> {
    const eventType = job.name as InterviewEventType;
    const data = job.data;

    switch (eventType) {
      case 'ai-interaction':
        await this.handleAIInteraction(data as AIInteractionEventData);
        break;

      case 'code-changed':
        await this.handleCodeChanged(data as CodeChangedEventData);
        break;

      case 'test-run':
        await this.handleTestRun(data as TestRunEventData);
        break;

      case 'question-answered':
        await this.handleQuestionAnswered(data as QuestionAnsweredEventData);
        break;

      case 'session-started':
        await this.handleSessionStarted(data as SessionStartedEventData);
        break;

      case 'session-complete':
        await this.handleSessionComplete(data as SessionCompleteEventData);
        break;

      default:
        console.warn(`[Interview Agent] Unknown event type: ${eventType}`);
    }
  }

  /**
   * Handle AI interaction event
   * Updates AI usage metrics
   */
  private async handleAIInteraction(data: AIInteractionEventData): Promise<void> {
    const { sessionId, candidateMessage, aiResponse, toolsUsed } = data;

    // Track AI query for proactive assistance
    proactiveAssistance.recordAIQuery(sessionId, candidateMessage);

    // Get current metrics
    const metrics = await this.getMetrics(sessionId);

    // Update AI interaction count
    metrics.aiInteractionsCount++;

    // Calculate AI dependency score
    // More interactions + more tools used = higher dependency
    const toolUsageScore = toolsUsed.length * 5; // Each tool use adds 5 points
    const interactionFrequency = metrics.aiInteractionsCount / Math.max(metrics.questionsAnswered, 1);
    metrics.aiDependencyScore = Math.min(100, (interactionFrequency * 20) + toolUsageScore);

    // Detect struggling indicators
    if (candidateMessage.toLowerCase().includes('stuck') ||
        candidateMessage.toLowerCase().includes("don't understand") ||
        candidateMessage.toLowerCase().includes('help')) {
      if (!metrics.strugglingIndicators.includes('asking_for_help')) {
        metrics.strugglingIndicators.push('asking_for_help');
      }
    }

    // Very short messages might indicate frustration or lack of context
    if (candidateMessage.split(/\s+/).length < 5) {
      if (!metrics.strugglingIndicators.includes('short_prompts')) {
        metrics.strugglingIndicators.push('short_prompts');
      }
    }

    // Save updated metrics
    await this.saveMetrics(sessionId, metrics);
  }

  /**
   * Handle code changed event
   * Tracks code modification patterns
   */
  private async handleCodeChanged(data: CodeChangedEventData): Promise<void> {
    const { sessionId, files, trigger } = data;

    // Estimate lines changed (rough approximation)
    const totalLines = Object.values(files).reduce((sum, content) => {
      return sum + (content as string).split('\n').length;
    }, 0);

    // Track code change for proactive assistance
    proactiveAssistance.recordCodeChange(sessionId, Math.max(1, Math.floor(totalLines / 10)));

    // Track code snapshots for evaluation later using helper (handles origin, sequencing, checkpoint)
    for (const [fileName, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue;
      const contentStr = content;
      const language = fileName.endsWith('.ts') ? 'typescript' :
                       fileName.endsWith('.js') ? 'javascript' :
                       fileName.endsWith('.py') ? 'python' : 'unknown';

      // AI origin since this is triggered by code changes in AI-assisted interview
      await recordCodeSnapshot(
        sessionId,
        {
          fileId: fileName,
          fileName,
          language,
          content: contentStr.slice(0, 100000), // Limit size
        },
        "AI"
      );
    }
  }

  /**
   * Handle test run event
   * Updates test failure rate and detects struggling
   */
  private async handleTestRun(data: TestRunEventData): Promise<void> {
    const { sessionId, passed, failed, total } = data;

    // Track test run for proactive assistance
    proactiveAssistance.recordTestRun(sessionId, passed, failed, total);

    const metrics = await this.getMetrics(sessionId);

    // Update test failure rate (exponential moving average)
    const currentFailureRate = failed / total;
    metrics.testFailureRate = metrics.testFailureRate * 0.7 + currentFailureRate * 0.3;

    // Detect struggling if multiple test failures
    if (failed > passed && failed > 2) {
      if (!metrics.strugglingIndicators.includes('high_test_failure_rate')) {
        metrics.strugglingIndicators.push('high_test_failure_rate');
      }
    }

    await this.saveMetrics(sessionId, metrics);
  }

  /**
   * Handle question answered event
   * Updates IRT theta estimate and adjusts difficulty
   */
  private async handleQuestionAnswered(data: QuestionAnsweredEventData): Promise<void> {
    const { sessionId, questionId, isCorrect, timeSpent } = data;

    const metrics = await this.getMetrics(sessionId);

    // Update question counts
    metrics.questionsAnswered++;
    if (isCorrect) {
      metrics.questionsCorrect++;
    } else {
      metrics.questionsIncorrect++;
    }

    // Update average response time (exponential moving average)
    metrics.averageResponseTime = metrics.averageResponseTime * 0.7 + timeSpent * 0.3;

    // Update IRT theta estimate
    // Simplified IRT: adjust theta based on difficulty and correctness
    const question = await prisma.generatedQuestion.findUnique({
      where: { id: questionId },
      select: { difficulty: true },
    });

    if (question) {
      // Convert difficulty enum to 1-10 scale
      const difficultyMap: Record<string, number> = {
        'EASY': 3,
        'MEDIUM': 5,
        'HARD': 7,
      };
      const difficulty = difficultyMap[question.difficulty] || 5; // 1-10 scale
      const difficultyNormalized = (difficulty - 5.5) / 1.5; // Convert to IRT scale (-3 to +3)

      // IRT update formula (simplified)
      // If correct and difficulty > theta: increase theta
      // If incorrect and difficulty < theta: decrease theta
      const thetaDelta = isCorrect
        ? Math.max(0, (difficultyNormalized - metrics.irtTheta) * 0.3)
        : Math.min(0, (difficultyNormalized - metrics.irtTheta) * 0.3);

      metrics.irtTheta = Math.max(-3, Math.min(3, metrics.irtTheta + thetaDelta));

      // Update standard error (decreases with more questions)
      metrics.irtStandardError = 1.5 / Math.sqrt(metrics.questionsAnswered);

      // Adjust recommended difficulty based on theta
      // Target: slightly above current ability
      metrics.recommendedNextDifficulty = Math.round(
        5.5 + (metrics.irtTheta + 0.5) * 1.5
      );
      metrics.recommendedNextDifficulty = Math.max(1, Math.min(10, metrics.recommendedNextDifficulty));
    }

    // Detect struggling indicators
    if (timeSpent > 1800) { // More than 30 minutes
      if (!metrics.strugglingIndicators.includes('slow_response_time')) {
        metrics.strugglingIndicators.push('slow_response_time');
      }
    }

    await this.saveMetrics(sessionId, metrics);

    // If difficulty needs adjustment, publish event
    if (Math.abs(metrics.currentDifficulty - metrics.recommendedNextDifficulty) >= 2) {
      // Difficulty adjustment logic would go here
      // For now, just log
      console.log(
        `[Interview Agent] Recommend difficulty adjustment for session ${sessionId}: ` +
        `${metrics.currentDifficulty} → ${metrics.recommendedNextDifficulty}`
      );
    }
  }

  /**
   * Handle session started event
   * Initialize metrics for new session
   */
  private async handleSessionStarted(data: SessionStartedEventData): Promise<void> {
    const { sessionId, difficulty } = data;

    const metrics: InterviewMetrics = {
      sessionId,
      irtTheta: 0, // Start at average ability
      irtStandardError: 1.5,
      questionsAnswered: 0,
      questionsCorrect: 0,
      questionsIncorrect: 0,
      aiInteractionsCount: 0,
      averagePromptQuality: 3,
      aiDependencyScore: 0,
      strugglingIndicators: [],
      averageResponseTime: 0,
      testFailureRate: 0,
      currentDifficulty: difficulty,
      recommendedNextDifficulty: difficulty,
      lastUpdated: new Date(),
    };

    await this.saveMetrics(sessionId, metrics);
    console.log(`[Interview Agent] Initialized metrics for session ${sessionId}`);
  }

  /**
   * Handle session complete event
   * Finalize metrics and prepare for evaluation
   */
  private async handleSessionComplete(data: SessionCompleteEventData): Promise<void> {
    const { sessionId } = data;

    const metrics = await this.getMetrics(sessionId);

    console.log(`[Interview Agent] Session ${sessionId} complete. Final metrics:`, {
      irtTheta: metrics.irtTheta,
      questionsAnswered: metrics.questionsAnswered,
      successRate: metrics.questionsCorrect / Math.max(metrics.questionsAnswered, 1),
      aiDependencyScore: metrics.aiDependencyScore,
      strugglingIndicators: metrics.strugglingIndicators,
    });

    // Metrics are already saved in database for Evaluation Agent to use
  }

  /**
   * Get metrics for a session
   * Note: Metrics are stored in memory during session -
   * SessionRecording doesn't have a metrics field in current schema
   */
  private async getMetrics(sessionId: string): Promise<InterviewMetrics> {
    // Check in-memory cache first
    const cached = this.metricsCache?.get(sessionId);
    if (cached) {
      return cached;
    }

    // Return default metrics if not found
    return {
      sessionId,
      irtTheta: 0,
      irtStandardError: 1.5,
      questionsAnswered: 0,
      questionsCorrect: 0,
      questionsIncorrect: 0,
      aiInteractionsCount: 0,
      averagePromptQuality: 3,
      aiDependencyScore: 0,
      strugglingIndicators: [],
      averageResponseTime: 0,
      testFailureRate: 0,
      currentDifficulty: 5,
      recommendedNextDifficulty: 5,
      lastUpdated: new Date(),
    };
  }

  /**
   * Save metrics to in-memory cache
   * Note: SessionRecording doesn't have a metrics field in current schema
   * Metrics are stored in memory during the session
   */
  private async saveMetrics(sessionId: string, metrics: InterviewMetrics): Promise<void> {
    metrics.lastUpdated = new Date();

    // Store in memory cache
    this.metricsCache.set(sessionId, metrics);
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    await this.worker.close();
    console.log('[Interview Agent] Worker stopped');
  }
}

/**
 * Start the Interview Agent worker
 * Call this from your worker process
 */
export function startInterviewAgent(): InterviewAgentWorker {
  return new InterviewAgentWorker();
}

/**
 * Standalone script to run the worker
 * Usage: ts-node workers/interview-agent.ts
 */
if (require.main === module) {
  const worker = startInterviewAgent();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Interview Agent] Received SIGTERM, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Interview Agent] Received SIGINT, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });
}
