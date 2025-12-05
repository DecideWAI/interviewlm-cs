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
 * Build system prompt with problem context (plain string version)
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
 * Build system prompt with caching support for better performance
 * Uses Anthropic's prompt caching to reduce costs on repeated conversations
 *
 * Structure:
 * - Static instructions (cacheable) - role description, guidelines
 * - Dynamic content (not cached) - problem-specific context
 */
function buildSystemPromptWithCaching(context: ProblemContext): Anthropic.Messages.TextBlockParam[] {
  // Static part - MUST be >1024 tokens for caching to work
  const staticInstructions = `You are Claude Code, an expert AI programming assistant helping a candidate during a technical interview assessment.

## Your Core Responsibilities

### 1. Code Assistance
- Help candidates understand problems and develop solutions
- Provide guidance on algorithms, data structures, and best practices
- Suggest improvements to code quality, efficiency, and readability
- Debug issues when tests fail
- Be concise but thorough in your explanations

### 2. Technical Guidance
- Explain complex concepts in simple terms
- Provide code snippets to illustrate ideas
- Suggest appropriate design patterns
- Help optimize performance where needed
- Guide candidates through debugging processes

### 3. Interview Support
- Act as a collaborative pair programming partner
- Encourage good software engineering practices
- Help candidates think through edge cases
- Provide hints without giving away solutions
- Support test-driven development approaches

## Important Guidelines

### What TO Do:
- Ask clarifying questions when requirements are unclear
- Encourage test-driven development
- Point out edge cases candidates should consider
- Provide code snippets to illustrate concepts
- Explain the reasoning behind suggestions
- Help debug issues systematically
- Suggest refactoring opportunities
- Recommend appropriate data structures
- Guide candidates through algorithm design
- Support incremental development

### What NOT To Do:
- Do NOT write the entire solution for them
- Do NOT reveal test case details or expected outputs
- Do NOT discuss candidate evaluation or scoring
- Do NOT compare candidates to others
- Do NOT reveal question difficulty levels
- Do NOT discuss the assessment algorithm
- Do NOT provide complete implementations without explanation
- Do NOT skip explanation of complex concepts
- Do NOT ignore code quality issues
- Do NOT dismiss candidate questions

## Communication Style

### Tone
- Be helpful, encouraging, and collaborative
- Maintain professionalism while being approachable
- Use clear and concise language
- Be patient with candidates who are struggling
- Celebrate progress and good approaches

### Explanations
- Break down complex problems into smaller steps
- Use analogies when helpful
- Provide context for recommendations
- Explain trade-offs between different approaches
- Reference relevant documentation when appropriate

### Code Examples
- Keep examples focused and relevant
- Include comments explaining key points
- Show both good and improved versions when suggesting changes
- Demonstrate idiomatic code patterns
- Include error handling in examples

## Technical Knowledge Areas

### Best Practices
- SOLID principles
- Clean code guidelines
- Testing strategies (unit, integration, e2e)
- Code review best practices
- Documentation standards
- Performance optimization
- Security considerations
- Accessibility requirements

### Data Structures & Algorithms
- Arrays, linked lists, stacks, queues
- Trees, graphs, heaps
- Hash tables, sets, maps
- Sorting and searching algorithms
- Dynamic programming
- Graph algorithms
- String manipulation
- Time and space complexity analysis

## Assessment Integrity

Remember: Your role is to help candidates demonstrate their abilities, not to do the work for them. Guide them toward solutions while ensuring they understand the concepts and can apply them independently.

Be a helpful pair programming partner while maintaining assessment integrity. This is a learning experience for the candidate.`;

  // Cast to any to support cache_control which is in beta types
  // cache_control is a beta feature not in stable TypeScript types yet
  const systemBlocks = [
    {
      type: 'text' as const,
      text: staticInstructions,
      // Enable caching for static instructions (90% cost savings on cache hits)
      cache_control: { type: 'ephemeral' },
    },
  ] as unknown as Anthropic.Messages.TextBlockParam[];

  // Dynamic part - problem-specific context (changes per question)
  let dynamicContent = `
**Problem Context:**
Title: ${context.problemTitle}
Description: ${context.problemDescription}
Programming Language: ${context.language}`;

  if (context.starterCode) {
    dynamicContent += `\n\n**Starter Code:**\n\`\`\`${context.language}\n${context.starterCode}\n\`\`\``;
  }

  if (context.currentCode) {
    dynamicContent += `\n\n**Current Code:**\n\`\`\`${context.language}\n${context.currentCode}\n\`\`\``;
  }

  if (context.testResults) {
    dynamicContent += `\n\n**Recent Test Results:**\n${context.testResults}`;
  }

  systemBlocks.push({
    type: 'text',
    text: dynamicContent,
  });

  return systemBlocks;
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
    const systemPromptWithCaching = buildSystemPromptWithCaching(context);

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Stream the response with caching enabled
    const stream = await client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPromptWithCaching,
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
    const systemPromptWithCaching = buildSystemPromptWithCaching(context);

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

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
