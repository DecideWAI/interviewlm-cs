/**
 * Comprehensive Evaluation API
 *
 * Queue comprehensive evaluation for background processing.
 * This endpoint is called when a session ends and triggers
 * the full evaluation pipeline with actionable reports.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth-helpers';
import {
  withErrorHandling,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/utils/errors';
import { success } from '@/lib/utils/api-response';
import { logger } from '@/lib/utils/logger';
import { getQueue } from '@/lib/queues/config';
import { QUEUE_NAMES } from '@/lib/types/events';
import { recordEvent } from '@/lib/services/sessions';
import { evaluateComprehensive as evaluateComprehensiveLangGraph } from '@/lib/services/langgraph-client';
import { agentAssignmentService } from '@/lib/experiments/agent-assignment-service';
import type { ComprehensiveEvaluationJobData, ComprehensiveEvaluationInput } from '@/lib/types/comprehensive-evaluation';

// Request validation schema
const evaluateComprehensiveSchema = z.object({
  priority: z.enum(['high', 'normal', 'low']).optional().default('normal'),
  immediate: z.boolean().optional().default(false), // If true, run synchronously (not recommended)
});

/**
 * POST /api/interview/[id]/evaluate-comprehensive
 *
 * Queue comprehensive evaluation for background processing.
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id: candidateId } = await params;

    // Authentication
    const session = await getSession();
    if (!session?.user) {
      throw new AuthorizationError('Authentication required');
    }

    // Parse and validate request
    const body = await request.json().catch(() => ({}));
    const parseResult = evaluateComprehensiveSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        parseResult.error.errors.map((e) => e.message).join(', ')
      );
    }

    const { priority, immediate } = parseResult.data;

    logger.info('[EvaluateComprehensive] Request received', {
      candidateId,
      priority,
      immediate,
    });

    // Fetch candidate and verify access
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        assessment: {
          include: {
            organization: true,
          },
        },
        questions: {
          where: { status: 'COMPLETED' },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundError('Candidate session not found');
    }

    // Verify user has access to this organization
    const userOrg = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: candidate.assessment.organizationId,
      },
    });

    // Only org members can trigger comprehensive evaluation (not candidates)
    if (!userOrg) {
      throw new AuthorizationError(
        'Only organization members can trigger comprehensive evaluation'
      );
    }

    // Get session recording for event recording
    const sessionRecording = await prisma.sessionRecording.findFirst({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });

    // Check if evaluation already exists
    const existingEvaluation = await prisma.evaluation.findFirst({
      where: { sessionId: candidateId },
    });

    if (existingEvaluation) {
      logger.info('[EvaluateComprehensive] Evaluation already exists', {
        candidateId,
        evaluationId: existingEvaluation.id,
      });

      return success({
        queued: false,
        message: 'Evaluation already exists',
        evaluationId: existingEvaluation.id,
        evaluatedAt: existingEvaluation.createdAt,
      });
    }

    // Determine job priority
    const priorityMap = {
      high: 1,
      normal: 2,
      low: 3,
    };

    // Get backend assignment (claude-sdk or langgraph)
    const assignment = await agentAssignmentService.getBackendForSession({
      sessionId: candidateId,
      candidateId: session.user.id,
      organizationId: candidate.assessment.organizationId,
      assessmentId: candidate.assessmentId,
    });

    logger.info('[EvaluateComprehensive] Backend assignment', {
      candidateId,
      backend: assignment.backend,
      source: assignment.source,
      experimentId: assignment.experimentId,
    });

    const jobData: ComprehensiveEvaluationJobData = {
      sessionId: candidateId,
      candidateId,
      triggeredAt: new Date().toISOString(),
      priority,
      backend: assignment.backend,
      experimentId: assignment.experimentId,
    };

    // If immediate is requested (not recommended for production)
    if (immediate) {
      logger.warn('[EvaluateComprehensive] Running immediate evaluation', {
        candidateId,
        backend: assignment.backend,
      });

      try {
        const evaluationInput: ComprehensiveEvaluationInput = {
          sessionId: candidateId,
          candidateId,
          role: candidate.assessment.roleTitle,
          seniority: candidate.assessment.seniority,
          questions: candidate.questions.map((q) => ({
            questionId: q.id,
            title: q.title,
            description: q.description,
            difficulty: q.difficulty,
            requirements: q.requirements || [],
            assessmentType: q.assessmentType,
          })),
        };

        let result;

        if (assignment.backend === 'langgraph') {
          // Call LangGraph Python agent
          result = await evaluateComprehensiveLangGraph(evaluationInput);
        } else {
          // Call TypeScript Claude SDK agent
          const { createComprehensiveEvaluationAgent } = await import(
            '@/lib/agents/comprehensive-evaluation-agent'
          );

          const agent = createComprehensiveEvaluationAgent(evaluationInput);
          result = await agent.evaluate();
        }

        // Save to database
        await prisma.evaluation.create({
          data: {
            sessionId: candidateId,
            candidateId,
            codeQuality: result.codeQuality,
            codeQualityConfidence: result.codeQuality.confidence,
            codeQualityEvidence: result.codeQuality.evidence,
            problemSolving: result.problemSolving,
            problemSolvingConfidence: result.problemSolving.confidence,
            problemSolvingEvidence: result.problemSolving.evidence,
            aiCollaboration: result.aiCollaboration,
            aiCollaborationConfidence: result.aiCollaboration.confidence,
            aiCollaborationEvidence: result.aiCollaboration.evidence,
            communication: result.communication,
            communicationConfidence: result.communication.confidence,
            communicationEvidence: result.communication.evidence,
            overallScore: result.overallScore,
            confidence: result.overallConfidence,
            expertiseLevel: result.expertiseLevel,
            expertiseGrowthTrend: result.expertiseGrowthTrend,
            biasFlags: result.biasFlags,
            biasDetection: result.biasDetection,
            fairnessReport: result.fairnessReport,
            hiringRecommendation: result.hiringRecommendation.decision,
            hiringConfidence: result.hiringRecommendation.confidence,
            hiringReasoning: result.hiringRecommendation.reasoning,
            actionableReport: result.actionableReport,
            model: result.model,
            evaluationTime: result.evaluationTimeMs,
          },
        });

        // Record event (only if session recording exists)
        if (sessionRecording) {
          await recordEvent(sessionRecording.id, 'evaluation.comprehensive_complete', 'SYSTEM', {
            overallScore: result.overallScore,
            hiringDecision: result.hiringRecommendation.decision,
            evaluationTimeMs: result.evaluationTimeMs,
            immediate: true,
            backend: assignment.backend,
            experimentId: assignment.experimentId,
          });
        }

        logger.info('[EvaluateComprehensive] Immediate evaluation complete', {
          candidateId,
          overallScore: result.overallScore,
          hiringDecision: result.hiringRecommendation.decision,
          backend: assignment.backend,
        });

        return success({
          queued: false,
          completed: true,
          result: {
            overallScore: result.overallScore,
            hiringDecision: result.hiringRecommendation.decision,
            hiringConfidence: result.hiringRecommendation.confidence,
            evaluatedAt: result.evaluatedAt,
          },
        });
      } catch (error) {
        logger.error('[EvaluateComprehensive] Immediate evaluation failed', {
          candidateId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fall back to queued evaluation
        const queue = getQueue(QUEUE_NAMES.EVALUATION);
        await queue.add('comprehensive', jobData, {
          priority: priorityMap[priority],
          attempts: 3,
        });

        return success({
          queued: true,
          message: 'Immediate evaluation failed, queued for background processing',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Queue the evaluation job
    const queue = getQueue(QUEUE_NAMES.EVALUATION);

    const job = await queue.add('comprehensive', jobData, {
      priority: priorityMap[priority],
      attempts: 3,
      delay: 0, // Start immediately
    });

    // Record event (only if session recording exists)
    if (sessionRecording) {
      await recordEvent(sessionRecording.id, 'evaluation.comprehensive_queued', 'SYSTEM', {
        jobId: job.id,
        priority,
      });
    }

    logger.info('[EvaluateComprehensive] Evaluation queued', {
      candidateId,
      jobId: job.id,
      priority,
    });

    return success({
      queued: true,
      message: 'Comprehensive evaluation queued for background processing',
      jobId: job.id,
      estimatedCompletionTime: '3-5 minutes',
    });
  }
);

/**
 * GET /api/interview/[id]/evaluate-comprehensive
 *
 * Check status of comprehensive evaluation.
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id: candidateId } = await params;

    // Authentication
    const session = await getSession();
    if (!session?.user) {
      throw new AuthorizationError('Authentication required');
    }

    // Fetch candidate and verify access
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        assessment: true,
      },
    });

    if (!candidate) {
      throw new NotFoundError('Candidate session not found');
    }

    // Verify user has access
    const userOrg = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: candidate.assessment.organizationId,
      },
    });

    if (!userOrg) {
      throw new AuthorizationError(
        'You do not have access to this evaluation'
      );
    }

    // Check if evaluation exists
    const evaluation = await prisma.evaluation.findFirst({
      where: { sessionId: candidateId },
    });

    if (evaluation) {
      return success({
        status: 'completed',
        evaluation: {
          id: evaluation.id,
          overallScore: evaluation.overallScore,
          hiringRecommendation: evaluation.hiringRecommendation,
          hiringConfidence: evaluation.hiringConfidence,
          evaluatedAt: evaluation.createdAt,
        },
      });
    }

    // Check queue for pending jobs
    const queue = getQueue(QUEUE_NAMES.EVALUATION);
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed']);

    const pendingJob = jobs.find(
      (job) =>
        job.name === 'comprehensive' &&
        (job.data as ComprehensiveEvaluationJobData).sessionId === candidateId
    );

    if (pendingJob) {
      return success({
        status: 'pending',
        jobId: pendingJob.id,
        queuedAt: (pendingJob.data as ComprehensiveEvaluationJobData).triggeredAt,
        state: await pendingJob.getState(),
      });
    }

    return success({
      status: 'not_started',
      message: 'No evaluation has been queued for this session',
    });
  }
);
