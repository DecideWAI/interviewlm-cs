import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@langchain/langgraph-sdk";
import { v5 as uuidv5 } from "uuid";
import { GeneratedProblem } from "@/types/problem";
import { incrementalQuestionGenerator } from "@/lib/services/incremental-questions";
import { irtEngine } from "@/lib/services/irt-difficulty-engine";
import { sessionService as sessions } from "@/lib/services";
import type { RequiredTechStack } from "@/types/seed";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";
import { questionAssignmentService } from "@/lib/experiments/question-assignment-service";

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

// Use Haiku for fast question generation (~10-15s vs 50-60s with Sonnet)
const QUESTION_GEN_MODEL = process.env.QUESTION_GEN_MODEL || "claude-haiku-4-5-20251001";

// LangGraph SDK client for question generation
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || "http://localhost:2024";
const langGraphClient = new Client({ apiUrl: LANGGRAPH_API_URL });

// Namespace for generating deterministic thread UUIDs
const QUESTION_GEN_NAMESPACE = "7ba7b810-9dad-11d1-80b4-00c04fd430c9";

/**
 * Attempt to repair and parse potentially malformed JSON from LLM responses.
 * Handles common issues like unterminated strings, trailing commas, etc.
 */
function repairAndParseJson<T>(jsonStr: string): T {
  // First, try direct parsing
  try {
    return JSON.parse(jsonStr);
  } catch (firstError) {
    logger.warn('[JSON Repair] Direct parse failed, attempting repair', {
      error: (firstError as Error).message,
      jsonLength: jsonStr.length,
    });
  }

  // Try to repair common issues
  let repaired = jsonStr;

  // 1. Fix unterminated strings at the end (truncation issue)
  // Count unescaped quotes to check if we have an odd number
  const quoteMatches = repaired.match(/(?<!\\)"/g);
  if (quoteMatches && quoteMatches.length % 2 !== 0) {
    // Odd number of quotes - likely truncated mid-string
    // Find the last unescaped quote and close it
    repaired = repaired + '"';
    logger.info('[JSON Repair] Added closing quote for unterminated string');
  }

  // 2. Try to close any unclosed braces/brackets
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Close unclosed brackets first (inner), then braces (outer)
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired = repaired + ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired = repaired + '}';
  }

  // 3. Remove trailing commas before closing brackets/braces
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // 4. Try parsing again
  try {
    const result = JSON.parse(repaired);
    logger.info('[JSON Repair] Successfully repaired and parsed JSON');
    return result;
  } catch (secondError) {
    // 5. More aggressive repair: try to extract a valid subset
    // Look for complete objects in the JSON
    logger.warn('[JSON Repair] Standard repair failed, trying aggressive repair', {
      error: (secondError as Error).message,
    });
  }

  // 6. Try to find the last complete property and truncate there
  // This handles cases where we're mid-property value
  const lastCompleteProperty = repaired.lastIndexOf('",');
  if (lastCompleteProperty > 0) {
    const truncated = repaired.substring(0, lastCompleteProperty + 1);
    // Count braces again and close them
    const openB = (truncated.match(/\{/g) || []).length;
    const closeB = (truncated.match(/\}/g) || []).length;
    const openBr = (truncated.match(/\[/g) || []).length;
    const closeBr = (truncated.match(/\]/g) || []).length;

    let finalJson = truncated;
    for (let i = 0; i < openBr - closeBr; i++) {
      finalJson = finalJson + ']';
    }
    for (let i = 0; i < openB - closeB; i++) {
      finalJson = finalJson + '}';
    }

    try {
      const result = JSON.parse(finalJson);
      logger.info('[JSON Repair] Aggressive truncation repair succeeded');
      return result;
    } catch (thirdError) {
      logger.error('[JSON Repair] All repair attempts failed', thirdError as Error, {
        originalLength: jsonStr.length,
        repairedLength: finalJson.length,
      });
    }
  }

  // If all repairs fail, throw with helpful context
  throw new Error(`Failed to parse JSON after repair attempts. Original length: ${jsonStr.length}. First 500 chars: ${jsonStr.substring(0, 500)}...`);
}

function generateQuestionGenThreadId(sessionId: string, questionNumber: number): string {
  return uuidv5(`question-gen-${sessionId}-${questionNumber}`, QUESTION_GEN_NAMESPACE);
}

/**
 * Generate incremental question using TypeScript IRT engine
 */
async function generateIncrementalQuestionTypeScript(params: {
  candidateId: string;
  seedId: string;
  seniority: string;
  previousQuestions: any[];
  previousPerformance: any[];
  timeRemaining: number;
  assessmentType?: string;
}): Promise<any> {
  logger.info('[Questions] Using TypeScript IRT engine for incremental question generation', {
    candidateId: params.candidateId,
    seedId: params.seedId,
  });

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
 * Generate question using LangGraph SDK
 */
async function generateQuestionWithLangGraph(params: {
  sessionId: string;
  candidateId: string;
  seedId?: string;
  role: string;
  seniority: string;
  assessmentType: string;
  techStack: string[];
  organizationId?: string;
  previousQuestions?: any[];
  previousPerformance?: any[];
  timeRemaining?: number;
  questionNumber: number;
}): Promise<any> {
  const threadId = generateQuestionGenThreadId(params.sessionId, params.questionNumber);

  logger.info('[Questions] Using LangGraph SDK for question generation', {
    candidateId: params.candidateId,
    threadId,
    isIncremental: !!params.seedId,
  });

  const startTime = Date.now();

  try {
    // Build input state for the graph
    const inputState: Record<string, any> = {
      session_id: params.sessionId,
      candidate_id: params.candidateId,
      role: params.role,
      seniority: params.seniority,
      assessment_type: params.assessmentType,
      tech_stack: params.techStack,
      organization_id: params.organizationId,
    };

    // Add incremental context if present
    if (params.seedId) {
      inputState.seed_id = params.seedId;
      inputState.previous_questions = params.previousQuestions || [];
      inputState.previous_performance = params.previousPerformance || [];
      inputState.time_remaining = params.timeRemaining || 3600;
    }

    // Call LangGraph SDK
    const result = await langGraphClient.runs.wait(threadId, "question_generation_agent", {
      input: inputState,
      config: {
        configurable: {
          session_id: params.sessionId,
          candidate_id: params.candidateId,
        },
      },
    });

    const latencyMs = Date.now() - startTime;
    const state = result as Record<string, any>;

    logger.info('[Questions] LangGraph question generation complete', {
      candidateId: params.candidateId,
      latencyMs,
      hasQuestion: !!state.generated_question,
      error: state.error,
    });

    if (state.error) {
      throw new Error(state.error);
    }

    // Map snake_case to camelCase
    const question = state.generated_question;
    return {
      question: {
        title: question.title,
        description: question.description,
        requirements: question.requirements,
        estimatedTime: question.estimated_time,
        starterCode: question.starter_code,
        difficulty: question.difficulty,
        difficultyAssessment: question.difficulty_assessment,
      },
      abilityEstimate: state.irt_ability_estimate ? {
        theta: state.irt_ability_estimate.theta,
        standardError: state.irt_ability_estimate.standard_error,
        reliability: state.irt_ability_estimate.reliability,
        questionsUsed: state.irt_ability_estimate.questions_used,
      } : null,
      difficultyTargeting: state.irt_difficulty_targeting ? {
        targetDifficulty: state.irt_difficulty_targeting.target_difficulty,
        reasoning: state.irt_difficulty_targeting.reasoning,
      } : null,
      strategy: state.generation_strategy,
    };
  } catch (error) {
    logger.error('[Questions] LangGraph question generation failed', error as Error);
    throw error;
  }
}

/**
 * Generate question with backend selection
 */
async function generateIncrementalQuestion(params: {
  sessionId: string;
  candidateId: string;
  seedId: string;
  seniority: string;
  previousQuestions: any[];
  previousPerformance: any[];
  timeRemaining: number;
  assessmentType?: string;
  organizationId?: string;
  assessmentId?: string;
  role?: string;
  techStack?: string[];
  questionNumber: number;
}): Promise<any> {
  // Get backend assignment
  const backendResult = await questionAssignmentService.getBackendForSession({
    sessionId: params.sessionId,
    candidateId: params.candidateId,
    organizationId: params.organizationId,
    assessmentId: params.assessmentId,
    seniority: params.seniority,
    role: params.role || 'backend',
    assessmentType: params.assessmentType || 'REAL_WORLD',
  });

  logger.info('[Questions] Backend selected for incremental question', {
    candidateId: params.candidateId,
    backend: backendResult.backend,
    source: backendResult.source,
  });

  if (backendResult.backend === 'langgraph') {
    try {
      return await generateQuestionWithLangGraph({
        sessionId: params.sessionId,
        candidateId: params.candidateId,
        seedId: params.seedId,
        role: params.role || 'backend',
        seniority: params.seniority,
        assessmentType: params.assessmentType || 'REAL_WORLD',
        techStack: params.techStack || [],
        organizationId: params.organizationId,
        previousQuestions: params.previousQuestions,
        previousPerformance: params.previousPerformance,
        timeRemaining: params.timeRemaining,
        questionNumber: params.questionNumber,
      });
    } catch (error) {
      logger.warn('[Questions] LangGraph failed, falling back to TypeScript', {
        candidateId: params.candidateId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fallback to TypeScript
    }
  }

  // TypeScript IRT engine
  return generateIncrementalQuestionTypeScript({
    candidateId: params.candidateId,
    seedId: params.seedId,
    seniority: params.seniority,
    previousQuestions: params.previousQuestions,
    previousPerformance: params.previousPerformance,
    timeRemaining: params.timeRemaining,
    assessmentType: params.assessmentType,
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

      // Emit question.start event for session replay
      const sessionRecording = await prisma.sessionRecording.findUnique({
        where: { candidateId: id },
      });

      if (sessionRecording) {
        await sessions.recordEvent(
          sessionRecording.id,
          "question.start",
          "SYSTEM",
          {
            questionId: currentQuestion.id,
            title: currentQuestion.title,
            difficulty: currentQuestion.difficulty,
            order: currentQuestion.order,
            questionNumber: candidate.generatedQuestions.indexOf(currentQuestion) + 1,
          },
          { questionIndex: currentQuestion.order, checkpoint: true }
        );

        logger.info('[Questions GET] Emitted question.start event', {
          sessionId: sessionRecording.id,
          questionId: currentQuestion.id,
          questionIndex: currentQuestion.order,
        });
      }
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

    // IMPORTANT: Validate that evaluation agent approved before generating next question
    // This prevents gaming the system by skipping evaluation
    if (previousPerformance) {
      // Get session recording to find evaluation events
      const sessionRecording = await prisma.sessionRecording.findUnique({
        where: { candidateId: id },
        select: { id: true },
      });

      if (sessionRecording) {
        // Find the most recent evaluation event for the previous question
        // Check for both fast_progression (live evaluation) and complete (comprehensive evaluation)
        const evaluationEvent = await prisma.sessionEventLog.findFirst({
          where: {
            sessionId: sessionRecording.id,
            eventType: {
              in: ["evaluation.complete", "evaluation.fast_progression"],
            },
          },
          orderBy: { sequenceNumber: "desc" },
        });

        if (!evaluationEvent) {
          logger.warn("[Questions POST] No evaluation found for previous question", {
            candidateId: id,
            questionId: previousPerformance.questionId,
          });
          throw new ValidationError(
            "Cannot proceed to next question: No evaluation found. Please run evaluation first."
          );
        }

        // Check if evaluation passed
        const evalData = evaluationEvent.data as { questionId?: string; passed?: boolean };

        // Verify evaluation is for the correct question
        if (evalData.questionId !== previousPerformance.questionId) {
          logger.warn("[Questions POST] Evaluation question mismatch", {
            candidateId: id,
            expectedQuestionId: previousPerformance.questionId,
            evalQuestionId: evalData.questionId,
          });
          throw new ValidationError(
            "Cannot proceed: Most recent evaluation is not for the current question. Please re-evaluate."
          );
        }

        if (!evalData.passed) {
          logger.info("[Questions POST] Evaluation did not pass", {
            candidateId: id,
            questionId: previousPerformance.questionId,
          });
          throw new ValidationError(
            "Cannot proceed to next question: Evaluation did not pass. Please improve your solution and re-evaluate."
          );
        }

        logger.info("[Questions POST] Evaluation validation passed", {
          candidateId: id,
          questionId: previousPerformance.questionId,
        });
      }
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
      logger.info(`[Questions POST] Using IRT-enhanced incremental generator`, {
        candidateId: id,
        seedId,
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

      // Get session recording for session ID
      const sessionRecording = await prisma.sessionRecording.findUnique({
        where: { candidateId: id },
        select: { id: true },
      });

      // Generate incremental question with backend selection (TypeScript or LangGraph)
      irtResult = await generateIncrementalQuestion({
        sessionId: sessionRecording?.id || id,
        candidateId: id,
        seedId: seedId!,
        seniority: candidate.assessment.seniority.toLowerCase(),
        previousQuestions: candidate.generatedQuestions,
        previousPerformance: performanceMetrics,
        timeRemaining,
        assessmentType: candidate.assessment.assessmentType,
        organizationId: candidate.organizationId,
        assessmentId: candidate.assessmentId,
        role: candidate.assessment.role,
        techStack: candidate.assessment.techStack || [],
        questionNumber: candidate.generatedQuestions.length + 1,
      });

      newQuestion = irtResult.question;

      // Log IRT decision
      logger.info('[Questions POST] IRT decision', {
        candidateId: id,
        abilityEstimate: irtResult.abilityEstimate?.theta?.toFixed(2) ?? 'N/A',
        targetDifficulty: irtResult.difficultyTargeting?.targetDifficulty?.toFixed(2) ?? 'N/A',
        shouldContinue: irtResult.shouldContinue?.continue ?? true,
        reason: irtResult.shouldContinue?.reason ?? 'unknown',
      });
    } else {
      // Use TypeScript LLM generator for dynamic question generation
      logger.info('[Questions POST] Using TypeScript dynamic question generator', { candidateId: id });

      const nextQuestionOrder = candidate.generatedQuestions.length;
      const techStack = candidate.assessment.techStack || ['TypeScript'];

      const difficulty = determineNextDifficulty(
        candidate.generatedQuestions,
        previousPerformance
      );

      const generatedProblem = await generateProblemWithLLM(
        candidate.assessment.role,
        candidate.assessment.seniority,
        difficulty,
        candidate.generatedQuestions,
        techStack,
        nextQuestionOrder + 1
      );

      // Normalize difficulty to expected enum value
      const normalizedDifficulty = (
        typeof generatedProblem.difficulty === 'string'
          ? generatedProblem.difficulty.toUpperCase()
          : 'MEDIUM'
      ) as "EASY" | "MEDIUM" | "HARD";

      // Save generated question
      newQuestion = await prisma.generatedQuestion.create({
        data: {
          candidateId: id,
          order: nextQuestionOrder,
          title: generatedProblem.title,
          description: generatedProblem.description,
          difficulty: normalizedDifficulty,
          language: generatedProblem.language,
          requirements: generatedProblem.requirements,
          estimatedTime: generatedProblem.estimatedTime,
          starterCode: generatedProblem.starterCode as any,
          testCases: generatedProblem.testCases as any,
          status: "PENDING",
        },
      });

      // Link to parent question if this isn't the first question
      if (candidate.generatedQuestions.length > 0) {
        const parentQuestion = candidate.generatedQuestions[candidate.generatedQuestions.length - 1];
        await prisma.generatedQuestion.update({
          where: { id: newQuestion.id },
          data: { parentQuestionId: parentQuestion.id },
        });
        logger.debug('[Questions POST] Linked question to parent', {
          questionId: newQuestion.id,
          parentId: parentQuestion.id,
        });
      }
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
 * Determine the primary programming language from tech stack
 */
function determineLanguage(techStack: string[]): "python" | "go" | "typescript" | "javascript" {
  const lowerStack = techStack.map(t => t.toLowerCase());

  if (lowerStack.some(t => ['python', 'fastapi', 'django', 'flask', 'pytest'].includes(t))) {
    return 'python';
  }
  if (lowerStack.some(t => ['go', 'golang', 'gin', 'echo'].includes(t))) {
    return 'go';
  }
  if (lowerStack.some(t => ['typescript', 'nestjs', 'ts-node'].includes(t))) {
    return 'typescript';
  }
  return 'javascript';
}

/**
 * Get complexity additions based on difficulty level
 */
function getComplexityAdditions(difficulty: "EASY" | "MEDIUM" | "HARD"): string {
  const additions: Record<string, string> = {
    EASY: 'input validation, error handling, basic data transformations',
    MEDIUM: 'async operations, database integration, caching, API design',
    HARD: 'concurrent processing, optimization, system integration, complex business logic',
  };
  return additions[difficulty] || additions.MEDIUM;
}

/**
 * Generate problem using LLM
 * Uses Haiku by default for ~3x faster generation (10-15s vs 50-60s with Sonnet)
 */
async function generateProblemWithLLM(
  role: string,
  seniority: string,
  difficulty: "EASY" | "MEDIUM" | "HARD",
  previousQuestions: any[],
  techStack: string[],
  questionNumber: number
): Promise<Omit<GeneratedProblem, "id" | "generatedAt" | "generatedBy" | "seedId">> {
  const startTime = Date.now();
  const language = determineLanguage(techStack);
  const techStackStr = techStack.length > 0 ? techStack.join(', ') : 'TypeScript';

  // Build previous questions context
  let previousContext = '';
  if (previousQuestions.length > 0) {
    const questionSummaries = previousQuestions.map((q, i) => {
      const desc = q.description?.substring(0, 300) || '';
      const reqs = Array.isArray(q.requirements) ? q.requirements.slice(0, 3).join(', ') : '';
      return `Question ${i + 1}: ${q.title}
Description: ${desc}${desc.length >= 300 ? '...' : ''}
Key Requirements: ${reqs}`;
    }).join('\n\n');

    previousContext = `
### Previous Questions (BUILD ON THIS WORK):
${questionSummaries}

IMPORTANT: The new question MUST:
- BUILD directly on the candidate's previous work
- Extend the existing codebase (don't start fresh)
- Add new complexity to the same domain/problem
- Reference concepts from previous questions
- Use the same entities, APIs, or data models where appropriate`;
  }

  const prompt = `Generate a coding problem for a ${seniority} ${role} developer.

## Tech Stack Requirements
Use these technologies: ${techStackStr}
Primary language: ${language}

## Question Context
This is question #${questionNumber} in a progressive assessment.
${previousContext}

## Difficulty Progression
- Difficulty: ${difficulty}
- Question ${questionNumber} should be ${questionNumber > 1 ? 'more challenging than the previous, building on existing work' : 'foundational - establish the core domain and entities'}
${questionNumber > 1 ? `- Add complexity through: ${getComplexityAdditions(difficulty)}` : ''}

## Output Format
Return a JSON object with this structure:
{
  "title": "${questionNumber > 1 ? 'Problem title that relates to previous work' : 'Problem title'}",
  "description": "${questionNumber > 1 ? 'Description that REFERENCES and extends the previous question context' : 'Detailed problem description with examples'}",
  "requirements": ["Requirement 1", "Requirement 2"],
  "difficulty": "${difficulty.toLowerCase()}",
  "estimatedTime": ${difficulty === "EASY" ? 20 : difficulty === "MEDIUM" ? 30 : 45},
  "language": "${language}",
  "starterCode": [
    {
      "fileName": "solution.${language === 'python' ? 'py' : language === 'go' ? 'go' : 'ts'}",
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
    logger.info('[Questions] Starting LLM question generation', {
      model: QUESTION_GEN_MODEL,
      questionNumber,
      difficulty,
    });

    const message = await anthropic.messages.create({
      model: QUESTION_GEN_MODEL,
      max_tokens: 8192, // Increased to avoid truncation (max 16000)
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const llmLatency = Date.now() - startTime;
    logger.info('[Questions] LLM question generation complete', {
      model: QUESTION_GEN_MODEL,
      latencyMs: llmLatency,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    });

    const content = message.content[0];
    if (content.type === "text") {
      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          // Use repair function to handle malformed JSON from LLM
          const problem = repairAndParseJson<Omit<GeneratedProblem, "id" | "generatedAt" | "generatedBy" | "seedId">>(jsonMatch[0]);
          return problem;
        } catch (parseError) {
          // Log the raw response for debugging
          logger.error('[Questions] JSON parse/repair failed', parseError as Error, {
            rawResponseLength: content.text.length,
            jsonMatchLength: jsonMatch[0].length,
            rawResponsePreview: content.text.substring(0, 1000),
            stopReason: message.stop_reason,
          });
          throw parseError;
        }
      }
    }

    throw new Error("Failed to extract JSON from LLM response - no JSON object found");
  } catch (error) {
    logger.error("LLM generation error", error as Error, {
      role,
      seniority,
      difficulty,
      model: QUESTION_GEN_MODEL,
    });
    throw error;
  }
}
