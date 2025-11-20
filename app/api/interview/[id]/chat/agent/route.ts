import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { publishAIInteraction } from "@/lib/queues";
import { createCodingAgent } from "@/lib/agents/coding-agent";
import type { HelpfulnessLevel } from "@/lib/types/agent";

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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = chatRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { message, codeContext, helpfulnessLevel } = validationResult.data;

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
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    }

    // Enhance message with code context if provided
    let enhancedMessage = message;
    if (codeContext?.content) {
      enhancedMessage = `I'm working on the file "${codeContext.fileName || "untitled"}" (${codeContext.language || "unknown"}):\n\n\`\`\`${codeContext.language || ""}\n${codeContext.content}\n\`\`\`\n\n${message}`;
    }

    const startTime = Date.now();

    // Create CodingAgent instance
    const agent = await createCodingAgent({
      sessionId: id,
      helpfulnessLevel: (helpfulnessLevel || "pair-programming") as HelpfulnessLevel,
      workspaceRoot: "/workspace",
      problemStatement,
    });

    // Send message to agent (this handles tool use automatically)
    const agentResponse = await agent.sendMessage(enhancedMessage);

    const latency = Date.now() - startTime;

    // Record interaction to database
    const interaction = await prisma.claudeInteraction.create({
      data: {
        sessionId: sessionRecording.id,
        role: "user",
        content: message,
        model: agentResponse.metadata.model,
        inputTokens: agentResponse.metadata.usage.input_tokens,
        outputTokens: agentResponse.metadata.usage.output_tokens,
        latency,
      },
    });

    // Store assistant response
    await prisma.claudeInteraction.create({
      data: {
        sessionId: sessionRecording.id,
        role: "assistant",
        content: agentResponse.text,
        model: agentResponse.metadata.model,
      },
    });

    // Calculate prompt quality (simple heuristic)
    const promptQuality = calculatePromptQuality(message, codeContext);

    // Update prompt quality in the user's interaction record
    await prisma.claudeInteraction.update({
      where: { id: interaction.id },
      data: { promptQuality },
    });

    // Publish AI interaction event to BullMQ for Interview Agent
    publishAIInteraction({
      sessionId: sessionRecording.id,
      timestamp: new Date(),
      candidateMessage: message,
      aiResponse: agentResponse.text,
      toolsUsed: agentResponse.toolsUsed,
      filesModified: agentResponse.filesModified,
    }).catch((error) => {
      // Log error but don't fail the request
      console.error("Failed to publish AI interaction event:", error);
    });

    // Return response with metadata
    return NextResponse.json({
      response: agentResponse.text,
      toolsUsed: agentResponse.toolsUsed,
      filesModified: agentResponse.filesModified,
      usage: {
        inputTokens: agentResponse.metadata.usage.input_tokens,
        outputTokens: agentResponse.metadata.usage.output_tokens,
        totalTokens: agentResponse.metadata.usage.input_tokens + agentResponse.metadata.usage.output_tokens,
      },
      metadata: {
        model: agentResponse.metadata.model,
        toolCallCount: agentResponse.metadata.toolCallCount,
        latency,
      },
    });

  } catch (error: any) {
    console.error("Chat agent API error:", error);

    // Check if it's an overload error
    const isOverloaded = error?.status === 529 ||
                        error?.message?.includes('overloaded') ||
                        error?.message?.includes('Overloaded');

    if (isOverloaded) {
      return NextResponse.json(
        {
          error: "Service temporarily overloaded",
          message: "Claude AI is experiencing high demand. Please try again in a few seconds.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

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
