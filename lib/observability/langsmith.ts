/**
 * LangSmith Observability Integration
 *
 * Provides automatic tracing for Claude API calls using LangSmith.
 * All agent interactions, tool uses, and responses are captured for monitoring.
 *
 * Uses RunTree for proper parent-child trace hierarchies.
 */

import { wrapSDK } from "langsmith/wrappers";
import { traceable, getCurrentRunTree } from "langsmith/traceable";
import { RunTree } from "langsmith";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";

// Check if LangSmith is enabled
const isLangSmithEnabled = (): boolean => {
  return process.env.LANGSMITH_TRACING === "true" && !!process.env.LANGSMITH_API_KEY;
};

// Singleton for the base Anthropic client (not wrapped - we wrap per-call for context)
let baseClient: Anthropic | null = null;

/**
 * Get the base Anthropic client
 */
function getBaseAnthropicClient(): Anthropic {
  if (!baseClient) {
    baseClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return baseClient;
}

/**
 * Get an Anthropic client with LangSmith tracing enabled
 * Falls back to regular client if LangSmith is not configured
 */
export function getTracedAnthropicClient(): Anthropic {
  const client = getBaseAnthropicClient();

  if (isLangSmithEnabled()) {
    try {
      // Wrap with SDK wrapper - this will pick up parent context from traceable
      return wrapSDK(client, { name: "anthropic" });
    } catch (error) {
      logger.warn("[LangSmith] Failed to wrap SDK, using untraced client", { error });
      return client;
    }
  }

  return client;
}

/**
 * Create a parent trace for an agent turn
 * All child operations (API calls, tool executions) will be grouped under this trace
 */
export async function withAgentTrace<T>(
  name: string,
  metadata: {
    sessionId: string;
    candidateId: string;
    message?: string;
  },
  fn: () => Promise<T>
): Promise<T> {
  if (!isLangSmithEnabled()) {
    return fn();
  }

  // Create a traceable wrapper that will be the parent for all child operations
  const traced = traceable(fn, {
    name,
    run_type: "chain",
    metadata: {
      component: "CodingAgent",
      sessionId: metadata.sessionId,
      candidateId: metadata.candidateId,
    },
    tags: ["agent", "interview"],
  });

  return traced();
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
      metadata: {
        tool: toolName,
        input: JSON.stringify(input).slice(0, 1000), // Truncate large inputs
      },
    }
  );

  return traced();
}

/**
 * Trace an agent session - wraps the entire message handling
 */
export async function traceAgentSession<T>(
  sessionId: string,
  candidateId: string,
  executor: () => Promise<T>
): Promise<T> {
  return withAgentTrace(
    "agent_turn",
    { sessionId, candidateId },
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
    metadata: {
      provider: "anthropic",
      operation,
    },
  });

  return traced();
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
