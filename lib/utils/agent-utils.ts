/**
 * Combined Agent Utilities
 *
 * Centralized utilities for all Claude API interactions:
 * - Caching: System prompts, messages, tool definitions (ALWAYS enabled)
 * - Client: Pre-configured Anthropic client with caching and optional LangSmith tracing
 * - Metrics: Standardized cache and token tracking
 *
 * This module consolidates patterns from:
 * - lib/agents/coding-agent.ts (buildSystemPromptWithCaching)
 * - lib/agent-security.ts (sanitizeMessages with cache breakpoints)
 * - lib/services/claude.ts (buildChatSystemPromptWithCaching)
 * - lib/observability/langsmith.ts (getTracedAnthropicClient)
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  TextBlockParam,
  Message,
} from '@anthropic-ai/sdk/resources/messages';
import { getTracedAnthropicClient } from '@/lib/observability/langsmith';
import { AGENT_MODEL_RECOMMENDATIONS } from '@/lib/constants/models';

// Re-export resilience utilities for convenience
export { retry, isRetryableError } from './resilience';
export type { RetryOptions } from './resilience';

// ============================================================================
// Types
// ============================================================================

/**
 * Cache metrics extracted from API response
 */
export interface CacheMetrics {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheSavingsPercent: number;
}

/**
 * Configuration for creating an agent client
 */
export interface AgentClientConfig {
  /** Thread ID for LangSmith tracing (typically sessionId) */
  threadId?: string;
}

/**
 * Model pricing per million tokens (used for cost calculations)
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
};

// ============================================================================
// Caching Utilities
// ============================================================================

/**
 * Build system prompt with cache_control on static parts
 * Caching is ALWAYS enabled - no conditional checks
 *
 * @param staticContent - Static instructions that rarely change (cached)
 * @param dynamicContent - Dynamic context like problem descriptions (not cached)
 * @returns Array of TextBlockParam with appropriate cache_control markers
 *
 * @example
 * ```typescript
 * const systemPrompt = buildCachedSystemPrompt(
 *   'You are an expert code evaluator...',
 *   `Current problem: ${problemTitle}`
 * );
 * ```
 */
export function buildCachedSystemPrompt(
  staticContent: string,
  dynamicContent?: string
): TextBlockParam[] {
  const blocks: TextBlockParam[] = [
    {
      type: 'text',
      text: staticContent,
      // Always cache static content - no conditional
      cache_control: { type: 'ephemeral' },
    } as TextBlockParam,
  ];

  if (dynamicContent) {
    blocks.push({
      type: 'text',
      text: dynamicContent,
      // Dynamic content is NOT cached as it changes per request
    });
  }

  return blocks;
}

/**
 * Add cache breakpoints to conversation messages
 * Adds cache_control to the last assistant message before the current turn
 *
 * This is the optimal caching strategy:
 * - All previous context is cached
 * - New user message is added to the cached prefix
 * - Results in ~90% cost savings on input tokens
 *
 * @param messages - Conversation messages
 * @returns Messages with cache_control markers added
 */
export function addMessageCacheBreakpoints(
  messages: MessageParam[]
): MessageParam[] {
  // Need at least 4 messages for caching to be effective
  // (system prompt caching handles smaller conversations)
  if (messages.length < 4) {
    return messages;
  }

  // Find the last assistant message before the final user message
  let lastAssistantIndex = -1;
  for (let i = messages.length - 2; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex === -1) {
    return messages;
  }

  // Create a copy of messages with cache_control added
  return messages.map((msg, index) => {
    if (index !== lastAssistantIndex) {
      return msg;
    }

    const content = msg.content;

    // For string content, wrap in content block with cache_control
    if (typeof content === 'string') {
      return {
        role: msg.role,
        content: [
          {
            type: 'text' as const,
            text: content,
            cache_control: { type: 'ephemeral' },
          },
        ],
      };
    }

    // For array content (tool_use, tool_result blocks), add cache to last block
    if (Array.isArray(content) && content.length > 0) {
      const contentCopy = [...content];
      const lastBlock = { ...contentCopy[contentCopy.length - 1] };
      (lastBlock as any).cache_control = { type: 'ephemeral' };
      contentCopy[contentCopy.length - 1] = lastBlock;
      return {
        role: msg.role,
        content: contentCopy,
      };
    }

    return msg;
  });
}

/**
 * Prepare messages for API call with both security sanitization and caching
 * Combines functionality from agent-security.ts sanitizeMessages
 *
 * @param messages - Raw conversation messages
 * @returns Sanitized messages with cache breakpoints
 */
export function prepareMessagesForAPI(messages: MessageParam[]): MessageParam[] {
  // Filter and sanitize messages
  const sanitized = messages
    .filter((msg) => {
      // Only allow user and assistant roles
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        return false;
      }

      // Prevent special token injection
      if (typeof msg.content === 'string') {
        const content = msg.content;
        const dangerousTokens = [
          '<|im_start|>',
          '<|im_end|>',
          '<|system|>',
          '\\n\\nHuman:',
          '\\n\\nAssistant:',
        ];
        if (dangerousTokens.some((token) => content.includes(token))) {
          return false;
        }
      }

      return true;
    })
    .map((msg) => ({
      role: msg.role,
      content:
        typeof msg.content === 'string'
          ? msg.content.substring(0, 10000) // Max message length
          : msg.content,
    }));

  // Add cache breakpoints
  return addMessageCacheBreakpoints(sanitized);
}

// ============================================================================
// Client Utilities
// ============================================================================

/**
 * Create an Anthropic client with caching always enabled
 * Optionally integrates LangSmith tracing
 *
 * @param config - Optional configuration
 * @returns Configured Anthropic client
 */
export function createAgentClient(config?: AgentClientConfig): Anthropic {
  // Use the traced client which already includes caching headers
  return getTracedAnthropicClient(config?.threadId);
}

/**
 * Get the recommended model for a specific agent type
 */
export function getRecommendedModel(
  agentType: keyof typeof AGENT_MODEL_RECOMMENDATIONS
): string {
  return AGENT_MODEL_RECOMMENDATIONS[agentType];
}

// ============================================================================
// Metrics Utilities
// ============================================================================

/**
 * Extract cache metrics from API response
 *
 * @param response - Claude API response
 * @returns Extracted cache metrics
 */
export function extractCacheMetrics(response: Message): CacheMetrics {
  // Anthropic SDK types don't include cache fields yet, so cast to any
  const usage = response.usage as any;

  const cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadInputTokens = usage.cache_read_input_tokens || 0;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;

  // Calculate cache savings percentage
  // Cache reads are 90% cheaper than regular input tokens
  const totalInputTokens = inputTokens;
  const cacheSavingsPercent =
    totalInputTokens > 0
      ? Math.round((cacheReadInputTokens / totalInputTokens) * 90)
      : 0;

  return {
    cacheCreationInputTokens,
    cacheReadInputTokens,
    inputTokens,
    outputTokens,
    cacheSavingsPercent,
  };
}

/**
 * Log cache performance with context
 *
 * @param metrics - Cache metrics from extractCacheMetrics
 * @param context - Context string (e.g., agent name)
 */
export function logCacheMetrics(metrics: CacheMetrics, context: string): void {
  if (metrics.cacheCreationInputTokens > 0 || metrics.cacheReadInputTokens > 0) {
    console.log(
      `[${context}] Cache metrics - ` +
      `created: ${metrics.cacheCreationInputTokens}, ` +
      `read: ${metrics.cacheReadInputTokens}, ` +
      `savings: ~${metrics.cacheSavingsPercent}%`
    );
  }
}

/**
 * Calculate estimated cost with cache savings
 *
 * @param metrics - Cache metrics
 * @param model - Model name
 * @returns Estimated cost in USD
 */
export function calculateCost(metrics: CacheMetrics, model: string): number {
  const pricing = MODEL_PRICING[model] || { input: 3.0, output: 15.0 };

  const CACHE_WRITE_MULTIPLIER = 1.25;
  const CACHE_READ_MULTIPLIER = 0.1;

  // Regular input tokens (excluding cache operations)
  const regularInputTokens =
    metrics.inputTokens -
    metrics.cacheCreationInputTokens -
    metrics.cacheReadInputTokens;

  const regularInputCost = (regularInputTokens / 1_000_000) * pricing.input;
  const cacheWriteCost =
    (metrics.cacheCreationInputTokens / 1_000_000) *
    pricing.input *
    CACHE_WRITE_MULTIPLIER;
  const cacheReadCost =
    (metrics.cacheReadInputTokens / 1_000_000) *
    pricing.input *
    CACHE_READ_MULTIPLIER;
  const outputCost = (metrics.outputTokens / 1_000_000) * pricing.output;

  return regularInputCost + cacheWriteCost + cacheReadCost + outputCost;
}

/**
 * Extract metrics from streaming response
 * Use after stream.finalMessage() to get complete usage data
 */
export function extractStreamingMetrics(finalMessage: Message): CacheMetrics {
  return extractCacheMetrics(finalMessage);
}
