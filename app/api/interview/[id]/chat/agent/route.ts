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

    // Build system prompt
    const systemPrompt = buildInterviewSystemPrompt(candidate);

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

          // Stream from Claude API with tool use
          const messageStream = await anthropic.messages.stream({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages as Anthropic.MessageParam[],
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

                // Execute the tool
                let toolResult: any;
                try {
                  toolResult = await executeTool(
                    toolName,
                    toolInput,
                    candidate.volumeId || "",
                    candidateId,
                    sessionRecording.id
                  );

                  // Record tool use event for session replay
                  await recordToolUseEvent(sessionRecording.id, {
                    toolName,
                    input: toolInput,
                    output: toolResult,
                    success: true,
                  });

                  // Send tool_result event to frontend
                  controller.enqueue(
                    encoder.encode(
                      `event: tool_result\ndata: ${JSON.stringify({
                        toolName,
                        toolId,
                        output: toolResult,
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

          // Record conversation to database
          // Store user messages
          for (const msg of messages) {
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

/**
 * Build context-aware system prompt for the interview
 */
function buildInterviewSystemPrompt(candidate: any): string {
  const question = candidate.generatedQuestions?.[0];

  let prompt = `You are Claude Code, an AI assistant helping a candidate during a technical interview assessment. Your role is to:

1. Act as a pair programming partner - you can read files, write code, run tests, and execute commands
2. Help debug issues and explain concepts clearly
3. Suggest best practices and improvements
4. Be proactive - if you see a problem, offer to fix it
5. When all tests pass and the solution is complete, use the suggest_next_question tool to recommend advancing to the next challenge

You have access to these tools:
- read_file: Read any file in the workspace to understand the code
- write_file: Create or modify files to implement features or fix bugs
- run_tests: Execute the test suite to validate code changes
- execute_bash: Run terminal commands (install packages, check structure, etc.)
- suggest_next_question: Suggest advancing to the next question when the current one is successfully completed

Be concise but thorough. When making code changes, always run tests afterward to verify they work.`;

  if (question) {
    prompt += `\n\nCurrent Challenge:
Title: ${question.title}
Difficulty: ${question.difficulty}
Language: ${question.language}

Description:
${question.description}

Help the candidate succeed while encouraging them to learn and understand the solution.`;
  }

  return prompt;
}
