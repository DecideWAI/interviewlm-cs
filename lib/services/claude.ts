/**
 * Claude AI Service
 *
 * Handles all interactions with Anthropic's Claude API for AI-assisted coding
 * during interview sessions. Provides streaming responses and tracks token usage.
 *
 * Includes Sentry AI monitoring for:
 * - Token usage tracking
 * - Model and latency metrics
 * - Prompt/response capture (when enabled)
 */

import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import {
  buildChatSystemPrompt as buildSystemPrompt,
  buildChatSystemPromptWithCaching as buildSystemPromptWithCaching,
  type ChatPromptContext,
} from "@/lib/prompts/chat-system";
import { addMessageCacheBreakpoints } from "@/lib/utils/agent-utils";

// Configuration
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 32000;
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
 * Includes cache metrics for prompt caching
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
  cacheCreationInputTokens?: number; // Tokens written to cache
  cacheReadInputTokens?: number; // Tokens read from cache (90% cheaper)
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
  stopReason?: string;
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
    defaultHeaders: {
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
  });
}

/**
 * Calculate estimated cost based on token usage
 * Claude Sonnet 4.5 pricing: $3/MTok input, $15/MTok output
 * Claude Haiku 4.5 pricing: $1/MTok input, $5/MTok output
 *
 * Cache pricing:
 * - Cache write: 1.25x base input cost
 * - Cache read: 0.1x base input cost (90% savings)
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens?: number,
  cacheReadTokens?: number
): number {
  const INPUT_COST_PER_MILLION = 3.0;
  const OUTPUT_COST_PER_MILLION = 15.0;
  const CACHE_WRITE_MULTIPLIER = 1.25;
  const CACHE_READ_MULTIPLIER = 0.1;

  // Regular input tokens (excluding cache operations)
  const regularInputTokens = inputTokens - (cacheCreationTokens || 0) - (cacheReadTokens || 0);
  const regularInputCost = (regularInputTokens / 1_000_000) * INPUT_COST_PER_MILLION;

  // Cache write cost (1.25x)
  const cacheWriteCost = ((cacheCreationTokens || 0) / 1_000_000) * INPUT_COST_PER_MILLION * CACHE_WRITE_MULTIPLIER;

  // Cache read cost (0.1x - 90% savings!)
  const cacheReadCost = ((cacheReadTokens || 0) / 1_000_000) * INPUT_COST_PER_MILLION * CACHE_READ_MULTIPLIER;

  // Output cost
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

  return regularInputCost + cacheWriteCost + cacheReadCost + outputCost;
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
  // Create Sentry span for AI request tracking
  const span = Sentry.startInactiveSpan({
    op: "gen_ai.chat",
    name: `chat ${CLAUDE_MODEL}`,
    attributes: {
      "gen_ai.request.model": CLAUDE_MODEL,
      "gen_ai.operation.name": "chat",
      "gen_ai.request.max_tokens": MAX_TOKENS,
      "gen_ai.request.temperature": TEMPERATURE,
      "gen_ai.request.messages": JSON.stringify(
        messages.slice(-3).map((m) => ({ role: m.role, content: m.content.slice(0, 200) }))
      ),
    },
  });

  try {
    // Validate inputs
    messages.forEach((msg) => messageSchema.parse(msg));
    contextSchema.parse(context);

    const client = getAnthropicClient();
    const systemPromptWithCaching = buildSystemPromptWithCaching(context);

    // Convert messages to Anthropic format and add cache breakpoints
    const anthropicMessages = addMessageCacheBreakpoints(
      messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
    );

    // Stream the response with caching enabled
    const stream = await client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPromptWithCaching,
      messages: anthropicMessages,
    });

    // Collect response for Sentry tracking
    let fullResponse = "";

    // Yield content deltas
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        fullResponse += chunk.delta.text;
        yield {
          content: chunk.delta.text,
          done: false,
        };
      }
    }

    // Get final message with usage stats (including cache metrics)
    const finalMessage = await stream.finalMessage();

    // Extract cache metrics from usage (Anthropic SDK types may not include these yet)
    const usageAny = finalMessage.usage as any;
    const cacheCreationInputTokens = usageAny.cache_creation_input_tokens || 0;
    const cacheReadInputTokens = usageAny.cache_read_input_tokens || 0;

    const usage: TokenUsage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      estimatedCost: calculateCost(
        finalMessage.usage.input_tokens,
        finalMessage.usage.output_tokens,
        cacheCreationInputTokens,
        cacheReadInputTokens
      ),
      cacheCreationInputTokens,
      cacheReadInputTokens,
    };

    // Set Sentry span attributes for AI monitoring
    span.setAttribute("gen_ai.usage.input_tokens", usage.inputTokens);
    span.setAttribute("gen_ai.usage.output_tokens", usage.outputTokens);
    span.setAttribute("gen_ai.usage.total_tokens", usage.totalTokens);
    if (cacheReadInputTokens > 0) {
      span.setAttribute("gen_ai.usage.input_tokens.cached", cacheReadInputTokens);
    }
    span.setAttribute("gen_ai.response.text", JSON.stringify([fullResponse.slice(0, 500)]));
    span.setStatus({ code: 1 }); // OK

    // Log cache performance
    if (cacheCreationInputTokens > 0 || cacheReadInputTokens > 0) {
      console.log(`[Claude] Cache metrics - created: ${cacheCreationInputTokens}, read: ${cacheReadInputTokens}`);
    }

    // Yield completion marker
    yield {
      content: "",
      done: true,
      usage,
      stopReason: finalMessage.stop_reason || undefined,
    };

  } catch (error) {
    console.error("Error in streamChatCompletion:", error);
    span.setStatus({ code: 2, message: error instanceof Error ? error.message : "Unknown error" });
    Sentry.captureException(error);
    throw new Error(
      `Claude API streaming failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  } finally {
    span.end();
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

  return Sentry.startSpan(
    {
      op: "gen_ai.chat",
      name: `chat ${CLAUDE_MODEL}`,
      attributes: {
        "gen_ai.request.model": CLAUDE_MODEL,
        "gen_ai.operation.name": "chat",
        "gen_ai.request.max_tokens": MAX_TOKENS,
        "gen_ai.request.temperature": TEMPERATURE,
        "gen_ai.request.messages": JSON.stringify(
          messages.slice(-3).map((m) => ({ role: m.role, content: m.content.slice(0, 200) }))
        ),
      },
    },
    async (span) => {
      try {
        // Validate inputs
        messages.forEach((msg) => messageSchema.parse(msg));
        contextSchema.parse(context);

        const client = getAnthropicClient();
        const systemPromptWithCaching = buildSystemPromptWithCaching(context);

        // Convert messages to Anthropic format and add cache breakpoints
        const anthropicMessages = addMessageCacheBreakpoints(
          messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          }))
        );

        // Get complete response with caching enabled
        const response = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          system: systemPromptWithCaching,
          messages: anthropicMessages,
        });

        const endTime = Date.now();

        // Extract text content
        const textContent = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block as Anthropic.TextBlock).text)
          .join("\n");

        // Extract cache metrics from usage (Anthropic SDK types may not include these yet)
        const usageAny = response.usage as any;
        const cacheCreationInputTokens = usageAny.cache_creation_input_tokens || 0;
        const cacheReadInputTokens = usageAny.cache_read_input_tokens || 0;

        const usage: TokenUsage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          estimatedCost: calculateCost(
            response.usage.input_tokens,
            response.usage.output_tokens,
            cacheCreationInputTokens,
            cacheReadInputTokens
          ),
          cacheCreationInputTokens,
          cacheReadInputTokens,
        };

        // Set Sentry span attributes for AI monitoring
        span.setAttribute("gen_ai.usage.input_tokens", usage.inputTokens);
        span.setAttribute("gen_ai.usage.output_tokens", usage.outputTokens);
        span.setAttribute("gen_ai.usage.total_tokens", usage.totalTokens);
        if (cacheReadInputTokens > 0) {
          span.setAttribute("gen_ai.usage.input_tokens.cached", cacheReadInputTokens);
        }
        span.setAttribute("gen_ai.response.text", JSON.stringify([textContent.slice(0, 500)]));

        // Log cache performance
        if (cacheCreationInputTokens > 0 || cacheReadInputTokens > 0) {
          console.log(`[Claude] Cache metrics - created: ${cacheCreationInputTokens}, read: ${cacheReadInputTokens}`);
        }

        return {
          content: textContent,
          usage,
          stopReason: response.stop_reason || undefined,
          latency: endTime - startTime,
        };

      } catch (error) {
        console.error("Error in getChatCompletion:", error);
        Sentry.captureException(error);
        throw new Error(
          `Claude API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  );
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
 * Fast question generation using Haiku model
 *
 * Optimized for speed (~10-15s vs ~50s with Sonnet):
 * - Uses Haiku model (3x faster than Sonnet)
 * - No system prompt overhead
 * - Direct API call without chat context
 *
 * @param prompt - The question generation prompt
 * @returns The generated text response
 */
export async function generateQuestionFast(prompt: string): Promise<{
  content: string;
  latency: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const startTime = Date.now();

  return Sentry.startSpan(
    {
      op: "gen_ai.generate",
      name: `generate ${HAIKU_MODEL}`,
      attributes: {
        "gen_ai.request.model": HAIKU_MODEL,
        "gen_ai.operation.name": "generate_question",
        "gen_ai.request.max_tokens": 32000,
        "gen_ai.request.temperature": TEMPERATURE,
        "gen_ai.request.messages": JSON.stringify([
          { role: "user", content: prompt.slice(0, 500) }
        ]),
      },
    },
    async (span) => {
      try {
        const client = getAnthropicClient();

        const response = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 32000,
          temperature: TEMPERATURE,
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block as Anthropic.TextBlock).text)
          .join("\n");

        const latency = Date.now() - startTime;
        console.log(`[Claude] Fast question generation: ${latency}ms, ${response.usage.input_tokens}in/${response.usage.output_tokens}out`);

        // Set Sentry span attributes for AI monitoring
        span.setAttribute("gen_ai.usage.input_tokens", response.usage.input_tokens);
        span.setAttribute("gen_ai.usage.output_tokens", response.usage.output_tokens);
        span.setAttribute("gen_ai.usage.total_tokens", response.usage.input_tokens + response.usage.output_tokens);
        span.setAttribute("gen_ai.response.text", JSON.stringify([content.slice(0, 500)]));

        return {
          content,
          latency,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (error) {
        console.error("Error in generateQuestionFast:", error);
        Sentry.captureException(error);
        throw new Error(
          `Fast question generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  );
}

/**
 * Export the model name for reference
 */
export const CURRENT_MODEL = CLAUDE_MODEL;
export const FAST_MODEL = HAIKU_MODEL;
