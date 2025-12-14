/**
 * Fast Progression Evaluation API
 *
 * Quick pass/fail evaluation for live interview question progression.
 * Uses the FastProgressionAgent which is optimized for speed:
 * - Haiku model (~3x faster than Sonnet)
 * - Max 2-3 tool iterations
 * - Parallel tool execution
 * - No test re-running (trusts UI test results)
 *
 * Target: ~20-40 seconds for decision
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
import { standardRateLimit } from '@/lib/middleware/rate-limit';
import { createFastProgressionAgent } from '@/lib/agents/fast-progression-agent';
import { evaluateFastProgression as evaluateFastProgressionLangGraph } from '@/lib/services/langgraph-client';
import { agentAssignmentService } from '@/lib/experiments/agent-assignment-service';
import { recordEvent } from '@/lib/services/sessions';
import type { FastEvaluationResult, FastEvaluationInput } from '@/lib/types/fast-evaluation';

// Request validation schema
const evaluateProgressionSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  language: z.enum(['javascript', 'typescript', 'python', 'go', 'node.js'], {
    errorMap: () => ({ message: 'Unsupported language' }),
  }),
  testResults: z.object({
    passed: z.number().min(0),
    failed: z.number().min(0),
    total: z.number().min(0),
    output: z.string().optional(),
  }),
  fileName: z.string().optional(),
});

/**
 * POST /api/interview/[id]/evaluate-progression
 *
 * Fast evaluation for question progression decision.
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id: candidateId } = await params;

    // Rate limiting
    const rateLimited = await standardRateLimit(request);
    if (rateLimited) return rateLimited;

    // Authentication
    const session = await getSession();
    if (!session?.user) {
      throw new AuthorizationError('Authentication required');
    }

    // Parse and validate request
    const body = await request.json();
    const parseResult = evaluateProgressionSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        parseResult.error.errors.map((e) => e.message).join(', ')
      );
    }

    const { questionId, language, testResults, fileName } = parseResult.data;

    logger.info('[EvaluateProgression] Starting fast evaluation', {
      candidateId,
      questionId,
      language,
      testsPassed: testResults.passed,
      testsTotal: testResults.total,
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

    // Allow access if user is org member OR if user is the candidate
    const isCandidate = candidate.email === session.user.email;
    if (!userOrg && !isCandidate) {
      throw new AuthorizationError(
        'You do not have access to this interview session'
      );
    }

    // Fetch question details
    const question = await prisma.generatedQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundError('Question not found');
    }

    // Verify question belongs to this candidate
    if (question.candidateId !== candidateId) {
      throw new AuthorizationError('Question does not belong to this session');
    }

    // Get session recording for event recording
    const sessionRecording = await prisma.sessionRecording.findFirst({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });

    const startTime = Date.now();

    // Get backend assignment (claude-sdk or langgraph)
    const assignment = await agentAssignmentService.getBackendForSession({
      sessionId: candidateId,
      candidateId: session.user.id,
      organizationId: candidate.assessment.organizationId,
      assessmentId: candidate.assessmentId,
      assessmentType: question.assessmentType,
    });

    logger.info('[EvaluateProgression] Backend assignment', {
      candidateId,
      backend: assignment.backend,
      source: assignment.source,
      experimentId: assignment.experimentId,
    });

    let result: FastEvaluationResult;

    try {
      if (assignment.backend === 'langgraph') {
        // Call LangGraph Python agent
        const input: FastEvaluationInput = {
          sessionId: sessionRecording?.id ?? candidateId,
          candidateId,
          questionId,
          assessmentType: question.assessmentType,
          questionTitle: question.title,
          questionDescription: question.description,
          questionDifficulty: question.difficulty,
          questionRequirements: question.requirements || [],
          testResults,
          language,
          fileName,
          passingThreshold: 70,
        };
        result = await evaluateFastProgressionLangGraph(input);
      } else {
        // Call TypeScript Claude SDK agent
        const agent = createFastProgressionAgent({
          sessionId: sessionRecording?.id ?? candidateId,
          candidateId,
          questionId,
          assessmentType: question.assessmentType,
          questionTitle: question.title,
          questionDescription: question.description,
          questionDifficulty: question.difficulty,
          questionRequirements: question.requirements || [],
          testResults,
          language,
          fileName,
          passingThreshold: 70,
        });
        result = await agent.evaluate();
      }
    } catch (error) {
      logger.error('[EvaluateProgression] Evaluation failed', {
        candidateId,
        questionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return a fallback result based on test results
      const testPassRate =
        testResults.total > 0
          ? (testResults.passed / testResults.total) * 100
          : 0;

      result = {
        passed: testPassRate >= 70,
        overallScore: testPassRate,
        assessmentType: question.assessmentType,
        criteria:
          question.assessmentType === 'SYSTEM_DESIGN'
            ? {
                designClarity: { score: 0, maxScore: 30, met: false, feedback: 'Evaluation error' },
                tradeoffAnalysis: { score: 0, maxScore: 25, met: false, feedback: 'Evaluation error' },
                apiDesign: { score: 0, maxScore: 20, met: false, feedback: 'Evaluation error' },
                implementation: { score: 0, maxScore: 15, met: false, feedback: 'Evaluation error' },
                communication: { score: 0, maxScore: 10, met: false, feedback: 'Evaluation error' },
              }
            : {
                problemCompletion: { score: 0, maxScore: 30, met: false, feedback: 'Evaluation error' },
                codeQuality: { score: 0, maxScore: 25, met: false, feedback: 'Evaluation error' },
                testing: { score: 0, maxScore: 20, met: false, feedback: 'Evaluation error' },
                errorHandling: { score: 0, maxScore: 15, met: false, feedback: 'Evaluation error' },
                efficiency: { score: 0, maxScore: 10, met: false, feedback: 'Evaluation error' },
              },
        feedback: `Evaluation encountered an error. Score based on test results only: ${testResults.passed}/${testResults.total} tests passed.`,
        blockingReason: testPassRate < 70 ? 'Evaluation failed, insufficient test coverage' : undefined,
        strengths: [],
        improvements: ['Please retry evaluation'],
        metadata: {
          model: 'fallback',
          evaluationTimeMs: Date.now() - startTime,
          toolCallCount: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    }

    // Record evaluation event (only if session recording exists)
    if (sessionRecording) {
      await recordEvent(sessionRecording.id, 'evaluation.fast_progression', 'SYSTEM', {
        questionId,
        passed: result.passed,
        overallScore: result.overallScore,
        criteria: result.criteria,
        feedback: result.feedback,
        strengths: result.strengths,
        improvements: result.improvements,
        metadata: result.metadata,
        backend: assignment.backend,
        experimentId: assignment.experimentId,
      });
    }

    logger.info('[EvaluateProgression] Evaluation complete', {
      candidateId,
      questionId,
      passed: result.passed,
      overallScore: result.overallScore,
      evaluationTimeMs: result.metadata.evaluationTimeMs,
      toolCallCount: result.metadata.toolCallCount,
      backend: assignment.backend,
    });

    return success(result);
  }
);
