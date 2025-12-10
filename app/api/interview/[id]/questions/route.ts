import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import Anthropic from "@anthropic-ai/sdk";
import { GeneratedProblem } from "@/types/problem";
import { incrementalQuestionGenerator } from "@/lib/services/incremental-questions";
import { irtEngine } from "@/lib/services/irt-difficulty-engine";
import type { RequiredTechStack } from "@/types/seed";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";
import { questionAssignmentService } from "@/lib/experiments/question-assignment-service";
import type { QuestionBackendType } from "@/lib/experiments/types";

// Request validation schema for generating next question
const generateQuestionSchema = z.object({
  previousPerformance: z
    .object({
      questionId: z.string(),
      score: z.number(),
      timeSpent: z.number(),
      testsPassedRatio: z.number(),
    })
    .optional(),
});

// Initialize Anthropic client with caching beta
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  defaultHeaders: {
    "anthropic-beta": "prompt-caching-2024-07-31",
  },
});

/**
 * Generate incremental question using selected backend
 * Supports both TypeScript (existing) and LangGraph (Python) backends
 */
async function generateIncrementalQuestionWithBackend(
  backend: QuestionBackendType,
  params: {
    candidateId: string;
    seedId: string;
    seniority: string;
    previousQuestions: any[];
    previousPerformance: any[];
    timeRemaining: number;
    assessmentType?: string;
  }
): Promise<any> {
  if (backend === 'langgraph') {
    // Call Python LangGraph API
    const langgraphUrl = process.env.LANGGRAPH_API_URL || 'http://localhost:8001';
    const startTime = Date.now();

    logger.info('[Questions] Using LangGraph backend for incremental question generation', {
      backend,
      candidateId: params.candidateId,
    });

    try {
      const response = await fetch(`${langgraphUrl}/api/question-generation/generate-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: params.candidateId, // Use candidateId as session identifier
          candidate_id: params.candidateId,
          seed_id: params.seedId,
          seniority: params.seniority,
          previous_questions: params.previousQuestions.map(q => ({
            id: q.id,
            title: q.title,
            description: q.description,
            difficulty: q.difficulty,
            score: q.score,
            started_at: q.startedAt?.toISOString(),
            completed_at: q.completedAt?.toISOString(),
            estimated_time: q.estimatedTime,
          })),
          previous_performance: params.previousPerformance.map(p => ({
            question_id: p.questionId,
            score: p.score,
            time_spent: p.timeSpent,
            tests_passed_ratio: p.testsPassedRatio,
          })),
          time_remaining: params.timeRemaining,
          assessment_type: params.assessmentType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const latencyMs = Date.now() - startTime;

      logger.info('[Questions] LangGraph incremental question generation complete', {
        latencyMs,
        title: result.question?.title,
      });

      // Map Python response to TypeScript format
      return {
        question: {
          id: result.question?.id,
          title: result.question?.title,
          description: result.question?.description,
          requirements: result.question?.requirements,
          difficulty: result.question?.difficulty || 'MEDIUM',
          estimatedTime: result.question?.estimated_time || 30,
          starterCode: result.question?.starter_code,
          difficultyAssessment: result.question?.difficulty_assessment,
        },
        abilityEstimate: result.irt_data?.ability_estimate ? {
          theta: result.irt_data.ability_estimate.theta,
          standardError: result.irt_data.ability_estimate.standard_error,
          reliability: result.irt_data.ability_estimate.reliability,
          questionsUsed: result.irt_data.ability_estimate.questions_used,
        } : null,
        difficultyTargeting: result.irt_data?.difficulty_targeting ? {
          targetDifficulty: result.irt_data.difficulty_targeting.target_difficulty,
          reasoning: result.irt_data.difficulty_targeting.reasoning,
        } : null,
        difficultyVisibility: result.irt_data?.difficulty_visibility || null,
        shouldContinue: result.irt_data?.should_continue || { continue: true, reason: 'assessment_in_progress' },
        strategy: result.strategy,
      };
    } catch (error) {
      logger.error('[Questions] LangGraph backend failed, falling back to TypeScript', error as Error);
      // Fallback to TypeScript generator
      return incrementalQuestionGenerator.generateNextQuestionWithIRT({
        candidateId: params.candidateId,
        seedId: params.seedId,
        seniority: params.seniority as any,
        previousQuestions: params.previousQuestions,
        previousPerformance: params.previousPerformance,
        timeRemaining: params.timeRemaining,
      });
    }
  }

  // Default: Use TypeScript generator
  return incrementalQuestionGenerator.generateNextQuestionWithIRT({
    candidateId: params.candidateId,
    seedId: params.seedId,
    seniority: params.seniority as any,
    previousQuestions: params.previousQuestions,
    previousPerformance: params.previousPerformance,
    timeRemaining: params.timeRemaining,
  });
}

/**
 * GET /api/interview/[id]/questions
 * Get current question for candidate
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  // Await params (Next.js 15 requirement)
  const { id } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  logger.debug('[Questions GET] Fetching current question', { candidateId: id });

    // Verify candidate exists and belongs to authorized organization
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        assessment: {
          include: {
            questions: true,
          },
        },
        generatedQuestions: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundError("Interview session", id);
    }

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      throw new AuthorizationError("Access denied to this interview session");
    }

    // Get current question (first non-completed question)
    const currentQuestion = candidate.generatedQuestions.find(
      (q: any) => q.status === "PENDING" || q.status === "IN_PROGRESS"
    );

    if (!currentQuestion) {
      // No more questions
      logger.info('[Questions GET] No more questions', {
        candidateId: id,
        totalCompleted: candidate.generatedQuestions.length,
      });

      return success({
        currentQuestion: null,
        completed: true,
        totalQuestions: candidate.generatedQuestions.length,
      });
    }

    // Mark question as in progress if pending
    if (currentQuestion.status === "PENDING") {
      await prisma.generatedQuestion.update({
        where: { id: currentQuestion.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      });
    }

    // Check if this is an incremental assessment
    const assessmentQuestionSeeds = candidate.assessment.questions;
    let seedId: string | undefined;
    let seed: any = null;
    let isIncremental = false;

    if (assessmentQuestionSeeds.length > 0) {
      seedId = assessmentQuestionSeeds[0].problemSeedId || undefined;
      if (seedId) {
        seed = await prisma.problemSeed.findUnique({ where: { id: seedId } });
        isIncremental = seed?.seedType === 'incremental';
      }
    }

    // Calculate incremental context if applicable
    let progressionContext = null;
    let buildingOn = "";
    let difficultyVisibility = null;
    let abilityEstimate = null;

    if (isIncremental) {
      const currentQuestionIndex = candidate.generatedQuestions.indexOf(currentQuestion);

      // Calculate progression from completed questions
      const completedQuestions = candidate.generatedQuestions
        .slice(0, currentQuestionIndex)
        .filter((q: any) => q.status === 'COMPLETED' && q.score !== null);

      if (completedQuestions.length > 0) {
        progressionContext = calculateProgressionContext(completedQuestions);
      }

      // Get "building on" context from previous question
      if (currentQuestionIndex > 0) {
        const previousQuestion = candidate.generatedQuestions[currentQuestionIndex - 1];
        if (previousQuestion) {
          buildingOn = `${previousQuestion.title}`;
        }
      }

      // Calculate IRT-based difficulty visibility for the candidate
      const irtPerformance = irtEngine.convertPerformanceToIRT(
        completedQuestions.map((q: any) => ({
          id: q.id,
          difficulty: q.difficulty,
          score: q.score,
          startedAt: q.startedAt,
          completedAt: q.completedAt,
          estimatedTime: q.estimatedTime || 20,
        }))
      );

      abilityEstimate = irtEngine.estimateAbility(irtPerformance);
      const questionDifficulty = irtEngine.categoricalDifficultyToTheta(currentQuestion.difficulty);

      difficultyVisibility = irtEngine.generateDifficultyVisibility(
        currentQuestionIndex + 1,
        questionDifficulty,
        abilityEstimate
      );
    }

    logger.info('[Questions GET] Current question retrieved', {
      candidateId: id,
      questionId: currentQuestion.id,
      questionNumber: candidate.generatedQuestions.indexOf(currentQuestion) + 1,
      isIncremental,
    });

    return success({
      currentQuestion: formatQuestion(currentQuestion),
      completed: false,
      totalQuestions: candidate.generatedQuestions.length,
      currentQuestionIndex:
        candidate.generatedQuestions.indexOf(currentQuestion) + 1,
      isIncremental,
      progressionContext,
      buildingOn,
      difficultyVisibility,
      abilityEstimate: abilityEstimate ? {
        level: abilityEstimate.theta > 1 ? 'advanced' :
               abilityEstimate.theta > 0 ? 'intermediate' :
               abilityEstimate.theta > -1 ? 'developing' : 'foundational',
        confidence: Math.round(abilityEstimate.reliability * 100),
      } : null,
    });
});

/**
 * POST /api/interview/[id]/questions
 * Generate next question based on performance
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  // Await params (Next.js 15 requirement)
  const { id } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  // Parse and validate request body
  const body = await request.json();
  const validationResult = generateQuestionSchema.safeParse(body);

  if (!validationResult.success) {
    logger.warn('[Questions POST] Validation failed', {
      candidateId: id,
      errors: validationResult.error.errors,
    });
    throw new ValidationError("Invalid request: " + validationResult.error.errors.map(e => e.message).join(", "));
  }

  const { previousPerformance } = validationResult.data;

  logger.info('[Questions POST] Generating next question', {
    candidateId: id,
    hasPreviousPerformance: !!previousPerformance,
  });

    // Verify candidate exists and belongs to authorized organization
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        assessment: {
          include: {
            questions: true,
          },
        },
        generatedQuestions: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundError("Interview session", id);
    }

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      throw new AuthorizationError("Access denied to this interview session");
    }

    // Mark previous question as completed if provided
    if (previousPerformance) {
      const previousQuestion = candidate.generatedQuestions.find(
        (q: any) => q.id === previousPerformance.questionId
      );

      if (previousQuestion) {
        await prisma.generatedQuestion.update({
          where: { id: previousQuestion.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            score: previousPerformance.score,
          },
        });
      }
    }

    // Check if assessment uses an incremental seed
    const assessmentQuestionSeeds = candidate.assessment.questions;
    let seedId: string | undefined;
    let seed: any = null;

    if (assessmentQuestionSeeds.length > 0) {
      seedId = assessmentQuestionSeeds[0].problemSeedId || undefined;
      if (seedId) {
        seed = await prisma.problemSeed.findUnique({
          where: { id: seedId },
        });
      }
    }

    let newQuestion: any;

    // Use incremental generator if seed is incremental type
    let irtResult = null;

    if (seed && seed.seedType === 'incremental') {
      // Get question backend assignment for incremental generation
      const sessionRecording = await prisma.sessionRecording.findUnique({
        where: { candidateId: id },
      });

      const questionBackend = await questionAssignmentService.getBackendForSession({
        sessionId: sessionRecording?.id || id,
        candidateId: id,
        organizationId: candidate.organizationId,
        assessmentId: candidate.assessment.id,
        seniority: candidate.assessment.seniority.toLowerCase(),
        role: candidate.assessment.role,
        assessmentType: candidate.assessment.assessmentType,
      });

      logger.info(`[Questions POST] Using IRT-enhanced incremental generator`, {
        candidateId: id,
        seedId,
        questionBackend: questionBackend.backend,
      });

      // Build performance metrics array
      const performanceMetrics = previousPerformance
        ? candidate.generatedQuestions
            .filter((q: any) => q.status === 'COMPLETED')
            .map((q: any) => ({
              questionId: q.id,
              score: q.score || 0,
              timeSpent: q.completedAt && q.startedAt
                ? (q.completedAt.getTime() - q.startedAt.getTime()) / (1000 * 60)
                : 0,
              testsPassedRatio: previousPerformance.testsPassedRatio || 0,
            }))
        : [];

      // Add current performance if provided
      if (previousPerformance) {
        performanceMetrics.push({
          questionId: previousPerformance.questionId,
          score: previousPerformance.score / 100, // Convert to 0-1 scale
          timeSpent: previousPerformance.timeSpent,
          testsPassedRatio: previousPerformance.testsPassedRatio,
        });
      }

      // Calculate time remaining (assume 60 min default if not specified)
      const assessmentDuration = candidate.assessment.duration || 60; // minutes
      const timeElapsed = candidate.startedAt
        ? (Date.now() - candidate.startedAt.getTime()) / (1000 * 60)
        : 0;
      const timeRemaining = Math.max(0, (assessmentDuration - timeElapsed) * 60); // seconds

      // Generate incremental question with backend selection
      irtResult = await generateIncrementalQuestionWithBackend(questionBackend.backend, {
        candidateId: id,
        seedId: seedId!,
        seniority: candidate.assessment.seniority.toLowerCase(),
        previousQuestions: candidate.generatedQuestions,
        previousPerformance: performanceMetrics,
        timeRemaining,
        assessmentType: candidate.assessment.assessmentType,
      });

      newQuestion = irtResult.question;

      // Log IRT decision
      logger.info('[Questions POST] IRT decision', {
        candidateId: id,
        backend: questionBackend.backend,
        abilityEstimate: irtResult.abilityEstimate?.theta?.toFixed(2) ?? 'N/A',
        targetDifficulty: irtResult.difficultyTargeting?.targetDifficulty?.toFixed(2) ?? 'N/A',
        shouldContinue: irtResult.shouldContinue?.continue ?? true,
        reason: irtResult.shouldContinue?.reason ?? 'unknown',
      });
    } else {
      // Use legacy LLM generation
      logger.info('[Questions POST] Using legacy question generator', { candidateId: id });

      const nextQuestionOrder = candidate.generatedQuestions.length;
      const difficulty = determineNextDifficulty(
        candidate.generatedQuestions,
        previousPerformance
      );

      const generatedProblem = await generateProblemWithLLM(
        candidate.assessment.role,
        candidate.assessment.seniority,
        difficulty,
        candidate.generatedQuestions
      );

      // Save generated question
      newQuestion = await prisma.generatedQuestion.create({
        data: {
          candidateId: id,
          order: nextQuestionOrder,
          title: generatedProblem.title,
          description: generatedProblem.description,
          difficulty,
          language: generatedProblem.language,
          requirements: generatedProblem.requirements,
          estimatedTime: generatedProblem.estimatedTime,
          starterCode: generatedProblem.starterCode as any,
          testCases: generatedProblem.testCases as any,
          status: "PENDING",
        },
      });
    }

    // Calculate incremental context if this is an incremental assessment
    let progressionContext = null;
    let buildingOn = "";

    if (seed?.seedType === 'incremental' && candidate.generatedQuestions.length > 0) {
      // Calculate progression context from performance history
      const completedQuestions = candidate.generatedQuestions.filter(
        (q: any) => q.status === 'COMPLETED' && q.score !== null
      );

      if (completedQuestions.length > 0) {
        progressionContext = calculateProgressionContext(completedQuestions);
      }

      // Generate "building on" description from previous question
      const previousQuestion = candidate.generatedQuestions[candidate.generatedQuestions.length - 1];
      if (previousQuestion) {
        buildingOn = `${previousQuestion.title}`;
      }
    }

    logger.info('[Questions POST] Next question generated', {
      candidateId: id,
      questionId: newQuestion.id,
      questionNumber: newQuestion.order,
      difficulty: newQuestion.difficulty,
      isIncremental: seed?.seedType === 'incremental',
    });

    return success({
      question: formatQuestion(newQuestion),
      questionNumber: newQuestion.order,
      isIncremental: seed?.seedType === 'incremental',
      progressionContext,
      buildingOn,
      // IRT-enhanced data for candidate visibility
      difficultyVisibility: irtResult?.difficultyVisibility || null,
      abilityEstimate: irtResult ? {
        level: irtResult.abilityEstimate.theta > 1 ? 'advanced' :
               irtResult.abilityEstimate.theta > 0 ? 'intermediate' :
               irtResult.abilityEstimate.theta > -1 ? 'developing' : 'foundational',
        confidence: Math.round(irtResult.abilityEstimate.reliability * 100),
        questionsUsed: irtResult.abilityEstimate.questionsUsed,
      } : null,
      assessmentContinuation: irtResult ? {
        shouldContinue: irtResult.shouldContinue.continue,
        reason: irtResult.shouldContinue.reason,
        estimatedQuestionsRemaining: irtResult.shouldContinue.continue
          ? Math.max(1, 5 - (newQuestion.order || 1))
          : 0,
      } : null,
    });
});

/**
 * Format question for client response
 */
function formatQuestion(question: any): GeneratedProblem {
  return {
    id: question.id,
    seedId: question.questionSeedId || "",
    title: question.title,
    description: question.description,
    requirements: question.requirements,
    difficulty: question.difficulty.toLowerCase() as "easy" | "medium" | "hard",
    estimatedTime: question.estimatedTime,
    language: question.language as "typescript" | "javascript" | "python" | "go",
    starterCode: question.starterCode as any,
    testCases: question.testCases as any,
    generatedAt: question.createdAt.toISOString(),
    generatedBy: "llm",
    score: question.score || undefined,
    difficultyAssessment: question.difficultyAssessment || undefined,
  };
}

/**
 * Calculate progression context from completed questions
 */
function calculateProgressionContext(completedQuestions: any[]): {
  trend: "improving" | "declining" | "stable";
  action: "extend" | "maintain" | "simplify";
  averageScore: number;
} {
  // Calculate average score
  const scores = completedQuestions.map((q: any) => q.score || 0);
  const averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Determine trend (compare recent half vs first half)
  let trend: "improving" | "declining" | "stable" = "stable";

  if (completedQuestions.length >= 2) {
    const midPoint = Math.floor(completedQuestions.length / 2);
    const firstHalf = scores.slice(0, midPoint);
    const secondHalf = scores.slice(midPoint);

    const firstAvg = firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;

    const improvement = secondAvg - firstAvg;

    if (improvement > 10) {
      trend = "improving";
    } else if (improvement < -10) {
      trend = "declining";
    }
  }

  // Determine recommended action based on average and trend
  let action: "extend" | "maintain" | "simplify";

  if (averageScore >= 75 && trend !== "declining") {
    action = "extend"; // Strong performance → increase challenge
  } else if (averageScore < 50 || trend === "declining") {
    action = "simplify"; // Struggling → provide support
  } else {
    action = "maintain"; // Adequate performance → continue at current level
  }

  return {
    trend,
    action,
    averageScore: Math.round(averageScore),
  };
}

/**
 * Determine next question difficulty based on performance
 */
function determineNextDifficulty(
  previousQuestions: any[],
  previousPerformance?: {
    score: number;
    timeSpent: number;
    testsPassedRatio: number;
  }
): "EASY" | "MEDIUM" | "HARD" {
  // First question is always medium
  if (previousQuestions.length === 0) {
    return "MEDIUM";
  }

  if (!previousPerformance) {
    return "MEDIUM";
  }

  // Adaptive difficulty based on performance
  const score = previousPerformance.score;
  const timeRatio = previousPerformance.timeSpent / 30; // Assuming 30 min baseline
  const testsRatio = previousPerformance.testsPassedRatio;

  // Strong performance -> increase difficulty
  if (score >= 80 && testsRatio >= 0.8 && timeRatio < 1.2) {
    return "HARD";
  }

  // Weak performance -> decrease difficulty
  if (score < 60 || testsRatio < 0.5) {
    return "EASY";
  }

  // Average performance -> maintain medium
  return "MEDIUM";
}

/**
 * Generate problem using LLM
 */
async function generateProblemWithLLM(
  role: string,
  seniority: string,
  difficulty: "EASY" | "MEDIUM" | "HARD",
  previousQuestions: any[]
): Promise<Omit<GeneratedProblem, "id" | "generatedAt" | "generatedBy" | "seedId">> {
  const previousTitles = previousQuestions.map((q) => q.title).join(", ");

  const prompt = `Generate a coding problem for a ${seniority} ${role} developer.

Requirements:
- Difficulty: ${difficulty}
- Language: TypeScript
- Must be different from these previous questions: ${previousTitles || "none"}
- Include realistic test cases
- Provide starter code template

Return a JSON object with this structure:
{
  "title": "Problem title",
  "description": "Detailed problem description with examples",
  "requirements": ["Requirement 1", "Requirement 2"],
  "difficulty": "${difficulty.toLowerCase()}",
  "estimatedTime": 30,
  "language": "typescript",
  "starterCode": [
    {
      "fileName": "solution.ts",
      "content": "// Starter code here"
    }
  ],
  "testCases": [
    {
      "name": "Test case name",
      "input": "input data",
      "expectedOutput": "expected output",
      "hidden": false
    }
  ]
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === "text") {
      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const problem = JSON.parse(jsonMatch[0]);
        return problem;
      }
    }

    throw new Error("Failed to parse LLM response");
  } catch (error) {
    logger.warn("LLM generation error", {
      role,
      seniority,
      difficulty,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Fallback to a default problem
    return {
      title: `${role} Challenge - ${difficulty}`,
      description: `Solve this ${difficulty.toLowerCase()} ${role} programming challenge.`,
      requirements: [
        "Implement the required functionality",
        "Pass all test cases",
        "Write clean, maintainable code",
      ],
      difficulty: difficulty.toLowerCase() as "easy" | "medium" | "hard",
      estimatedTime: difficulty === "EASY" ? 20 : difficulty === "MEDIUM" ? 30 : 45,
      language: "typescript",
      starterCode: [
        {
          fileName: "solution.ts",
          content: `// TODO: Implement your solution here\n\nexport function solution() {\n  // Your code here\n}\n`,
        },
      ],
      testCases: [
        {
          name: "Test case 1",
          input: "test input",
          expectedOutput: "expected output",
          hidden: false,
        },
      ],
    };
  }
}
