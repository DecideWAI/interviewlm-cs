/**
 * LangSmith Observability Integration
 *
 * Provides automatic tracing for Claude API calls using LangSmith.
 * All agent interactions, tool uses, and responses are captured for monitoring.
 *
 * Uses RunTree for proper parent-child trace hierarchies with thread support.
 */

import { wrapSDK } from "langsmith/wrappers";
import { traceable } from "langsmith/traceable";
import { Client } from "langsmith";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";

// LangSmith client singleton
let langsmithClient: Client | null = null;

// Check if LangSmith is enabled
const isLangSmithEnabled = (): boolean => {
  return process.env.LANGSMITH_TRACING === "true" && !!process.env.LANGSMITH_API_KEY;
};

/**
 * Get or create LangSmith client
 */
function getLangSmithClient(): Client | null {
  if (!isLangSmithEnabled()) {
    return null;
  }

  if (!langsmithClient) {
    langsmithClient = new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
      apiUrl: process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
    });
  }
  return langsmithClient;
}

// Singleton for the base Anthropic client (not wrapped - we wrap per-call for context)
let baseClient: Anthropic | null = null;

// Store for wrapped clients per thread to ensure proper context
const wrappedClients = new Map<string, Anthropic>();

/**
 * Get the base Anthropic client
 */
function getBaseAnthropicClient(): Anthropic {
  if (!baseClient) {
    baseClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultHeaders: {
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
    });
  }
  return baseClient;
}

/**
 * Get an Anthropic client with LangSmith tracing enabled
 * Falls back to regular client if LangSmith is not configured
 *
 * @param threadId - Optional thread ID to group traces (use sessionId)
 */
export function getTracedAnthropicClient(threadId?: string): Anthropic {
  const client = getBaseAnthropicClient();

  if (isLangSmithEnabled()) {
    try {
      // Check if we already have a wrapped client for this thread
      const cacheKey = threadId || "default";
      let wrappedClient = wrappedClients.get(cacheKey);

      if (!wrappedClient) {
        // Wrap with SDK wrapper - this will pick up parent context from traceable
        wrappedClient = wrapSDK(client, {
          name: "anthropic",
          runName: threadId ? `claude-${threadId.slice(0, 8)}` : "claude",
          metadata: threadId ? { thread_id: threadId } : undefined,
        });
        wrappedClients.set(cacheKey, wrappedClient);

        // Limit cache size
        if (wrappedClients.size > 100) {
          const firstKey = wrappedClients.keys().next().value;
          if (firstKey) wrappedClients.delete(firstKey);
        }
      }

      return wrappedClient;
    } catch (error) {
      logger.warn("[LangSmith] Failed to wrap SDK, using untraced client", { error });
      return client;
    }
  }

  return client;
}

// Current thread context for nested traces
let currentThreadId: string | null = null;
let currentRunId: string | null = null;

/**
 * Generate a unique run ID for each message turn
 * Format: {sessionId}-{timestamp}-{random}
 */
function generateRunId(sessionId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${sessionId.slice(0, 8)}-${timestamp}-${random}`;
}

/**
 * Create a parent trace for an agent turn (single chat message)
 * All child operations (API calls, tool executions) will be grouped under this trace
 *
 * Uses:
 * - thread_id (sessionId) to group all traces from the same session together
 * - run_id (unique per message) to identify each chat turn
 */
export async function withAgentTrace<T>(
  name: string,
  metadata: {
    sessionId: string;
    candidateId: string;
    message?: string;
    messageId?: string; // Optional: provide a specific message ID
  },
  fn: () => Promise<T>
): Promise<T> {
  if (!isLangSmithEnabled()) {
    return fn();
  }

  // Set thread context for child traces
  const previousThreadId = currentThreadId;
  const previousRunId = currentRunId;

  currentThreadId = metadata.sessionId;
  // Generate unique run ID for this message, or use provided messageId
  currentRunId = metadata.messageId || generateRunId(metadata.sessionId);

  try {
    // Create a traceable wrapper that will be the parent for all child operations
    const traced = traceable(fn, {
      name,
      run_type: "chain",
      project_name: process.env.LANGSMITH_PROJECT || "interviewlm",
      id: currentRunId, // Unique ID for this message turn
      metadata: {
        component: "CodingAgent",
        sessionId: metadata.sessionId,
        candidateId: metadata.candidateId,
        thread_id: metadata.sessionId, // Group by session (thread)
        run_id: currentRunId, // Unique per message
        message_preview: metadata.message?.slice(0, 100), // First 100 chars of message
      },
      tags: [
        "agent",
        "interview",
        `thread:${metadata.sessionId.slice(0, 8)}`,
        `run:${currentRunId.slice(0, 12)}`,
      ],
    });

    return await traced();
  } finally {
    // Restore previous context
    currentThreadId = previousThreadId;
    currentRunId = previousRunId;
  }
}

/**
 * Trace a tool execution within the current context
 * Will be nested under the parent agent trace if one exists
 */
export async function traceToolExecution<T>(
  toolName: string,
  input: Record<string, unknown>,
  executor: () => Promise<T>
): Promise<T> {
  if (!isLangSmithEnabled()) {
    return executor();
  }

  const traced = traceable(
    async () => {
      const startTime = Date.now();
      try {
        const result = await executor();
        const duration = Date.now() - startTime;
        logger.debug(`[LangSmith] Tool ${toolName} completed in ${duration}ms`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[LangSmith] Tool ${toolName} failed after ${duration}ms`, error as Error);
        throw error;
      }
    },
    {
      name: `tool:${toolName}`,
      run_type: "tool",
      project_name: process.env.LANGSMITH_PROJECT || "interviewlm",
      metadata: {
        tool: toolName,
        input: JSON.stringify(input).slice(0, 1000), // Truncate large inputs
        thread_id: currentThreadId, // Link to parent thread
        parent_run_id: currentRunId, // Link to parent message turn
      },
    }
  );

  return traced();
}

/**
 * Trace an agent session - wraps the entire message handling
 * This is the top-level trace that groups all operations for a single message
 *
 * @param sessionId - Session ID (used as thread_id to group messages)
 * @param candidateId - Candidate ID
 * @param executor - The async function to execute
 * @param options - Optional: message content, custom messageId
 */
export async function traceAgentSession<T>(
  sessionId: string,
  candidateId: string,
  executor: () => Promise<T>,
  options?: {
    message?: string;
    messageId?: string;
  }
): Promise<T> {
  return withAgentTrace(
    "agent_turn",
    {
      sessionId,
      candidateId,
      message: options?.message,
      messageId: options?.messageId,
    },
    executor
  );
}

/**
 * Trace an API call to Claude
 * Will be nested under the parent agent trace if one exists
 */
export async function traceClaudeCall<T>(
  operation: string,
  executor: () => Promise<T>
): Promise<T> {
  if (!isLangSmithEnabled()) {
    return executor();
  }

  const traced = traceable(executor, {
    name: `claude:${operation}`,
    run_type: "llm",
    project_name: process.env.LANGSMITH_PROJECT || "interviewlm",
    metadata: {
      provider: "anthropic",
      operation,
      thread_id: currentThreadId, // Link to parent thread
      parent_run_id: currentRunId, // Link to parent message turn
    },
  });

  return traced();
}

/**
 * Get current thread ID (useful for manual tracing)
 */
export function getCurrentThreadId(): string | null {
  return currentThreadId;
}

/**
 * Get current run ID (useful for manual tracing)
 */
export function getCurrentRunId(): string | null {
  return currentRunId;
}

/**
 * Get LangSmith configuration status
 */
export function getLangSmithStatus(): {
  enabled: boolean;
  project: string;
  endpoint: string;
} {
  return {
    enabled: isLangSmithEnabled(),
    project: process.env.LANGSMITH_PROJECT || "default",
    endpoint: process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
  };
}

/**
 * Initialize LangSmith (call at app startup)
 */
export function initializeLangSmith(): void {
  const status = getLangSmithStatus();

  if (status.enabled) {
    logger.info("[LangSmith] Observability initialized", {
      project: status.project,
      endpoint: status.endpoint,
    });
  } else {
    logger.info("[LangSmith] Observability not enabled. Set LANGSMITH_TRACING=true to enable.");
  }
}
