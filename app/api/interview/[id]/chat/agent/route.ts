import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { publishAIInteraction } from "@/lib/queues";
import { createCodingAgent } from "@/lib/agents/coding-agent";
import type { HelpfulnessLevel } from "@/lib/types/agent";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

// Request validation schema
const chatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  codeContext: z
    .object({
      fileName: z.string().optional(),
      content: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
  helpfulnessLevel: z.enum(["consultant", "pair-programming", "full-copilot"]).optional(),
});

/**
 * POST /api/interview/[id]/chat/agent
 * Claude chat using CodingAgent with real tool use (file operations, bash, etc.)
 *
 * This endpoint provides full agent capabilities including:
 * - Real file operations (read, write, edit)
 * - Code search (grep, glob)
 * - Bash command execution (sandboxed)
 * - Adaptive helpfulness levels
 */
export const POST = withErrorHandling(
  async (
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

    try {
      // Parse and validate request body
      const body = await request.json();
      const validationResult = chatRequestSchema.safeParse(body);

      if (!validationResult.success) {
        throw new ValidationError(
          `Invalid request: ${validationResult.error.errors.map(e => e.message).join(", ")}`
        );
      }

      const { message, codeContext, helpfulnessLevel } = validationResult.data;

      logger.debug('[Chat Agent] Request received', {
        candidateId: id,
        hasCodeContext: !!codeContext,
        helpfulnessLevel: helpfulnessLevel || 'pair-programming',
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
          sessionRecording: true,
        },
      });

      if (!candidate) {
        throw new NotFoundError("Interview session");
      }

      // Check authorization (user must be member of candidate's organization)
      // OR candidate is interviewing themselves (candidate.email === session.user.email)
      const isOrgMember = candidate.organization.members.length > 0;
      const isSelfInterview = candidate.email === session.user.email;

      if (!isOrgMember && !isSelfInterview) {
        throw new AuthorizationError("You do not have access to this interview session");
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
        logger.info('[Chat Agent] Created new session recording', {
          candidateId: id,
          sessionId: sessionRecording.id,
        });
      }

      // Get current question for problem statement
      const currentQuestion = await prisma.generatedQuestion.findFirst({
        where: {
          candidateId: id,
          status: "IN_PROGRESS",
        },
      });

      // Build problem statement from current question
      let problemStatement: string | undefined;
      if (currentQuestion) {
        problemStatement = `${currentQuestion.title}\n\n${currentQuestion.description}`;
        logger.debug('[Chat Agent] Found current question', {
          questionId: currentQuestion.id,
          questionTitle: currentQuestion.title,
        });
      }

      // Enhance message with code context if provided
      let enhancedMessage = message;
      if (codeContext?.content) {
        enhancedMessage = `I'm working on the file "${codeContext.fileName || "untitled"}" (${codeContext.language || "unknown"}):\n\n\`\`\`${codeContext.language || ""}\n${codeContext.content}\n\`\`\`\n\n${message}`;
      }

      const startTime = Date.now();

      // Create CodingAgent instance
      // IMPORTANT: id = candidateId, sessionRecording.id = actual session recording ID
      const agent = await createCodingAgent({
        sessionId: id, // This is used for Modal volume ID (vol-{candidateId})
        candidateId: id, // Pass candidateId explicitly for run_tests
        sessionRecordingId: sessionRecording.id, // For DB operations
        helpfulnessLevel: (helpfulnessLevel || "pair-programming") as HelpfulnessLevel,
        workspaceRoot: "/workspace",
        problemStatement,
      });

      logger.debug('[Chat Agent] Agent created', {
        candidateId: id,
        sessionId: sessionRecording.id,
        helpfulnessLevel: helpfulnessLevel || "pair-programming",
      });

      // Load conversation history from database to maintain context across requests
      // This is CRITICAL - without this, Claude loses context between messages
      const previousInteractions = await prisma.claudeInteraction.findMany({
        where: {
          sessionId: sessionRecording.id,
        },
        orderBy: {
          timestamp: "asc",
        },
        select: {
          role: true,
          content: true,
        },
      });

      if (previousInteractions.length > 0) {
        agent.loadConversationHistory(
          previousInteractions.map((interaction) => ({
            role: interaction.role as "user" | "assistant",
            content: interaction.content,
          }))
        );
        logger.debug('[Chat Agent] Loaded conversation history', {
          sessionId: sessionRecording.id,
          messageCount: previousInteractions.length,
        });
      }

      // Send message to agent (this handles tool use automatically)
      const agentResponse = await logger.time(
        'agentSendMessage',
        () => agent.sendMessage(enhancedMessage),
        { candidateId: id, sessionId: sessionRecording.id }
      );

      const latency = Date.now() - startTime;

      // Record interaction to database
      const modelName = agentResponse.metadata?.model as string | undefined;
      const usage = agentResponse.metadata?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      const interaction = await prisma.claudeInteraction.create({
        data: {
          sessionId: sessionRecording.id,
          role: "user",
          content: message,
          model: modelName,
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
          latency,
        },
      });

      // Store assistant response
      await prisma.claudeInteraction.create({
        data: {
          sessionId: sessionRecording.id,
          role: "assistant",
          content: agentResponse.text,
          model: modelName,
        },
      });

      // Calculate prompt quality (simple heuristic)
      const promptQuality = calculatePromptQuality(message, codeContext);

      // Update prompt quality in the user's interaction record
      await prisma.claudeInteraction.update({
        where: { id: interaction.id },
        data: { promptQuality },
      });

      logger.info('[Chat Agent] Interaction recorded', {
        candidateId: id,
        sessionId: sessionRecording.id,
        interactionId: interaction.id,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        latency,
        promptQuality,
        toolsUsed: agentResponse.toolsUsed?.length ?? 0,
        filesModified: agentResponse.filesModified?.length ?? 0,
      });

      // Publish AI interaction event to BullMQ for Interview Agent
      publishAIInteraction({
        sessionId: sessionRecording.id,
        timestamp: new Date(),
        candidateMessage: message,
        aiResponse: agentResponse.text,
        toolsUsed: agentResponse.toolsUsed ?? [],
        filesModified: agentResponse.filesModified ?? [],
      }).catch((error) => {
        // Log error but don't fail the request
        logger.error("Failed to publish AI interaction event", error as Error, {
          sessionId: sessionRecording.id,
          candidateId: id,
        });
      });

      // Return response with metadata
      return success({
        response: agentResponse.text,
        toolsUsed: agentResponse.toolsUsed ?? [],
        filesModified: agentResponse.filesModified ?? [],
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        },
        metadata: {
          model: modelName,
          toolCallCount: agentResponse.metadata?.toolCallCount as number | undefined,
          latency,
        },
      });
    } catch (error: any) {
      // Special handling for Claude API overload errors (529)
      const isOverloaded = error?.status === 529 ||
                          error?.message?.includes('overloaded') ||
                          error?.message?.includes('Overloaded');

      if (isOverloaded) {
        logger.warn('[Chat Agent] Claude API overloaded', {
          candidateId: id,
          error: error?.message,
        });
        return NextResponse.json(
          {
            error: "Service temporarily overloaded",
            message: "Claude AI is experiencing high demand. Please try again in a few seconds.",
          },
          { status: 503 }
        );
      }

      // Re-throw other errors to be handled by withErrorHandling
      throw error;
    }
  }
);

/**
 * Calculate prompt quality score (1-5)
 * Based on heuristics for clarity, specificity, and context
 */
function calculatePromptQuality(
  message: string,
  codeContext?: { fileName?: string; content?: string; language?: string }
): number {
  let score = 3; // Start at acceptable

  const wordCount = message.split(/\s+/).length;
  const hasContext = !!codeContext?.content;
  const hasSpecificQuestion = /\b(how|why|what|when|where|which)\b/i.test(
    message
  );
  const hasCodeReference = /\b(function|class|variable|error|bug|implement)\b/i.test(
    message
  );

  // Deduct for very short prompts
  if (wordCount < 5) {
    score -= 1;
  }

  // Add for context
  if (hasContext) {
    score += 0.5;
  }

  // Add for specific questions
  if (hasSpecificQuestion) {
    score += 0.5;
  }

  // Add for code-specific references
  if (hasCodeReference) {
    score += 0.5;
  }

  // Add for good length (10-50 words is ideal)
  if (wordCount >= 10 && wordCount <= 50) {
    score += 0.5;
  }

  // Deduct for too long (likely copy-paste)
  if (wordCount > 100) {
    score -= 0.5;
  }

  return Math.max(1, Math.min(5, score));
}
