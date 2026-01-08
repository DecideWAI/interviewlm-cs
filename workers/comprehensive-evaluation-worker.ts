/**
 * Comprehensive Evaluation Worker
 *
 * Dedicated background worker for comprehensive session evaluations.
 * Processes jobs from the evaluation queue with job name 'comprehensive'.
 *
 * Features:
 * - Full session re-evaluation from scratch
 * - 4-dimension scoring with evidence
 * - Actionable report generation
 * - Hiring recommendation with reasoning
 * - Bias detection and fairness reporting
 */

import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/queues/config';
import { QUEUE_NAMES } from '../lib/types/events';
import { moveToDeadLetterQueue } from '../lib/queues/dlq';
import { logger } from '../lib/utils/logger';
import prisma from '../lib/prisma';
import {
  createComprehensiveEvaluationAgent,
} from '../lib/agents/comprehensive-evaluation-agent';
import { evaluateComprehensive as evaluateComprehensiveLangGraph } from '../lib/services/langgraph-client';
import { recordEvent } from '../lib/services/sessions';
import { linkEvaluationEvidence } from '../lib/services/evidence-linking';
import type { ComprehensiveEvaluationJobData, ComprehensiveEvaluationInput } from '../lib/types/comprehensive-evaluation';

/**
 * Comprehensive Evaluation Worker
 */
class ComprehensiveEvaluationWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      QUEUE_NAMES.EVALUATION,
      async (job: Job) => {
        // Only process 'comprehensive' jobs
        if (job.name === 'comprehensive') {
          await this.handleComprehensiveEvaluation(job);
        }
        // Let other job types pass through (handled by other workers)
      },
      {
        connection: redisConnection,
        concurrency: 3, // Lower concurrency - these are expensive evaluations
        limiter: {
          max: 5,
          duration: 60000, // 5 jobs per minute max
        },
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job: Job) => {
      if (job.name === 'comprehensive') {
        logger.info('[ComprehensiveEvaluationWorker] Evaluation completed', {
          sessionId: job.data.sessionId,
          jobId: job.id,
        });
      }
    });

    this.worker.on('failed', async (job: Job | undefined, err: Error) => {
      if (job?.name === 'comprehensive') {
        logger.error('[ComprehensiveEvaluationWorker] Evaluation failed', err, {
          sessionId: job?.data.sessionId,
          jobId: job?.id,
        });

        // Move to dead letter queue if exceeded max attempts
        if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
          await moveToDeadLetterQueue(QUEUE_NAMES.EVALUATION, job, err);
        }
      }
    });

    this.worker.on('error', (err: Error) => {
      logger.error('[ComprehensiveEvaluationWorker] Worker error', err);
    });

    logger.info('[ComprehensiveEvaluationWorker] Worker started');
  }

  /**
   * Handle comprehensive evaluation job
   */
  private async handleComprehensiveEvaluation(job: Job): Promise<void> {
    const data = job.data as ComprehensiveEvaluationJobData;

    const backend = data.backend || 'claude-sdk'; // Default to claude-sdk if not specified

    logger.info('[ComprehensiveEvaluationWorker] Processing evaluation', {
      sessionId: data.sessionId,
      jobId: job.id,
      priority: data.priority,
      backend,
      experimentId: data.experimentId,
    });

    // Check idempotency - skip if already evaluated
    const existingEvaluation = await prisma.evaluation.findFirst({
      where: { sessionId: data.sessionId },
    });

    if (existingEvaluation) {
      logger.info('[ComprehensiveEvaluationWorker] Evaluation already exists, skipping', {
        sessionId: data.sessionId,
        evaluationId: existingEvaluation.id,
      });
      return;
    }

    // Fetch candidate and assessment data
    const candidate = await prisma.candidate.findUnique({
      where: { id: data.candidateId },
      include: {
        assessment: true,
        generatedQuestions: {
          where: { status: 'COMPLETED' },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!candidate) {
      logger.error('[ComprehensiveEvaluationWorker] Candidate not found', undefined, {
        candidateId: data.candidateId,
      });
      throw new Error(`Candidate not found: ${data.candidateId}`);
    }

    // Prepare evaluation input
    const evaluationInput: ComprehensiveEvaluationInput = {
      sessionId: data.sessionId,
      candidateId: data.candidateId,
      role: candidate.assessment.role,
      seniority: candidate.assessment.seniority.toLowerCase() as import('@/types/assessment').SeniorityLevel,
      questions: candidate.generatedQuestions.map((q) => ({
        questionId: q.id,
        title: q.title,
        description: q.description,
        difficulty: q.difficulty.toLowerCase(),
        requirements: q.requirements || [],
        assessmentType: candidate.assessment.assessmentType.toLowerCase() as import('@/types/assessment').AssessmentType,
      })),
    };

    let result;

    if (backend === 'langgraph') {
      // Call LangGraph Python agent
      logger.info('[ComprehensiveEvaluationWorker] Using LangGraph backend', {
        sessionId: data.sessionId,
      });
      result = await evaluateComprehensiveLangGraph(evaluationInput);
    } else {
      // Call TypeScript Claude SDK agent
      logger.info('[ComprehensiveEvaluationWorker] Using Claude SDK backend', {
        sessionId: data.sessionId,
      });
      const agent = createComprehensiveEvaluationAgent(evaluationInput);
      result = await agent.evaluate();
    }

    // Save to database - cast complex objects to JSON for Prisma compatibility
    const evaluation = await prisma.evaluation.create({
      data: {
        sessionId: data.sessionId,
        candidateId: data.candidateId,
        codeQualityScore: Math.round(result.codeQuality.score),
        codeQualityConfidence: result.codeQuality.confidence,
        codeQualityEvidence: JSON.parse(JSON.stringify(result.codeQuality.evidence)),
        problemSolvingScore: Math.round(result.problemSolving.score),
        problemSolvingConfidence: result.problemSolving.confidence,
        problemSolvingEvidence: JSON.parse(JSON.stringify(result.problemSolving.evidence)),
        aiCollaborationScore: Math.round(result.aiCollaboration.score),
        aiCollaborationConfidence: result.aiCollaboration.confidence,
        aiCollaborationEvidence: JSON.parse(JSON.stringify(result.aiCollaboration.evidence)),
        communicationScore: Math.round(result.communication.score),
        communicationConfidence: result.communication.confidence,
        communicationEvidence: JSON.parse(JSON.stringify(result.communication.evidence)),
        overallScore: Math.round(result.overallScore),
        confidence: result.overallConfidence,
        expertiseLevel: result.expertiseLevel,
        expertiseGrowthTrend: result.expertiseGrowthTrend,
        biasFlags: result.biasFlags,
        biasDetection: result.biasDetection ? JSON.parse(JSON.stringify(result.biasDetection)) : null,
        fairnessReport: result.fairnessReport,
        hiringRecommendation: result.hiringRecommendation.decision,
        hiringConfidence: result.hiringRecommendation.confidence,
        hiringReasoning: result.hiringRecommendation.reasoning,
        actionableReport: JSON.parse(JSON.stringify(result.actionableReport)),
        model: result.model,
      },
    });

    // Link evaluation evidence to timeline events for Sentry-like replay
    try {
      const linksCreated = await linkEvaluationEvidence(evaluation.id, data.sessionId);
      logger.info('[ComprehensiveEvaluationWorker] Evidence links created', {
        sessionId: data.sessionId,
        evaluationId: evaluation.id,
        linksCreated,
      });
    } catch (linkError) {
      // Non-fatal: log warning but don't fail the evaluation
      logger.warn('[ComprehensiveEvaluationWorker] Failed to create evidence links', {
        sessionId: data.sessionId,
        evaluationId: evaluation.id,
        error: linkError instanceof Error ? linkError.message : 'Unknown error',
      });
    }

    // Update candidate status
    await prisma.candidate.update({
      where: { id: data.candidateId },
      data: {
        overallScore: result.overallScore,
        status: 'EVALUATED',
      },
    });

    // Record completion event
    await recordEvent(data.sessionId, 'evaluation.complete', 'SYSTEM', {
      overallScore: result.overallScore,
      hiringDecision: result.hiringRecommendation.decision,
      hiringConfidence: result.hiringRecommendation.confidence,
      evaluationTimeMs: result.evaluationTimeMs,
      biasFlags: result.biasFlags,
      backend,
      experimentId: data.experimentId,
    });

    // TODO: Notify hiring manager (queue notification job)
    // await this.notifyHiringManager(result);

    logger.info('[ComprehensiveEvaluationWorker] Evaluation saved', {
      sessionId: data.sessionId,
      overallScore: result.overallScore,
      hiringDecision: result.hiringRecommendation.decision,
      backend,
    });
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    await this.worker.close();
    logger.info('[ComprehensiveEvaluationWorker] Worker closed');
  }
}

// Start worker if running as main module
// In Next.js, this would be started by a separate process or server-side initialization
const worker = new ComprehensiveEvaluationWorker();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('[ComprehensiveEvaluationWorker] Received SIGTERM, shutting down...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('[ComprehensiveEvaluationWorker] Received SIGINT, shutting down...');
  await worker.close();
  process.exit(0);
});

export { ComprehensiveEvaluationWorker };
