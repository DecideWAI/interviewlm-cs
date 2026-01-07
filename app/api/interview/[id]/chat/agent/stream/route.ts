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
import { Client } from '@langchain/langgraph-sdk';
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { publishAIInteraction } from "@/lib/queues";
import { createStreamingCodingAgent } from "@/lib/agents/coding-agent";
import { traceAgentSession } from "@/lib/observability/langsmith";
import type { HelpfulnessLevel } from "@/lib/types/agent";
import { agentAssignmentService, type AgentBackendType } from "@/lib/experiments";
import { fileStreamManager } from "@/lib/services/file-streaming";
import { sessionService, recordClaudeInteraction } from "@/lib/services";
import { eventStore } from "@/lib/services/event-store";
import { getAuthenticatedLangGraphClient } from "@/lib/services/langgraph-client";

// Stream checkpoint constants
const CHECKPOINT_EVENT_TYPE = 'stream_checkpoint';
const CHECKPOINT_INTERVAL_MS = 5000; // Save checkpoint every 5 seconds
const MIN_CONTENT_FOR_CHECKPOINT = 50; // Minimum characters before checkpointing

/**
 * Stream checkpoint data structure
 */
interface StreamCheckpointData {
  messageId: string;
  userMessage: string;
  partialResponse: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
    result?: string;
  }>;
  status: 'streaming' | 'completed' | 'failed';
  lastCheckpointAt: number;
  questionId: string;
}

/**
 * Generate a unique message ID for checkpoint tracking
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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
        assessment: true,
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

      // Append Tech Stack Constraints if available
      if (candidate.assessment?.techStack && candidate.assessment.techStack.length > 0) {
        problemStatement += `\n\n## Technology Constraints\nYou MUST use the following technologies for your solution:\n- ${candidate.assessment.techStack.join("\n- ")}\n\nYou should prioritize using these specific technologies over generic alternatives.`;
      }
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

        // Stream checkpoint tracking for recovery
        const messageId = generateMessageId();
        let accumulatedResponse = '';
        let accumulatedToolCalls: Array<{ id: string; name: string; arguments: string; result?: string }> = [];
        let lastCheckpointTime = 0;
        let checkpointId: string | null = null;

        /**
         * Save checkpoint to database for stream recovery
         * Called periodically during streaming
         */
        const saveCheckpoint = async (status: 'streaming' | 'completed' | 'failed') => {
          // Don't checkpoint if no content yet
          if (accumulatedResponse.length < MIN_CONTENT_FOR_CHECKPOINT && status === 'streaming') {
            return;
          }

          try {
            const checkpointData: StreamCheckpointData = {
              messageId,
              userMessage: message,
              partialResponse: accumulatedResponse,
              toolCalls: accumulatedToolCalls,
              status,
              lastCheckpointAt: Date.now(),
              questionId: currentQuestion?.id || '',
            };

            if (checkpointId) {
              // Update existing checkpoint
              await prisma.sessionEventLog.update({
                where: { id: checkpointId },
                data: {
                  timestamp: new Date(),
                  data: checkpointData as any,
                },
              });
            } else {
              // Create new checkpoint using eventStore for proper sequencing
              checkpointId = await eventStore.emit({
                sessionId: sessionRecording!.id,
                eventType: CHECKPOINT_EVENT_TYPE as any, // Special checkpoint type
                category: 'chat',
                origin: 'SYSTEM',
                data: checkpointData as any,
                checkpoint: true,
              });
            }

            lastCheckpointTime = Date.now();
            console.log(`[AgentStream] Checkpoint saved: ${status}, ${accumulatedResponse.length} chars`);
          } catch (error) {
            console.error('[AgentStream] Failed to save checkpoint:', error);
          }
        };

        /**
         * Maybe save checkpoint if enough time has passed
         */
        const maybeCheckpoint = async () => {
          const now = Date.now();
          if (now - lastCheckpointTime >= CHECKPOINT_INTERVAL_MS) {
            await saveCheckpoint('streaming');
          }
        };

        /**
         * Clear checkpoint after successful completion
         */
        const clearCheckpoint = async () => {
          if (checkpointId) {
            try {
              await prisma.sessionEventLog.delete({
                where: { id: checkpointId },
              });
              console.log('[AgentStream] Checkpoint cleared');
            } catch (error) {
              console.error('[AgentStream] Failed to clear checkpoint:', error);
            }
          }
        };

        // Send messageId to client for queue tracking
        sendEvent("stream_start", { messageId });

        try {
          // Wrap the entire agent interaction with LangSmith trace
          // This groups all LLM calls and tool executions under a single "user message" run
          const agentResponse = await traceAgentSession(
            sessionRecording!.id, // sessionId (used as thread_id to group all messages from same session)
            id, // candidateId
            async () => {
              // Load conversation history from event store
              const chatEvents = await prisma.sessionEventLog.findMany({
                where: {
                  sessionId: sessionRecording!.id,
                  category: "chat",
                  eventType: { in: ["chat.user_message", "chat.assistant_message"] },
                },
                orderBy: { sequenceNumber: "asc" },
                select: { data: true },
              });
              const previousInteractions = chatEvents.map((e) => {
                const data = e.data as any;
                return { role: data.role || "user", content: data.content || "" };
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
                  techStack: candidate.assessment?.techStack || [],
                  conversationHistory: previousInteractions.map((i) => ({
                    role: i.role,
                    content: i.content,
                  })),
                  onTextDelta: (delta: string) => {
                    accumulatedResponse += delta;
                    sendEvent("content", { delta });
                    // Trigger checkpoint check (fire-and-forget to not block streaming)
                    maybeCheckpoint().catch(() => { });
                  },
                  onToolStart: (toolName: string, toolId: string, input: unknown) => {
                    accumulatedToolCalls.push({
                      id: toolId,
                      name: toolName,
                      arguments: typeof input === 'string' ? input : JSON.stringify(input),
                    });
                    sendEvent("tool_use_start", { toolName, toolId, input });
                  },
                  onToolResult: (toolName: string, toolId: string, result: unknown, isError: boolean) => {
                    // Update tool call with result
                    const toolCall = accumulatedToolCalls.find(tc => tc.id === toolId);
                    const toolInput = toolCall ? JSON.parse(toolCall.arguments || '{}') : {};
                    if (toolCall) {
                      toolCall.result = typeof result === 'string' ? result : JSON.stringify(result);
                    }
                    // Include tool input so frontend can extract path/content when output is missing
                    sendEvent("tool_result", { toolName, toolId, output: result, input: toolInput, isError });
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
                techStack: candidate.assessment?.techStack || [],
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
                  accumulatedResponse += delta;
                  sendEvent("content", { delta });
                  // Trigger checkpoint check (fire-and-forget to not block streaming)
                  maybeCheckpoint().catch(() => { });
                },
                onToolStart: (toolName: string, toolId: string, input: unknown) => {
                  accumulatedToolCalls.push({
                    id: toolId,
                    name: toolName,
                    arguments: typeof input === 'string' ? input : JSON.stringify(input),
                  });
                  sendEvent("tool_use_start", { toolName, toolId, input });
                },
                onToolResult: (toolName: string, toolId: string, result: unknown, isError: boolean) => {
                  // Update tool call with result
                  const toolCall = accumulatedToolCalls.find(tc => tc.id === toolId);
                  const toolInput = toolCall ? JSON.parse(toolCall.arguments || '{}') : {};
                  if (toolCall) {
                    toolCall.result = typeof result === 'string' ? result : JSON.stringify(result);
                  }
                  // Include tool input so frontend can extract path/content when output is missing
                  sendEvent("tool_result", { toolName, toolId, output: result, input: toolInput, isError });
                },
              });
            },
            { message: enhancedMessage } // Include message for tracing context
          );

          const latency = Date.now() - startTime;
          const modelName = agentResponse.metadata?.model as string | undefined;
          const usage = agentResponse.metadata?.usage as { input_tokens?: number; output_tokens?: number } | undefined;

          // Calculate prompt quality
          const promptQuality = calculatePromptQuality(message, codeContext);

          // Record user message to event store using helper (handles origin, sequencing)
          await recordClaudeInteraction(
            sessionRecording!.id,
            {
              role: "user",
              content: message,
              model: modelName,
              inputTokens: usage?.input_tokens,
              outputTokens: usage?.output_tokens,
              latency,
            },
            { promptQuality }
          );

          // Record assistant response to event store using helper (handles origin, sequencing)
          await recordClaudeInteraction(
            sessionRecording!.id,
            {
              role: "assistant",
              content: agentResponse.text,
              model: modelName,
            }
          );

          // Publish event for Interview Agent
          publishAIInteraction({
            sessionId: sessionRecording!.id,
            timestamp: new Date(),
            candidateMessage: message,
            aiResponse: agentResponse.text,
            toolsUsed: (agentResponse.toolsUsed as any) ?? [],
            filesModified: agentResponse.filesModified ?? [],
          }).catch(console.error);

          // Send final done event
          sendEvent("done", {
            response: agentResponse.text,
            toolsUsed: (agentResponse.toolsUsed as any) ?? [],
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
              messageId, // Include for client-side queue tracking
            },
          });

          // Clear checkpoint on successful completion
          await clearCheckpoint();

          isStreamClosed = true;
          controller.close();
        } catch (error: unknown) {
          console.error("[AgentStream] Error:", error);

          // Save checkpoint with failed status for potential recovery
          await saveCheckpoint('failed').catch(() => { });

          const isOverloaded =
            (error as { status?: number })?.status === 529 ||
            (error as Error)?.message?.includes("overloaded");

          sendEvent("error", {
            error: isOverloaded
              ? "Service temporarily overloaded"
              : "Failed to process message",
            message: error instanceof Error ? error.message : "Unknown error",
            retryable: isOverloaded,
            messageId, // Include for client-side queue tracking
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
 * Call LangGraph Python agent via SDK with streaming support
 */

// LangGraph API URL for fallback
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || 'http://localhost:2024';

/**
 * Get authenticated LangGraph client for Cloud Run IAM
 * In production, this adds the proper Bearer token for service-to-service auth
 */
async function getLangGraphClient(userId?: string, sessionId?: string): Promise<Client> {
  // Use the authenticated client which handles Cloud Run IAM tokens
  return getAuthenticatedLangGraphClient(userId, sessionId);
}

interface LangGraphCallOptions {
  sessionId: string;
  candidateId: string;
  sessionRecordingId?: string;
  message: string;
  helpfulnessLevel: string;
  problemStatement?: string;
  techStack?: string[];  // Required technologies for enforcement
  conversationHistory: Array<{ role: string; content: string }>;
  onTextDelta: (delta: string) => void;
  onToolStart: (toolName: string, toolId: string, input: unknown) => void;
  onToolResult: (toolName: string, toolId: string, result: unknown, isError: boolean) => void;
}

/**
 * Extract tool output from LangGraph event data
 * Handles various formats:
 * - Direct dict: {success: true, path: "...", bytes_written: 123}
 * - ToolMessage wrapper: {content: '{"success":true,...}'}
 * - JSON string: '{"success":true,...}'
 * - Nested output: {output: {success: true, ...}}
 * - LangGraph artifact format: {artifact: {...}}
 */
function extractToolOutput(rawOutput: unknown): Record<string, unknown> {
  if (!rawOutput) {
    console.log('[extractToolOutput] rawOutput is null/undefined');
    return {};
  }

  console.log('[extractToolOutput] Input type:', typeof rawOutput);
  console.log('[extractToolOutput] Input preview:', JSON.stringify(rawOutput).slice(0, 500));

  // Helper to check if object has expected tool result fields
  const hasToolResultFields = (obj: Record<string, unknown>) =>
    'success' in obj || 'path' in obj || 'error' in obj || 'bytes_written' in obj || 'bytesWritten' in obj;

  // If it's already a plain object, process it
  if (typeof rawOutput === 'object' && rawOutput !== null) {
    const obj = rawOutput as Record<string, unknown>;

    // Direct object with expected fields - return immediately
    if (hasToolResultFields(obj)) {
      console.log('[extractToolOutput] Direct object with expected fields');
      return obj;
    }

    // Check for nested 'output' field (some LangGraph versions nest the result)
    if ('output' in obj && typeof obj.output === 'object' && obj.output !== null) {
      const nested = obj.output as Record<string, unknown>;
      if (hasToolResultFields(nested)) {
        console.log('[extractToolOutput] Found nested output object');
        return nested;
      }
    }

    // Check for 'artifact' field (LangGraph structured output)
    if ('artifact' in obj && typeof obj.artifact === 'object' && obj.artifact !== null) {
      const artifact = obj.artifact as Record<string, unknown>;
      if (hasToolResultFields(artifact)) {
        console.log('[extractToolOutput] Found artifact object');
        return artifact;
      }
    }

    // Check if this looks like a ToolMessage with .content
    if ('content' in obj) {
      console.log('[extractToolOutput] Found content field, extracting...');
      const content = obj.content;

      // content can be a JSON string that needs parsing
      if (typeof content === 'string') {
        // First try to parse as JSON
        try {
          const parsed = JSON.parse(content);
          if (typeof parsed === 'object' && parsed !== null) {
            console.log('[extractToolOutput] Parsed content JSON:', JSON.stringify(parsed).slice(0, 200));
            return parsed as Record<string, unknown>;
          }
        } catch {
          // Not valid JSON - try to extract info from string message
          console.log('[extractToolOutput] Content is not JSON, extracting from string');

          // Try to extract path from common message patterns like "Wrote to /workspace/foo.py"
          const pathMatch = content.match(/(?:to|at|file|path[:\s]+)?([\/\w.-]+\.\w+)/i);
          const bytesMatch = content.match(/(\d+)\s*(?:bytes?|chars?)/i);

          return {
            rawContent: content,
            success: !content.toLowerCase().includes('error') && !content.toLowerCase().includes('failed'),
            path: pathMatch?.[1],
            bytes_written: bytesMatch ? parseInt(bytesMatch[1]) : undefined,
          };
        }
      }

      // content is already an object
      if (typeof content === 'object' && content !== null) {
        console.log('[extractToolOutput] Content is object:', JSON.stringify(content).slice(0, 200));
        return content as Record<string, unknown>;
      }
    }

    // Fallback: return the object as-is
    console.log('[extractToolOutput] Returning object as-is');
    return obj;
  }

  // If it's a JSON string, try to parse it
  if (typeof rawOutput === 'string') {
    try {
      const parsed = JSON.parse(rawOutput);
      if (typeof parsed === 'object' && parsed !== null) {
        console.log('[extractToolOutput] Parsed string JSON:', JSON.stringify(parsed).slice(0, 200));
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try to extract info from string
      console.log('[extractToolOutput] String is not JSON, extracting info');
      const pathMatch = rawOutput.match(/(?:to|at|file|path[:\s]+)?([\/\w.-]+\.\w+)/i);
      return {
        rawContent: rawOutput,
        success: !rawOutput.toLowerCase().includes('error'),
        path: pathMatch?.[1],
      };
    }
  }

  console.log('[extractToolOutput] Unhandled type, returning empty object');
  return {};
}

import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

// Namespace UUID for generating deterministic thread IDs
const LANGGRAPH_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace

/**
 * Generate a deterministic UUID from session ID and agent type
 * This ensures the same session always gets the same thread UUID
 */
function generateThreadUUID(sessionId: string, agentType: string): string {
  const input = `${agentType}:${sessionId}`;
  return uuidv5(input, LANGGRAPH_NAMESPACE);
}

/**
 * Get or create a LangGraph thread for a session
 * Uses deterministic UUID v5 generated from agentType and sessionId
 * This ensures conversation history persists across requests
 */
async function getOrCreateThread(
  client: Client,
  sessionId: string,
  agentType: string = 'coding_agent'
): Promise<string> {
  // Generate deterministic UUID for consistent history
  const threadId = generateThreadUUID(sessionId, agentType);

  try {
    // Try to get existing thread
    const thread = await client.threads.get(threadId);
    if (thread) {
      return threadId;
    }
  } catch {
    // Thread doesn't exist, create it
  }

  try {
    // Create thread with specific ID and metadata
    await client.threads.create({
      threadId,
      metadata: { sessionId, agentType },
    });
    console.log(`[LangGraph] Created thread ${threadId} for session ${sessionId}`);
    return threadId;
  } catch (error) {
    // Thread may already exist (race condition) or creation failed
    // Either way, use the deterministic UUID
    console.log(`[LangGraph] Using thread ${threadId}`);
    return threadId;
  }
}

async function callLangGraphAgent(options: LangGraphCallOptions, retryCount = 0): Promise<{
  text: string;
  toolsUsed?: string[];
  filesModified?: string[];
  metadata?: Record<string, unknown>;
}> {
  const MAX_RETRIES = 1; // Only retry once for corrupted thread state

  // Get authenticated client for Cloud Run IAM
  const langGraphClient = await getLangGraphClient(options.candidateId, options.sessionId);
  const threadId = await getOrCreateThread(langGraphClient, options.sessionId);

  let fullText = "";
  const toolsUsed: string[] = [];
  const filesModified: string[] = [];
  const toolInputMap = new Map<string, unknown>(); // Store tool inputs for retrieval in on_tool_end

  // IMPORTANT: Generate run_id at TOP LEVEL of config
  // Aegra's graph_streaming.py looks for config.get("run_id") at top level (line 109)
  // but create_run_config only sets configurable.run_id (line 363)
  // This mismatch causes event filtering to fail - run_id in events doesn't match
  // Setting run_id at top level ensures the filter matches events from graph execution
  const runId = uuidv4();
  const metadata: Record<string, unknown> = { threadId, runId };

  try {
    console.log(`[LangGraph] Starting stream for thread ${threadId}, runId ${runId}, assistant: coding_agent`);

    // Use LangGraph SDK streaming with multiple modes for comprehensive event coverage
    // NOTE: LangGraph server handles checkpointing - we only send the NEW message
    // The server loads previous state from checkpoint and appends via add_messages reducer
    // Build config with run_id at top level
    // TypeScript SDK types don't include run_id at top level, but Aegra's graph_streaming.py
    // looks for config.get("run_id") at line 109. Use type assertion to pass it.
    const streamConfig = {
      run_id: runId, // CRITICAL: Set at top level for Aegra's graph_streaming.py event filtering
      configurable: {
        run_id: runId, // Also set in configurable for consistency
        session_id: options.sessionId,
        candidate_id: options.candidateId,
        helpfulness_level: options.helpfulnessLevel || 'pair-programming',
        problem_statement: options.problemStatement,
        tech_stack: options.techStack,
      },
      recursion_limit: 100, // Increased from default 25 for complex tool chains
    };

    const stream = langGraphClient.runs.stream(threadId, 'coding_agent', {
      input: {
        messages: [{ role: 'user', content: options.message }],
      },
      config: streamConfig as any, // Type assertion needed - SDK types don't include run_id
      // Use messages mode for text streaming
      streamMode: ['messages', 'events'],
    });

    let eventCount = 0;
    for await (const chunk of stream) {
      // Cast to any for flexible event handling - LangGraph SDK types are strict
      const event = chunk as any;
      eventCount++;
      console.log(`[LangGraph] Event #${eventCount}: type=${event.event}, hasData=${!!event.data}`);

      // Handle events mode - this is the primary source for text and tool events
      if (event.event === 'events') {
        const eventData = event.data;

        if (eventData?.event === 'on_chat_model_stream') {
          // Text streaming: content is in event.data.data.chunk.content as an array
          // Format: [{"text":"Hello! ","type":"text","index":0}]
          const chunkContent = eventData.data?.chunk?.content;
          if (Array.isArray(chunkContent)) {
            for (const item of chunkContent) {
              if (item?.type === 'text' && item?.text) {
                fullText += item.text;
                options.onTextDelta(item.text);
              }
            }
          } else if (typeof chunkContent === 'string' && chunkContent) {
            fullText += chunkContent;
            options.onTextDelta(chunkContent);
          }
        } else if (eventData?.event === 'on_tool_start') {
          const toolName = eventData.name || 'unknown';
          const toolId = eventData.run_id || `tool_${Date.now()}`;
          const toolInput = eventData.data?.input || {};
          toolsUsed.push(toolName);
          // Store input for later retrieval in on_tool_end
          toolInputMap.set(toolId, toolInput);
          options.onToolStart(toolName, toolId, toolInput);
        } else if (eventData?.event === 'on_tool_end') {
          const toolName = eventData.name || 'unknown';
          const toolId = eventData.run_id || '';
          // Extract tool output, handling ToolMessage wrapper and JSON string formats
          const output = extractToolOutput(eventData.data?.output);
          const isError = !!eventData.data?.error || output.success === false;
          // Retrieve the input that was stored during on_tool_start
          const toolInput = toolInputMap.get(toolId) as Record<string, unknown> | undefined;

          options.onToolResult(toolName, toolId, output, isError);

          // Broadcast file changes for file operations
          const toolNameLower = toolName.toLowerCase();
          console.log(`[LangGraph] Tool result: ${toolNameLower}, output:`, JSON.stringify(output).slice(0, 200));

          // Get file path from output or fallback to input
          const filePath = (
            output.path ||
            toolInput?.path ||
            toolInput?.file_path
          ) as string | undefined;

          if (
            (toolNameLower === 'write_file' || toolNameLower === 'edit_file') &&
            (output.success !== false) && // Allow undefined success (assume success if not explicitly false)
            filePath
          ) {
            console.log(`[LangGraph] Broadcasting file change: ${filePath} to candidate ${options.candidateId}`);
            const isCreate = toolNameLower === 'write_file';
            const normalizedPath = filePath.startsWith('/workspace')
              ? filePath
              : `/workspace/${filePath}`;
            const fileName = normalizedPath.split('/').pop() || normalizedPath;

            // Track file in database so it appears in file tree on refresh
            if (options.sessionRecordingId) {
              sessionService
                .addTrackedFile(options.sessionRecordingId, normalizedPath)
                .catch((err) =>
                  console.error('[LangGraph] Failed to track file:', err)
                );
            }

            // Broadcast file change event for real-time updates
            fileStreamManager.broadcastFileChange({
              sessionId: options.candidateId,
              type: isCreate ? 'create' : 'update',
              path: normalizedPath,
              fileType: 'file',
              name: fileName,
              timestamp: new Date().toISOString(),
            });
            filesModified.push(normalizedPath);
          }
        }
      }
      // Handle metadata event
      else if (event.event === 'metadata') {
        Object.assign(metadata, event.data || {});
      }
      // Handle error event
      else if (event.event === 'error') {
        const errorMessage = event.data?.message || 'Stream error';
        console.error('[LangGraph] Stream error:', event.data);

        // Check if this is a recoverable error that requires clearing the thread
        const isCorruptedThread =
          (errorMessage.includes('tool_use') && errorMessage.includes('tool_result')) ||
          errorMessage.includes('non-consecutive system messages') ||
          errorMessage.includes('multiple non-consecutive');

        if (isCorruptedThread && retryCount < MAX_RETRIES) {
          console.log('[LangGraph] Detected corrupted thread state, clearing and retrying...');
          // Delete the corrupted thread
          try {
            await langGraphClient.threads.delete(threadId);
            console.log(`[LangGraph] Deleted corrupted thread ${threadId}`);
          } catch (deleteError) {
            console.warn('[LangGraph] Failed to delete thread:', deleteError);
          }
          // Retry with a fresh thread
          return callLangGraphAgent(options, retryCount + 1);
        }

        throw new Error(errorMessage);
      }
      // Note: messages/partial events are skipped as we get text from events/on_chat_model_stream
    }

    console.log(`[LangGraph] Stream completed: ${eventCount} events, ${fullText.length} chars, tools=${toolsUsed.join(',')}`);

    return {
      text: fullText,
      toolsUsed,
      filesModified,
      metadata,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[LangGraph] Streaming failed:', error);

    // Check if this is a recoverable error that requires clearing the thread
    const isCorruptedThread =
      (errorMessage.includes('tool_use') && errorMessage.includes('tool_result')) ||
      errorMessage.includes('non-consecutive system messages') ||
      errorMessage.includes('multiple non-consecutive');

    if (isCorruptedThread && retryCount < MAX_RETRIES) {
      console.log('[LangGraph] Detected corrupted thread state in catch, clearing and retrying...');
      // Delete the corrupted thread
      try {
        await langGraphClient.threads.delete(threadId);
        console.log(`[LangGraph] Deleted corrupted thread ${threadId}`);
      } catch (deleteError) {
        console.warn('[LangGraph] Failed to delete thread:', deleteError);
      }
      // Retry with a fresh thread
      return callLangGraphAgent(options, retryCount + 1);
    }

    throw error;
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
