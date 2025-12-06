import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { strictRateLimit } from "@/lib/middleware/rate-limit";
import { createQuestionEvaluationAgent, EvaluationResult as AgentEvaluationResult } from "@/lib/agents/question-evaluation-agent";

// LangGraph API configuration (for separate testing)
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || "http://localhost:8080";
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY || "";
const USE_LANGGRAPH_AGENT = process.env.USE_LANGGRAPH_AGENT === "true"; // Default false - use TypeScript agent

// Request validation schema
const evaluateRequestSchema = z.object({
  code: z.string().min(1, "Code is required"),
  language: z.enum(["javascript", "typescript", "python", "go", "node.js"], {
    errorMap: () => ({ message: "Unsupported language" }),
  }),
  questionId: z.string().min(1, "Question ID is required"),
  fileName: z.string().optional(),
});

// Response types
interface EvaluationCriterion {
  score: number;
  maxScore: number;
  feedback: string;
}

// Criteria structure varies by assessment type
type EvaluationCriteria = Record<string, EvaluationCriterion>;

interface EvaluationResult {
  overallScore: number;
  passed: boolean;
  assessmentType?: string;
  criteria: EvaluationCriteria;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

// LangGraph API response type
interface LangGraphEvaluationResponse {
  overallScore: number;
  passed: boolean;
  criteria: {
    problemCompletion: { score: number; maxScore: number; feedback: string };
    codeQuality: { score: number; maxScore: number; feedback: string };
    bestPractices: { score: number; maxScore: number; feedback: string };
    errorHandling: { score: number; maxScore: number; feedback: string };
    efficiency: { score: number; maxScore: number; feedback: string };
  };
  feedback: string;
  strengths: string[];
  improvements: string[];
}

/**
 * Call the LangGraph Question Evaluation Agent
 */
async function evaluateWithLangGraph(params: {
  sessionId: string;
  candidateId: string;
  questionId: string;
  questionTitle: string;
  questionDescription: string;
  questionDifficulty: string;
  questionRequirements: string[] | null;
  code: string;
  language: string;
  fileName?: string;
  passingThreshold: number;
}): Promise<LangGraphEvaluationResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (LANGGRAPH_API_KEY) {
    headers["Authorization"] = `Bearer ${LANGGRAPH_API_KEY}`;
  }

  const response = await fetch(`${LANGGRAPH_API_URL}/api/question-evaluation/evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: params.sessionId,
      candidate_id: params.candidateId,
      question_id: params.questionId,
      question_title: params.questionTitle,
      question_description: params.questionDescription,
      question_difficulty: params.questionDifficulty,
      question_requirements: params.questionRequirements,
      code: params.code,
      language: params.language,
      file_name: params.fileName,
      passing_threshold: params.passingThreshold,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Evaluate using the TypeScript QuestionEvaluationAgent (default)
 * Always uses agent mode with tools to gather context
 */
async function evaluateWithTypeScriptAgent(params: {
  sessionId: string;
  candidateId: string;
  questionId: string;
  questionTitle: string;
  questionDescription: string;
  questionDifficulty: string;
  questionRequirements: string[] | null;
  code: string;
  language: string;
  fileName?: string;
  passingThreshold: number;
}): Promise<AgentEvaluationResult> {
  const agent = createQuestionEvaluationAgent({
    sessionId: params.sessionId,
    candidateId: params.candidateId,
    questionId: params.questionId,
    questionTitle: params.questionTitle,
    questionDescription: params.questionDescription,
    questionDifficulty: params.questionDifficulty,
    questionRequirements: params.questionRequirements,
    code: params.code,
    language: params.language,
    fileName: params.fileName,
    passingThreshold: params.passingThreshold,
  });

  return agent.evaluate();
}

/**
 * POST /api/interview/[id]/evaluate
 * Holistic AI evaluation of candidate's code solution
 * Evaluates on 5 criteria (20 points each = 100 total)
 *
 * Uses TypeScript QuestionEvaluationAgent by default.
 * Set USE_LANGGRAPH_AGENT=true to use the LangGraph Python agent.
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  // Apply strict rate limiting (expensive AI operation)
  const rateLimited = await strictRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  // Parse and validate request body
  const body = await request.json();
  logger.debug("[Evaluate] Request received", { candidateId: id, language: body.language });

  const validationResult = evaluateRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw new ValidationError(
      "Invalid request: " + validationResult.error.errors.map(e => e.message).join(", ")
    );
  }

  const { code, language, questionId, fileName } = validationResult.data;

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
      sessionRecording: true,
    },
  });

  if (!candidate) {
    throw new NotFoundError("Interview session", id);
  }

  // Check authorization
  const isOrgMember = candidate.organization.members.length > 0;
  const isSelfInterview = candidate.email === session.user.email;

  if (!isOrgMember && !isSelfInterview) {
    throw new AuthorizationError("Access denied to this interview session");
  }

  // Fetch question details
  const questionDetails = await prisma.generatedQuestion.findUnique({
    where: { id: questionId },
    select: {
      title: true,
      description: true,
      requirements: true,
      difficulty: true,
    },
  });

  if (!questionDetails) {
    throw new NotFoundError("Question", questionId);
  }

  // Get or create session recording
  let sessionRecording = candidate.sessionRecording;
  if (!sessionRecording) {
    sessionRecording = await prisma.sessionRecording.create({
      data: {
        candidateId: id,
        status: "ACTIVE",
      },
    });
  }

  // Get passing threshold from assessment settings (default 70)
  const assessment = await prisma.assessment.findFirst({
    where: {
      candidates: { some: { id } }
    },
    select: {
      evaluationThreshold: true,
    }
  });
  const passingThreshold = assessment?.evaluationThreshold ?? 70;

  logger.info("[Evaluate] Starting AI evaluation", {
    candidateId: id,
    questionTitle: questionDetails.title,
    language,
    passingThreshold,
    useLangGraph: USE_LANGGRAPH_AGENT,
  });

  const evaluationStart = Date.now();

  let aiResult: {
    overallScore: number;
    passed: boolean;
    criteria: Record<string, { score: number; maxScore?: number; feedback: string }>;
    feedback: string;
    strengths: string[];
    improvements: string[];
  };

  // Use TypeScript QuestionEvaluationAgent by default
  // Set USE_LANGGRAPH_AGENT=true to test the LangGraph Python agent
  if (USE_LANGGRAPH_AGENT) {
    try {
      logger.debug("[Evaluate] Calling LangGraph Question Evaluation Agent");

      const langGraphResult = await evaluateWithLangGraph({
        sessionId: id,
        candidateId: id,
        questionId,
        questionTitle: questionDetails.title,
        questionDescription: questionDetails.description,
        questionDifficulty: questionDetails.difficulty,
        questionRequirements: questionDetails.requirements,
        code,
        language,
        fileName,
        passingThreshold,
      });

      // Debug: log what criteria the LangGraph agent returned
      logger.debug("[Evaluate] LangGraph response criteria keys", {
        hasResult: !!langGraphResult,
        hasCriteria: !!langGraphResult?.criteria,
        criteriaKeys: langGraphResult?.criteria ? Object.keys(langGraphResult.criteria) : [],
      });

      // Helper to safely get criterion with defaults for missing values
      const getCriterion = (name: string) => {
        const criterion = langGraphResult.criteria?.[name as keyof typeof langGraphResult.criteria];
        return {
          score: criterion?.score ?? 0,
          feedback: criterion?.feedback ?? `${name} evaluation not available`,
        };
      };

      aiResult = {
        overallScore: langGraphResult.overallScore ?? 0,
        passed: langGraphResult.passed ?? false,
        criteria: {
          problemCompletion: getCriterion('problemCompletion'),
          codeQuality: getCriterion('codeQuality'),
          bestPractices: getCriterion('bestPractices'),
          errorHandling: getCriterion('errorHandling'),
          efficiency: getCriterion('efficiency'),
        },
        feedback: langGraphResult.feedback ?? 'Evaluation completed',
        strengths: langGraphResult.strengths ?? [],
        improvements: langGraphResult.improvements ?? [],
      };

      logger.info("[Evaluate] LangGraph evaluation successful", {
        overallScore: aiResult.overallScore,
        passed: aiResult.passed,
      });
    } catch (langGraphError) {
      logger.warn("[Evaluate] LangGraph unavailable, falling back to TypeScript agent", {
        error: String(langGraphError),
      });

      // Fallback to TypeScript QuestionEvaluationAgent
      const tsAgentResult = await evaluateWithTypeScriptAgent({
        sessionId: id,
        candidateId: id,
        questionId,
        questionTitle: questionDetails.title,
        questionDescription: questionDetails.description,
        questionDifficulty: questionDetails.difficulty,
        questionRequirements: questionDetails.requirements,
        code,
        language,
        fileName,
        passingThreshold,
      });

      // Use agent result directly - criteria structure matches assessment type
      // Cast to generic Record since criteria keys vary by assessment type
      aiResult = {
        overallScore: tsAgentResult.overallScore,
        passed: tsAgentResult.passed,
        criteria: tsAgentResult.criteria as unknown as Record<string, { score: number; maxScore?: number; feedback: string }>,
        feedback: tsAgentResult.feedback,
        strengths: tsAgentResult.strengths,
        improvements: tsAgentResult.improvements,
      };
    }
  } else {
    // Default: Use TypeScript QuestionEvaluationAgent
    logger.debug("[Evaluate] Using TypeScript QuestionEvaluationAgent");

    const tsAgentResult = await evaluateWithTypeScriptAgent({
      sessionId: id,
      candidateId: id,
      questionId,
      questionTitle: questionDetails.title,
      questionDescription: questionDetails.description,
      questionDifficulty: questionDetails.difficulty,
      questionRequirements: questionDetails.requirements,
      code,
      language,
      fileName,
      passingThreshold,
    });

    // Use agent result directly - criteria structure matches assessment type
    // Cast to generic Record since criteria keys vary by assessment type
    aiResult = {
      overallScore: tsAgentResult.overallScore,
      passed: tsAgentResult.passed,
      criteria: tsAgentResult.criteria as unknown as Record<string, { score: number; maxScore?: number; feedback: string }>,
      feedback: tsAgentResult.feedback,
      strengths: tsAgentResult.strengths,
      improvements: tsAgentResult.improvements,
    };

    logger.info("[Evaluate] TypeScript agent evaluation successful", {
      overallScore: aiResult.overallScore,
      passed: aiResult.passed,
    });
  }

  // Calculate evaluation time and pass/fail
  const evaluationTime = Date.now() - evaluationStart;
  const passed = aiResult.passed ?? aiResult.overallScore >= passingThreshold;

  logger.info("[Evaluate] Evaluation completed", {
    candidateId: id,
    overallScore: aiResult.overallScore,
    passed,
    passingThreshold,
    evaluationTime,
  });

  // Record code snapshot
  await prisma.codeSnapshot.create({
    data: {
      sessionId: sessionRecording.id,
      fileId: fileName || "main",
      fileName: fileName || "main",
      language,
      contentHash: hashCode(code),
      fullContent: code,
    },
  });

  // Record evaluation event
  await prisma.sessionEvent.create({
    data: {
      sessionId: sessionRecording.id,
      type: "evaluation",
      data: {
        questionId,
        overallScore: aiResult.overallScore,
        passed,
        criteria: aiResult.criteria,
        evaluationTime,
        timestamp: new Date().toISOString(),
      },
    },
  });

  // Format response - map criteria with proper maxScore values
  // Criteria keys vary by assessment type, so we iterate dynamically
  const formattedCriteria: EvaluationCriteria = {};

  if (aiResult.criteria) {
    for (const [key, value] of Object.entries(aiResult.criteria)) {
      if (value && typeof value === 'object') {
        formattedCriteria[key] = {
          score: value.score ?? 0,
          maxScore: value.maxScore ?? 20,
          feedback: value.feedback ?? '',
        };
      }
    }
  }

  const result: EvaluationResult = {
    overallScore: aiResult.overallScore,
    passed,
    assessmentType: (aiResult as { assessmentType?: string }).assessmentType,
    criteria: formattedCriteria,
    feedback: aiResult.feedback,
    strengths: aiResult.strengths || [],
    improvements: aiResult.improvements || [],
  };

  return success(result);
});

/**
 * Simple hash function for code content
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
