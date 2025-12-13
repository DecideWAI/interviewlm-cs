import { NextRequest } from "next/server";
import { z } from "zod";
import { Client } from "@langchain/langgraph-sdk";
import { v5 as uuidv5 } from "uuid";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { strictRateLimit } from "@/lib/middleware/rate-limit";
import { createQuestionEvaluationAgent, EvaluationResult as AgentEvaluationResult } from "@/lib/agents/question-evaluation-agent";
// Note: modalService is no longer used here - the agent discovers code via tools

// LangGraph SDK configuration
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || "http://localhost:2024";
const USE_LANGGRAPH_AGENT = process.env.USE_LANGGRAPH_AGENT === "true"; // Default false - use TypeScript agent

// Initialize LangGraph SDK client
const langGraphClient = new Client({ apiUrl: LANGGRAPH_API_URL });

// Namespace UUID for generating deterministic thread IDs
const LANGGRAPH_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// Request validation schema - code is now optional, will fetch from sandbox if empty
const evaluateRequestSchema = z.object({
  code: z.string().optional(),
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

// LangGraph evaluation response type (from agent state)
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
 * Generate a deterministic UUID from session ID and agent type
 */
function generateThreadUUID(sessionId: string, agentType: string): string {
  const input = `${agentType}:${sessionId}`;
  return uuidv5(input, LANGGRAPH_NAMESPACE);
}

/**
 * Get or create a LangGraph thread for evaluation
 */
async function getOrCreateEvaluationThread(sessionId: string, questionId: string): Promise<string> {
  // Use question-specific thread ID to keep evaluations isolated
  const threadId = generateThreadUUID(`${sessionId}:${questionId}`, "question_evaluation_agent");

  try {
    const thread = await langGraphClient.threads.get(threadId);
    if (thread) {
      return threadId;
    }
  } catch {
    // Thread doesn't exist, create it
  }

  try {
    await langGraphClient.threads.create({
      threadId,
      metadata: { sessionId, questionId, agentType: "question_evaluation_agent" },
    });
    logger.debug("[Evaluate] Created LangGraph thread", { threadId, sessionId, questionId });
    return threadId;
  } catch {
    // Thread may already exist (race condition)
    return threadId;
  }
}

/**
 * Call the LangGraph Question Evaluation Agent via SDK
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
  const threadId = await getOrCreateEvaluationThread(params.sessionId, params.questionId);

  logger.debug("[Evaluate] Running LangGraph question_evaluation_agent", {
    threadId,
    sessionId: params.sessionId,
    questionId: params.questionId,
  });

  // Build the evaluation prompt message
  // For LangGraph, ALWAYS use tool discovery to explore the full workspace
  // This handles multi-file projects properly instead of just evaluating one file
  const evaluationPrompt = buildEvaluationPrompt({
    ...params,
    useToolDiscovery: true, // Force agent to use tools to discover ALL code files
  });

  // Run the agent and wait for completion
  const result = await langGraphClient.runs.wait(threadId, "question_evaluation_agent", {
    input: {
      messages: [{ role: "user", content: evaluationPrompt }],
      session_id: params.sessionId,
      candidate_id: params.candidateId,
      question_id: params.questionId,
      question_title: params.questionTitle,
      question_description: params.questionDescription,
      question_requirements: params.questionRequirements,
      question_difficulty: params.questionDifficulty,
      code: params.code || null,
      language: params.language,
      file_name: params.fileName || null,
      passing_threshold: params.passingThreshold,
    },
    config: {
      configurable: {
        session_id: params.sessionId,
        candidate_id: params.candidateId,
        question_id: params.questionId,
      },
    },
  });

  // Extract evaluation result from agent state
  const state = result as Record<string, unknown>;
  let evaluationResult = state.evaluation_result as Record<string, unknown> | null;

  // If evaluation_result not set, extract from messages (create_agent only populates messages)
  if (!evaluationResult) {
    const messages = state.messages as Array<{ type?: string; content?: string | Array<{ type: string; text?: string }> }> | undefined;
    if (messages && messages.length > 0) {
      // Find the last AI message
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.type === 'ai' || (msg as any).role === 'assistant') {
          let responseText = '';
          if (typeof msg.content === 'string') {
            responseText = msg.content;
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                responseText = block.text;
                break;
              }
            }
          }

          // Parse JSON from response
          if (responseText) {
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/);
            const jsonText = jsonMatch ? jsonMatch[1] : responseText;
            try {
              const parsed = JSON.parse(jsonText.trim());
              // Convert to expected format
              evaluationResult = {
                overall_score: parsed.overallScore ?? 0,
                passed: parsed.overallScore >= params.passingThreshold,
                criteria: parsed.criteria,
                feedback: parsed.feedback ?? '',
                strengths: parsed.strengths ?? [],
                improvements: parsed.improvements ?? [],
              };
              logger.debug("[Evaluate] Extracted evaluation from messages", { overallScore: parsed.overallScore });
              break;
            } catch (e) {
              logger.warn("[Evaluate] Failed to parse evaluation JSON from message", { error: e });
            }
          }
        }
      }
    }
  }

  if (!evaluationResult) {
    throw new Error("LangGraph agent did not return evaluation result");
  }

  // Map snake_case response to camelCase
  const criteria = evaluationResult.criteria as Record<string, { score: number; feedback: string }> | undefined;

  return {
    overallScore: (evaluationResult.overall_score as number) ?? 0,
    passed: (evaluationResult.passed as boolean) ?? false,
    criteria: {
      problemCompletion: {
        score: criteria?.problem_completion?.score ?? 0,
        maxScore: 20,
        feedback: criteria?.problem_completion?.feedback ?? "",
      },
      codeQuality: {
        score: criteria?.code_quality?.score ?? 0,
        maxScore: 20,
        feedback: criteria?.code_quality?.feedback ?? "",
      },
      bestPractices: {
        score: criteria?.best_practices?.score ?? 0,
        maxScore: 20,
        feedback: criteria?.best_practices?.feedback ?? "",
      },
      errorHandling: {
        score: criteria?.error_handling?.score ?? 0,
        maxScore: 20,
        feedback: criteria?.error_handling?.feedback ?? "",
      },
      efficiency: {
        score: criteria?.efficiency?.score ?? 0,
        maxScore: 20,
        feedback: criteria?.efficiency?.feedback ?? "",
      },
    },
    feedback: (evaluationResult.feedback as string) ?? "Evaluation completed",
    strengths: (evaluationResult.strengths as string[]) ?? [],
    improvements: (evaluationResult.improvements as string[]) ?? [],
  };
}

/**
 * Build the evaluation prompt for the agent
 *
 * @param useToolDiscovery - If true, always use tools to discover code (for multi-file projects)
 */
function buildEvaluationPrompt(params: {
  questionTitle: string;
  questionDescription: string;
  questionRequirements: string[] | null;
  questionDifficulty: string;
  code: string;
  language: string;
  fileName?: string;
  passingThreshold: number;
  useToolDiscovery?: boolean;
}): string {
  let prompt = `Please evaluate the following code submission for the interview question.

## Question: ${params.questionTitle}

**Difficulty:** ${params.questionDifficulty}

**Description:**
${params.questionDescription}
`;

  if (params.questionRequirements && params.questionRequirements.length > 0) {
    prompt += `
**Requirements:**
${params.questionRequirements.map((r) => `- ${r}`).join("\n")}
`;
  }

  prompt += `
**Passing Threshold:** ${params.passingThreshold}/100
`;

  // For LangGraph agent mode, always use tool discovery to explore the full workspace
  // This handles multi-file projects properly instead of just evaluating one file
  const shouldUseToolDiscovery = params.useToolDiscovery || false;
  const hasValidCode = params.code && params.code.trim() && !params.code.includes("# ") && !params.code.startsWith("##");

  if (!shouldUseToolDiscovery && hasValidCode) {
    prompt += `
## Candidate's Code (${params.language}${params.fileName ? `, ${params.fileName}` : ""}):

\`\`\`${params.language}
${params.code}
\`\`\`
`;
  } else {
    prompt += `
## Code Location
The candidate's code is in the Modal sandbox at /workspace/.

**IMPORTANT:** You MUST use the available tools to discover and evaluate ALL code files:
1. Use \`list_files\` to explore /workspace/ and find ALL source files
2. Use \`read_file\` to read each code file (look for .py, .js, .ts, .go files)
3. Use \`run_tests\` to verify the solution works
4. Evaluate ALL the code files together, not just one

**Language:** ${params.language}
**Note:** There may be multiple source files. Evaluate the complete solution.
`;
  }

  prompt += `
Please evaluate the code on all 5 criteria (20 points each) and call submit_question_evaluation with your results.`;

  return prompt;
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

  let { code, language, questionId, fileName } = validationResult.data;

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

  // Code is now optional - agent can discover it via tools from the Modal sandbox
  // If code is provided (from request body), it will be included in the prompt
  // If not provided, the agent will use ListFiles + Read tools to discover it
  if (!code || code.trim() === "") {
    logger.info("[Evaluate] Code not provided in request, agent will discover via tools", {
      candidateId: id,
      fileName,
      language,
    });
    // Set code to empty string - agent will use tools to read from sandbox
    code = "";
  } else {
    logger.info("[Evaluate] Code provided in request", {
      candidateId: id,
      codeLength: code.length,
    });
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
      // Debug: Log the code being sent to LangGraph
      logger.debug("[Evaluate] Code being sent to LangGraph", {
        codeLength: code.length,
        codePreview: code.slice(0, 300),
      });

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

  // Get next sequence number for events
  const lastEvent = await prisma.sessionEventLog.findFirst({
    where: { sessionId: sessionRecording.id },
    orderBy: { sequenceNumber: 'desc' },
    select: { sequenceNumber: true },
  });
  let nextSeq = (lastEvent?.sequenceNumber ?? BigInt(-1)) + BigInt(1);

  // Record code snapshot event
  await prisma.sessionEventLog.create({
    data: {
      sessionId: sessionRecording.id,
      sequenceNumber: nextSeq++,
      timestamp: new Date(),
      eventType: "code.snapshot",
      category: "code",
      filePath: fileName || "main",
      data: {
        fileName: fileName || "main",
        language,
        contentHash: hashCode(code),
        fullContent: code,
      },
      checkpoint: false,
    },
  });

  // Record evaluation event
  await prisma.sessionEventLog.create({
    data: {
      sessionId: sessionRecording.id,
      sequenceNumber: nextSeq++,
      timestamp: new Date(),
      eventType: "evaluation.complete",
      category: "evaluation",
      data: {
        questionId,
        overallScore: aiResult.overallScore,
        passed,
        criteria: aiResult.criteria,
        evaluationTime,
        timestamp: new Date().toISOString(),
      },
      checkpoint: false,
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
