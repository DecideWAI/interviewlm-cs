import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { publishAIInteraction } from "@/lib/queues";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";
import { recordClaudeInteraction } from "@/lib/services/sessions";

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
});

// Initialize Anthropic client with caching beta
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  defaultHeaders: {
    "anthropic-beta": "prompt-caching-2024-07-31",
  },
});

/**
 * GET /api/interview/[id]/chat
 * Claude chat with Server-Sent Events streaming
 * Query params: message (required), fileName, content, language (optional)
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

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const message = searchParams.get("message");
  const fileName = searchParams.get("fileName");
  const content = searchParams.get("content");
  const language = searchParams.get("language");

  if (!message) {
    throw new ValidationError("Message is required");
  }

  logger.debug('[Chat] Request received', {
    candidateId: id,
    messageLength: message.length,
    hasCodeContext: !!(fileName || content || language),
  });

    const codeContext = (fileName || content || language) ? {
      fileName: fileName || undefined,
      content: content || undefined,
      language: language || undefined,
    } : undefined;

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

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      throw new AuthorizationError("Access denied to this interview session");
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

    // Build context-aware system prompt
    const systemPrompt = buildSystemPrompt(codeContext);

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const startTime = Date.now();
        let fullResponse = "";
        let inputTokens = 0;
        let outputTokens = 0;
        const toolsUsed: string[] = [];
        const filesModified: string[] = [];
        const toolBlocks: Array<{ id: string; name: string; input: any }> = [];

        try {
          // Stream from Claude API
          const messageStream = await anthropic.messages.stream({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: message,
              },
            ],
          });

          // Stream text chunks to client
          for await (const event of messageStream) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                const text = event.delta.text;
                fullResponse += text;

                // Send SSE formatted chunk (event: content, data: {delta})
                const data = JSON.stringify({ delta: text });
                controller.enqueue(encoder.encode(`event: content\ndata: ${data}\n\n`));
              }
            } else if (event.type === "content_block_start") {
              // Track tool use blocks
              if (event.content_block.type === "tool_use") {
                const toolBlock = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: event.content_block.input,
                };
                toolBlocks.push(toolBlock);
                toolsUsed.push(toolBlock.name);
              }
            } else if (event.type === "message_start") {
              inputTokens = event.message.usage.input_tokens;
            } else if (event.type === "message_delta") {
              // @ts-ignore - usage exists on MessageDeltaEvent but not on Delta type
              outputTokens = event.usage?.output_tokens || 0;
            }
          }

          // Extract file modifications from tool blocks
          for (const tool of toolBlocks) {
            if (tool.name === "Write" || tool.name === "Edit") {
              const filePath = tool.input?.file_path || tool.input?.path;
              if (filePath && !filesModified.includes(filePath)) {
                filesModified.push(filePath);
              }
            }
          }

          const latency = Date.now() - startTime;

          // Calculate prompt quality (simple heuristic)
          const promptQuality = calculatePromptQuality(message, codeContext);

          // Record user message to event store using helper (handles origin, sequencing)
          await recordClaudeInteraction(
            sessionRecording.id,
            {
              role: "user",
              content: message,
              model: "claude-sonnet-4-5-20250929",
              inputTokens,
              outputTokens,
              latency,
            },
            { promptQuality }
          );

          // Record assistant response to event store using helper (handles origin, sequencing)
          await recordClaudeInteraction(
            sessionRecording.id,
            {
              role: "assistant",
              content: fullResponse,
              model: "claude-sonnet-4-5-20250929",
            }
          );

          // Publish AI interaction event to BullMQ for Interview Agent
          publishAIInteraction({
            sessionId: sessionRecording.id,
            timestamp: new Date(),
            candidateMessage: message,
            aiResponse: fullResponse,
            toolsUsed: toolsUsed as any, // Tools used in this interaction (empty if no tool use)
            filesModified, // Files modified by Write/Edit tools
          }).catch((error) => {
            // Log error but don't fail the request
            logger.warn('Failed to publish AI interaction event', {
              sessionId: sessionRecording.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });

          logger.info('[Chat] Interaction completed', {
            candidateId: id,
            sessionId: sessionRecording.id,
            promptQuality,
            inputTokens,
            outputTokens,
            latency,
            toolsUsed: toolsUsed.length,
          });

          // Send usage event (frontend expects this format)
          const usageData = JSON.stringify({
            inputTokens,
            outputTokens,
          });
          controller.enqueue(encoder.encode(`event: usage\ndata: ${usageData}\n\n`));

          // Send completion event
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));

          controller.close();
        } catch (error) {
          logger.error("Claude API error", error as Error, {
            candidateId: id,
            sessionId: sessionRecording?.id,
          });
          const errorData = JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    // Return SSE response
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
});

/**
 * Build context-aware system prompt
 */
function buildSystemPrompt(codeContext?: {
  fileName?: string;
  content?: string;
  language?: string;
}): string {
  let prompt = `You are Claude Code, an AI assistant helping a candidate during a technical interview assessment. Your role is to:

1. Provide helpful guidance without giving away complete solutions
2. Help debug issues and explain concepts
3. Suggest best practices and improvements
4. Answer technical questions clearly

Be concise and actionable. Focus on helping the candidate learn and succeed.`;

  if (codeContext?.content) {
    prompt += `\n\nCurrent code context:
File: ${codeContext.fileName || "untitled"}
Language: ${codeContext.language || "unknown"}

\`\`\`${codeContext.language || ""}
${codeContext.content}
\`\`\``;
  }

  return prompt;
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
