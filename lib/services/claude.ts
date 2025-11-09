/**
 * Claude AI Service
 *
 * Handles all interactions with Anthropic's Claude API for AI-assisted coding
 * during interview sessions. Provides streaming responses and tracks token usage.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Configuration
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.7;

// Validation schemas
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const contextSchema = z.object({
  problemTitle: z.string(),
  problemDescription: z.string(),
  language: z.string(),
  starterCode: z.string().optional(),
  currentCode: z.string().optional(),
  testResults: z.string().optional(),
});

type Message = z.infer<typeof messageSchema>;
type ProblemContext = z.infer<typeof contextSchema>;

/**
 * Token usage tracking for cost monitoring
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
}

/**
 * Streaming response chunk
 */
export interface StreamChunk {
  content: string;
  done: boolean;
  usage?: TokenUsage;
  stopReason?: string;
}

/**
 * Complete chat response (non-streaming)
 */
export interface ChatResponse {
  content: string;
  usage: TokenUsage;
  stopReason: string;
  latency: number; // milliseconds
}

/**
 * Initialize Anthropic SDK client
 * @throws Error if ANTHROPIC_API_KEY is not set
 */
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  return new Anthropic({
    apiKey,
  });
}

/**
 * Calculate estimated cost based on token usage
 * Claude Sonnet 4.5 pricing: $3/MTok input, $15/MTok output
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  const INPUT_COST_PER_MILLION = 3.0;
  const OUTPUT_COST_PER_MILLION = 15.0;

  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

  return inputCost + outputCost;
}

/**
 * Build system prompt with problem context
 */
function buildSystemPrompt(context: ProblemContext): string {
  return `You are Claude Code, an expert AI programming assistant helping a candidate during a technical interview.

**Problem Context:**
Title: ${context.problemTitle}
Description: ${context.problemDescription}
Programming Language: ${context.language}

**Your Role:**
- Help the candidate understand the problem and develop a solution
- Provide guidance on algorithms, data structures, and best practices
- Suggest improvements to code quality and efficiency
- Debug issues when tests fail
- Be concise but thorough in your explanations

**Important Guidelines:**
- Do NOT write the entire solution for them - guide them instead
- Ask clarifying questions when requirements are unclear
- Encourage test-driven development
- Point out edge cases they should consider
- Provide code snippets to illustrate concepts, but let them implement the full solution

${context.starterCode ? `**Starter Code:**\n\`\`\`${context.language}\n${context.starterCode}\n\`\`\`` : ""}

${context.currentCode ? `**Current Code:**\n\`\`\`${context.language}\n${context.currentCode}\n\`\`\`` : ""}

${context.testResults ? `**Recent Test Results:**\n${context.testResults}` : ""}

Be helpful, encouraging, and collaborative. This is a learning experience.`;
}

/**
 * Stream chat completion responses using Server-Sent Events
 *
 * @param messages - Conversation history
 * @param context - Problem and code context
 * @returns AsyncGenerator yielding stream chunks
 *
 * @example
 * ```typescript
 * for await (const chunk of streamChatCompletion(messages, context)) {
 *   if (chunk.done) {
 *     console.log("Total tokens:", chunk.usage?.totalTokens);
 *   } else {
 *     process.stdout.write(chunk.content);
 *   }
 * }
 * ```
 */
export async function* streamChatCompletion(
  messages: Message[],
  context: ProblemContext
): AsyncGenerator<StreamChunk, void, unknown> {
  try {
    // Validate inputs
    messages.forEach((msg) => messageSchema.parse(msg));
    contextSchema.parse(context);

    const client = getAnthropicClient();
    const systemPrompt = buildSystemPrompt(context);

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Stream the response
    const stream = await client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    // Yield content deltas
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        yield {
          content: chunk.delta.text,
          done: false,
        };
      }
    }

    // Get final message with usage stats
    const finalMessage = await stream.finalMessage();

    const usage: TokenUsage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      estimatedCost: calculateCost(
        finalMessage.usage.input_tokens,
        finalMessage.usage.output_tokens
      ),
    };

    // Yield completion marker
    yield {
      content: "",
      done: true,
      usage,
      stopReason: finalMessage.stop_reason,
    };

  } catch (error) {
    console.error("Error in streamChatCompletion:", error);
    throw new Error(
      `Claude API streaming failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get complete chat response (non-streaming)
 * Useful for server-side processing where streaming is not needed
 *
 * @param messages - Conversation history
 * @param context - Problem and code context
 * @returns Complete response with content and metadata
 */
export async function getChatCompletion(
  messages: Message[],
  context: ProblemContext
): Promise<ChatResponse> {
  const startTime = Date.now();

  try {
    // Validate inputs
    messages.forEach((msg) => messageSchema.parse(msg));
    contextSchema.parse(context);

    const client = getAnthropicClient();
    const systemPrompt = buildSystemPrompt(context);

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Get complete response
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const endTime = Date.now();

    // Extract text content
    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as Anthropic.TextBlock).text)
      .join("\n");

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      estimatedCost: calculateCost(
        response.usage.input_tokens,
        response.usage.output_tokens
      ),
    };

    return {
      content: textContent,
      usage,
      stopReason: response.stop_reason,
      latency: endTime - startTime,
    };

  } catch (error) {
    console.error("Error in getChatCompletion:", error);
    throw new Error(
      `Claude API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Test the Claude API connection
 * Useful for health checks and debugging
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getAnthropicClient();

    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 50,
      messages: [{ role: "user", content: "Hello!" }],
    });

    return response.content.length > 0;
  } catch (error) {
    console.error("Claude API connection test failed:", error);
    return false;
  }
}

/**
 * Export the model name for reference
 */
export const CURRENT_MODEL = CLAUDE_MODEL;
