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
import { agentAssignmentService, type AgentBackendType } from "@/lib/experiments";
import { fileStreamManager } from "@/lib/services/file-streaming";
import { sessionService } from "@/lib/services";

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

    // Get agent backend assignment (DB-based, session-sticky)
    const agentAssignment = await agentAssignmentService.getBackendForSession({
      sessionId: sessionRecording.id,
      candidateId: id,
      organizationId: candidate.organizationId,
      assessmentId: candidate.assessmentId,
    });

    console.log(
      `[AgentStream] Using ${agentAssignment.backend} backend (source: ${agentAssignment.source}${agentAssignment.experimentId ? `, experiment: ${agentAssignment.experimentId}` : ""
      })`
    );

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
    let isStreamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          // Don't try to send if stream is already closed
          if (isStreamClosed) {
            return;
          }
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch (error) {
            // Mark stream as closed to prevent further attempts
            isStreamClosed = true;
            // Only log if it's not the expected "controller closed" error
            if (error instanceof Error && !error.message.includes('closed')) {
              console.error("[AgentStream] Failed to send event:", error);
            }
          }
        };

        try {
          // Wrap the entire agent interaction with LangSmith trace
          // This groups all LLM calls and tool executions under a single "user message" run
          const agentResponse = await traceAgentSession(
            sessionRecording!.id, // sessionId (used as thread_id to group all messages from same session)
            id, // candidateId
            async () => {
              // Load conversation history
              const previousInteractions = await prisma.claudeInteraction.findMany({
                where: { sessionId: sessionRecording!.id },
                orderBy: { timestamp: "asc" },
                select: { role: true, content: true },
              });

              // Route based on agent assignment
              if (agentAssignment.backend === "langgraph") {
                // Call LangGraph Python agent via HTTP
                // IMPORTANT: Use sessionRecording.id as sessionId for:
                // - Consistent sandbox operations in LangGraph
                // - Correct file streaming subscriptions (frontend subscribes to session recording ID)
                // - Proper conversation history grouping
                return await callLangGraphAgent({
                  sessionId: sessionRecording!.id,
                  candidateId: id,
                  sessionRecordingId: sessionRecording?.id,
                  message: enhancedMessage,
                  helpfulnessLevel: helpfulnessLevel || "pair-programming",
                  problemStatement,
                  conversationHistory: previousInteractions.map((i) => ({
                    role: i.role,
                    content: i.content,
                  })),
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
              }

              // Default: TypeScript Claude SDK agent
              // Use sessionRecording.id as sessionId for consistency with LangGraph path
              const agent = await createStreamingCodingAgent({
                sessionId: sessionRecording!.id,
                candidateId: id,
                sessionRecordingId: sessionRecording!.id,
                helpfulnessLevel: (helpfulnessLevel || "pair-programming") as HelpfulnessLevel,
                workspaceRoot: "/workspace",
                problemStatement,
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
              agentBackend: agentAssignment.backend,
              agentSource: agentAssignment.source,
              experimentId: agentAssignment.experimentId,
            },
          });

          isStreamClosed = true;
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

          isStreamClosed = true;
          controller.close();
        }
      },
      cancel() {
        // Client disconnected - mark stream as closed
        isStreamClosed = true;
        console.log("[AgentStream] Client disconnected");
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
 * Call LangGraph Python agent via HTTP with streaming support
 */
interface LangGraphCallOptions {
  sessionId: string;
  candidateId: string;
  sessionRecordingId?: string;
  message: string;
  helpfulnessLevel: string;
  problemStatement?: string;
  conversationHistory: Array<{ role: string; content: string }>;
  onTextDelta: (delta: string) => void;
  onToolStart: (toolName: string, toolId: string, input: unknown) => void;
  onToolResult: (toolName: string, toolId: string, result: unknown, isError: boolean) => void;
}

async function callLangGraphAgent(options: LangGraphCallOptions): Promise<{
  text: string;
  toolsUsed?: string[];
  filesModified?: string[];
  metadata?: Record<string, unknown>;
}> {
  const langGraphUrl = process.env.LANGGRAPH_API_URL || "http://localhost:9001";

  try {
    // Try streaming endpoint first
    const response = await fetch(`${langGraphUrl}/api/coding/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        session_id: options.sessionId,
        candidate_id: options.candidateId,
        message: options.message,
        helpfulness_level: options.helpfulnessLevel,
        problem_statement: options.problemStatement,
        conversation_history: options.conversationHistory,
      }),
    });

    if (!response.ok) {
      // Fallback to non-streaming endpoint
      return await callLangGraphAgentNonStreaming(options);
    }

    // Parse SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      return await callLangGraphAgentNonStreaming(options);
    }

    const decoder = new TextDecoder();
    let fullText = "";
    let toolsUsed: string[] = [];
    let filesModified: string[] = [];
    let metadata: Record<string, unknown> = {};

    let currentEventType = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEventType = line.substring(7).trim();
          continue;
        }
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.substring(6));
            // Merge SSE event type with data for consistent handling
            const effectiveType = data.type || currentEventType;

            if (effectiveType === "content" || effectiveType === "text_delta" || data.delta) {
              const delta = data.delta || data.content || "";
              fullText += delta;
              options.onTextDelta(delta);
            } else if (effectiveType === "tool_start" || data.tool_name || (effectiveType === "on_tool_start" && data.name)) {
              // Tool starting - Python sends: {type: "tool_start", name, input}
              const toolName = data.tool_name || data.name || data.tool || "";
              if (toolName) {
                options.onToolStart(toolName, data.tool_id || "", data.input || {});
              }
            } else if (effectiveType === "tool_result" || effectiveType === "tool_end" || data.tool) {
              // Handle both formats:
              // - TypeScript agent: {type: "tool_result", tool_name, output}
              // - Python LangGraph: {type: "tool_end", name, output}
              const toolNameRaw = data.tool_name || data.name || data.tool || "";
              const output = data.output || data.result || {};

              options.onToolResult(
                toolNameRaw,
                data.tool_id || "",
                output,
                !!data.is_error
              );
              if (toolNameRaw) {
                toolsUsed.push(toolNameRaw);
              }

              // Broadcast file changes for file operations from LangGraph agent
              // This enables real-time file tree updates in the frontend
              const toolName = toolNameRaw.toLowerCase();
              console.log(`[LangGraph] Tool result: ${toolName}, output:`, JSON.stringify(output).slice(0, 200));
              if (
                (toolName === "write_file" || toolName === "edit_file") &&
                output.success &&
                output.path
              ) {
                console.log(`[LangGraph] Broadcasting file change: ${output.path} to candidate ${options.candidateId}`);
                const isCreate = toolName === "write_file";
                const filePath = output.path.startsWith("/workspace")
                  ? output.path
                  : `/workspace/${output.path}`;
                const fileName = filePath.split("/").pop() || filePath;

                // Track file in database so it appears in file tree on refresh
                if (options.sessionRecordingId) {
                  sessionService
                    .addTrackedFile(options.sessionRecordingId, filePath)
                    .catch((err) =>
                      console.error("[LangGraph] Failed to track file:", err)
                    );
                }

                // Broadcast file change event for real-time updates
                // IMPORTANT: Use candidateId (not sessionId) because frontend connects via /api/interview/[candidateId]/file-updates
                fileStreamManager.broadcastFileChange({
                  sessionId: options.candidateId,
                  type: isCreate ? "create" : "update",
                  path: filePath,
                  fileType: "file",
                  name: fileName,
                  timestamp: new Date().toISOString(),
                });
                filesModified.push(filePath);
              }
            } else if (effectiveType === "done" || data.response) {
              fullText = data.response || data.text || fullText;
              toolsUsed = data.tools_used || toolsUsed;
              filesModified = data.files_modified || filesModified;
              metadata = data.metadata || metadata;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    return {
      text: fullText,
      toolsUsed,
      filesModified,
      metadata,
    };
  } catch (error) {
    console.error("[LangGraph] Streaming failed, trying non-streaming:", error);
    return await callLangGraphAgentNonStreaming(options);
  }
}

/**
 * Non-streaming fallback for LangGraph agent
 */
async function callLangGraphAgentNonStreaming(options: LangGraphCallOptions): Promise<{
  text: string;
  toolsUsed?: string[];
  filesModified?: string[];
  metadata?: Record<string, unknown>;
}> {
  const langGraphUrl = process.env.LANGGRAPH_API_URL || "http://localhost:9001";

  const response = await fetch(`${langGraphUrl}/api/coding/chat/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: options.sessionId,
      candidate_id: options.candidateId,
      message: options.message,
      helpfulness_level: options.helpfulnessLevel,
      problem_statement: options.problemStatement,
      conversation_history: options.conversationHistory,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  // Send full response as single delta
  if (result.text) {
    options.onTextDelta(result.text);
  }

  return {
    text: result.text || "",
    toolsUsed: result.tools_used || [],
    filesModified: result.files_modified || [],
    metadata: {
      model: result.model,
      usage: result.token_usage
        ? {
          input_tokens: result.token_usage.input,
          output_tokens: result.token_usage.output,
        }
        : undefined,
      ...result.metadata,
    },
  };
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
