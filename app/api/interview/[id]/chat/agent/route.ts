import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import {
  readFileTool,
  writeFileTool,
  runTestsTool,
  executeBashTool,
  suggestNextQuestionTool,
  executeReadFile,
  executeWriteFile,
  executeRunTests,
  executeExecuteBash,
  executeSuggestNextQuestion,
} from "@/lib/agent-tools";
import type {
  ReadFileToolInput,
  WriteFileToolInput,
  RunTestsToolInput,
  ExecuteBashToolInput,
  SuggestNextQuestionToolInput,
} from "@/lib/agent-tools";
import {
  buildSecureSystemPrompt,
  sanitizeMessages,
  sanitizeToolOutput,
  validateBashCommand,
  checkRateLimit,
} from "@/lib/agent-security";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

/**
 * POST /api/interview/[id]/chat/agent
 * Claude Agent with tool use capabilities (streaming)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: candidateId } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Security: Sanitize messages to prevent injection
    const sanitizedMessages = sanitizeMessages(messages);

    // Security: Check rate limits
    const rateLimitCheck = checkRateLimit(sanitizedMessages);
    if (rateLimitCheck.exceeded) {
      return NextResponse.json(
        { error: rateLimitCheck.reason },
        { status: 429 }
      );
    }

    // Get candidate and verify access
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        sessionRecording: true,
        generatedQuestions: true,
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
          candidateId,
          status: "ACTIVE",
        },
      });
    }

    // Build secure system prompt with anti-leakage guardrails
    const systemPrompt = buildSecureSystemPrompt(candidate);

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = "";
          let inputTokens = 0;
          let outputTokens = 0;
          const startTime = Date.now();

          // Track content blocks manually
          const contentBlocks: any[] = [];
          let currentToolUseBlock: any = null;

          // Stream from Claude API with tool use (using sanitized messages)
          const messageStream = await anthropic.messages.stream({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: systemPrompt,
            messages: sanitizedMessages as Anthropic.MessageParam[],
            tools: [
              readFileTool,
              writeFileTool,
              runTestsTool,
              executeBashTool,
              suggestNextQuestionTool,
            ],
          });

          // Handle streaming events
          for await (const event of messageStream) {
            // Message start - capture input tokens
            if (event.type === "message_start") {
              inputTokens = event.message.usage.input_tokens;
            }

            // Content block start
            if (event.type === "content_block_start") {
              const block = event.content_block;

              // Tool use started
              if (block.type === "tool_use") {
                currentToolUseBlock = {
                  type: "tool_use",
                  id: block.id,
                  name: block.name,
                  input: {},
                };
                contentBlocks[event.index] = currentToolUseBlock;

                // Send tool_use_start event
                controller.enqueue(
                  encoder.encode(
                    `event: tool_use_start\ndata: ${JSON.stringify({
                      toolName: block.name,
                      toolId: block.id,
                    })}\n\n`
                  )
                );
              } else if (block.type === "text") {
                contentBlocks[event.index] = {
                  type: "text",
                  text: block.text || "",
                };
              }
            }

            // Content block delta - text or tool input
            if (event.type === "content_block_delta") {
              const delta = event.delta;

              // Text delta
              if (delta.type === "text_delta") {
                fullResponse += delta.text;

                // Send text content to client
                controller.enqueue(
                  encoder.encode(
                    `event: content\ndata: ${JSON.stringify({
                      delta: delta.text,
                    })}\n\n`
                  )
                );
              }

              // Tool input delta
              if (delta.type === "input_json_delta") {
                if (currentToolUseBlock) {
                  currentToolUseBlock.input = delta.partial_json ? JSON.parse(delta.partial_json) : currentToolUseBlock.input;
                }
              }
            }

            // Content block stop - tool use complete, execute it
            if (event.type === "content_block_stop") {
              const block = contentBlocks[event.index];

              if (block.type === "tool_use") {
                const toolName = block.name;
                const toolInput = block.input;
                const toolId = block.id;

                // Send tool_use event to frontend
                controller.enqueue(
                  encoder.encode(
                    `event: tool_use\ndata: ${JSON.stringify({
                      toolName,
                      toolId,
                      input: toolInput,
                    })}\n\n`
                  )
                );

                // Security: Validate bash commands before execution
                if (toolName === "execute_bash") {
                  const validation = validateBashCommand(toolInput.command);
                  if (!validation.safe) {
                    controller.enqueue(
                      encoder.encode(
                        `event: tool_error\ndata: ${JSON.stringify({
                          toolName,
                          toolId,
                          error: `Security violation: ${validation.reason}`,
                        })}\n\n`
                      )
                    );
                    continue; // Skip to next iteration
                  }
                }

                // Execute the tool
                let toolResult: any;
                let sanitizedToolResult: any;
                try {
                  toolResult = await executeTool(
                    toolName,
                    toolInput,
                    candidate.volumeId || "",
                    candidateId,
                    sessionRecording.id
                  );

                  // Security: Sanitize tool output before sending to AI
                  sanitizedToolResult = sanitizeToolOutput(toolName, toolResult);

                  // Record tool use event for session replay (with full output)
                  await recordToolUseEvent(sessionRecording.id, {
                    toolName,
                    input: toolInput,
                    output: toolResult, // Store full output for review
                    success: true,
                  });

                  // Send sanitized tool_result to frontend (and AI)
                  controller.enqueue(
                    encoder.encode(
                      `event: tool_result\ndata: ${JSON.stringify({
                        toolName,
                        toolId,
                        output: sanitizedToolResult, // Sanitized version
                      })}\n\n`
                    )
                  );
                } catch (error) {
                  toolResult = {
                    success: false,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Tool execution failed",
                  };

                  // Record failed tool use
                  await recordToolUseEvent(sessionRecording.id, {
                    toolName,
                    input: toolInput,
                    output: toolResult,
                    success: false,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Tool execution failed",
                  });

                  // Send error to frontend
                  controller.enqueue(
                    encoder.encode(
                      `event: tool_error\ndata: ${JSON.stringify({
                        toolName,
                        toolId,
                        error: toolResult.error,
                      })}\n\n`
                    )
                  );
                }

                // Continue conversation with tool result
                // (This is handled by the stream automatically via the messageStream)
              }
            }

            // Message delta - capture output tokens
            if (event.type === "message_delta") {
              outputTokens = event.usage.output_tokens;
            }
          }

          const latency = Date.now() - startTime;

          // Record conversation to database (use sanitized messages)
          // Store user messages
          for (const msg of sanitizedMessages) {
            if (msg.role === "user") {
              await prisma.claudeInteraction.create({
                data: {
                  sessionId: sessionRecording.id,
                  role: "user",
                  content:
                    typeof msg.content === "string"
                      ? msg.content
                      : JSON.stringify(msg.content),
                  model: "claude-sonnet-4-5-20250929",
                },
              });
            }
          }

          // Store assistant response
          await prisma.claudeInteraction.create({
            data: {
              sessionId: sessionRecording.id,
              role: "assistant",
              content: fullResponse,
              model: "claude-sonnet-4-5-20250929",
              inputTokens,
              outputTokens,
              latency,
            },
          });

          // Send usage event
          controller.enqueue(
            encoder.encode(
              `event: usage\ndata: ${JSON.stringify({
                inputTokens,
                outputTokens,
              })}\n\n`
            )
          );

          // Send completion event
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));

          controller.close();
        } catch (error) {
          console.error("Agent API error:", error);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`
            )
          );
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
  } catch (error) {
    console.error("Chat agent API error:", error);
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
 * Execute a tool based on its name
 */
async function executeTool(
  toolName: string,
  toolInput: any,
  volumeId: string,
  candidateId: string,
  sessionId: string
): Promise<any> {
  switch (toolName) {
    case "read_file":
      return executeReadFile(volumeId, toolInput as ReadFileToolInput);

    case "write_file":
      return executeWriteFile(volumeId, toolInput as WriteFileToolInput);

    case "run_tests":
      return executeRunTests(
        candidateId,
        sessionId,
        toolInput as RunTestsToolInput
      );

    case "execute_bash":
      return executeExecuteBash(candidateId, toolInput as ExecuteBashToolInput);

    case "suggest_next_question":
      return executeSuggestNextQuestion(
        toolInput as SuggestNextQuestionToolInput
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Record tool use event for session replay
 */
async function recordToolUseEvent(
  sessionId: string,
  event: {
    toolName: string;
    input: any;
    output: any;
    success: boolean;
    error?: string;
  }
) {
  try {
    await prisma.sessionEvent.create({
      data: {
        sessionId,
        type: event.success ? "tool_use_complete" : "tool_use_error",
        data: {
          toolName: event.toolName,
          input: event.input,
          output: event.output,
          error: event.error,
        },
        checkpoint: false,
      },
    });
  } catch (error) {
    console.error("Failed to record tool use event:", error);
  }
}

// Note: System prompt moved to lib/agent-security.ts (buildSecureSystemPrompt)
