/**
 * Streaming Agent Chat API
 * GET /api/interview/[id]/chat/agent/stream - SSE endpoint for streaming agent responses
 *
 * This endpoint provides real-time streaming of:
 * - AI thinking/reasoning (as text arrives)
 * - Tool execution status and results
 * - Final response with metadata
 *
 * Events:
 * - thinking: Partial text as Claude generates it
 * - tool_start: Tool execution beginning
 * - tool_result: Tool execution completed
 * - done: Final response with metadata
 * - error: Error occurred
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { publishAIInteraction } from "@/lib/queues";
import { createStreamingCodingAgent } from "@/lib/agents/coding-agent";
import { traceAgentSession } from "@/lib/observability/langsmith";
import type { HelpfulnessLevel } from "@/lib/types/agent";

// Request validation schema (passed as query params for GET/SSE)
const chatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  codeContext: z.string().optional(), // JSON stringified
  helpfulnessLevel: z.enum(["consultant", "pair-programming", "full-copilot"]).optional(),
});

/**
 * POST /api/interview/[id]/chat/agent/stream
 * Server-Sent Events endpoint for streaming agent responses
 *
 * Uses POST to accept message body, returns SSE stream
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validationResult = chatRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { message, codeContext: codeContextStr, helpfulnessLevel } = validationResult.data;

    // Parse code context if provided
    let codeContext: { fileName?: string; content?: string; language?: string } | undefined;
    if (codeContextStr) {
      try {
        codeContext = JSON.parse(codeContextStr);
      } catch {
        // Ignore parse errors
      }
    }

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

    // Check authorization
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

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch (error) {
            console.error("[AgentStream] Failed to send event:", error);
          }
        };

        try {
          // Wrap the entire agent interaction with LangSmith trace
          // This groups all LLM calls and tool executions under a single "user message" run
          const agentResponse = await traceAgentSession(
            id, // sessionId (used as thread_id to group all messages from same session)
            id, // candidateId
            async () => {
              // Create streaming agent
              const agent = await createStreamingCodingAgent({
                sessionId: id,
                candidateId: id,
                sessionRecordingId: sessionRecording!.id,
                helpfulnessLevel: (helpfulnessLevel || "pair-programming") as HelpfulnessLevel,
                workspaceRoot: "/workspace",
                problemStatement,
              });

              // Load conversation history
              const previousInteractions = await prisma.claudeInteraction.findMany({
                where: { sessionId: sessionRecording!.id },
                orderBy: { timestamp: "asc" },
                select: { role: true, content: true },
              });

              if (previousInteractions.length > 0) {
                agent.loadConversationHistory(
                  previousInteractions.map((i) => ({
                    role: i.role as "user" | "assistant",
                    content: i.content,
                  }))
                );
              }

              // Send message with streaming callbacks
              return agent.sendMessageStreaming(enhancedMessage, {
                onTextDelta: (delta: string) => {
                  sendEvent("content", { delta });
                },
                onToolStart: (toolName: string, toolId: string, input: unknown) => {
                  sendEvent("tool_use_start", { toolName, toolId, input });
                },
                onToolResult: (toolName: string, toolId: string, result: unknown, isError: boolean) => {
                  sendEvent("tool_result", { toolName, toolId, output: result, isError });
                },
              });
            },
            { message: enhancedMessage } // Include message for tracing context
          );

          const latency = Date.now() - startTime;
          const modelName = agentResponse.metadata?.model as string | undefined;
          const usage = agentResponse.metadata?.usage as { input_tokens?: number; output_tokens?: number } | undefined;

          // Record interactions to database
          const interaction = await prisma.claudeInteraction.create({
            data: {
              sessionId: sessionRecording!.id,
              role: "user",
              content: message,
              model: modelName,
              inputTokens: usage?.input_tokens,
              outputTokens: usage?.output_tokens,
              latency,
            },
          });

          await prisma.claudeInteraction.create({
            data: {
              sessionId: sessionRecording!.id,
              role: "assistant",
              content: agentResponse.text,
              model: modelName,
            },
          });

          // Calculate prompt quality
          const promptQuality = calculatePromptQuality(message, codeContext);
          await prisma.claudeInteraction.update({
            where: { id: interaction.id },
            data: { promptQuality },
          });

          // Publish event for Interview Agent
          publishAIInteraction({
            sessionId: sessionRecording!.id,
            timestamp: new Date(),
            candidateMessage: message,
            aiResponse: agentResponse.text,
            toolsUsed: agentResponse.toolsUsed ?? [],
            filesModified: agentResponse.filesModified ?? [],
          }).catch(console.error);

          // Send final done event
          sendEvent("done", {
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

          controller.close();
        } catch (error: unknown) {
          console.error("[AgentStream] Error:", error);

          const isOverloaded =
            (error as { status?: number })?.status === 529 ||
            (error as Error)?.message?.includes("overloaded");

          sendEvent("error", {
            error: isOverloaded
              ? "Service temporarily overloaded"
              : "Failed to process message",
            message: error instanceof Error ? error.message : "Unknown error",
            retryable: isOverloaded,
          });

          controller.close();
        }
      },
    });

    // Return SSE response
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[AgentStream] Setup error:", error);
    return NextResponse.json(
      { error: "Failed to establish stream" },
      { status: 500 }
    );
  }
}

/**
 * Calculate prompt quality score (1-5)
 */
function calculatePromptQuality(
  message: string,
  codeContext?: { fileName?: string; content?: string; language?: string }
): number {
  let score = 3;

  const wordCount = message.split(/\s+/).length;
  const hasContext = !!codeContext?.content;
  const hasSpecificQuestion = /\b(how|why|what|when|where|which)\b/i.test(message);
  const hasCodeReference = /\b(function|class|variable|error|bug|implement)\b/i.test(message);

  if (wordCount < 5) score -= 1;
  if (hasContext) score += 0.5;
  if (hasSpecificQuestion) score += 0.5;
  if (hasCodeReference) score += 0.5;
  if (wordCount >= 10 && wordCount <= 50) score += 0.5;
  if (wordCount > 100) score -= 0.5;

  return Math.max(1, Math.min(5, score));
}
