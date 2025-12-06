/**
 * Agent Security Module
 *
 * Provides security guardrails for the Claude Agent SDK to prevent:
 * - Score/evaluation leakage
 * - Question/difficulty revelation
 * - Context injection attacks
 * - Excessive resource usage
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import {
  buildSecuritySystemPrompt,
  SECURITY_CONSTRAINTS_XML,
} from "@/lib/prompts/security-system";

/**
 * Build secure system prompt with anti-leakage guardrails
 * Uses XML-structured prompt from shared prompts folder
 */
export function buildSecureSystemPrompt(candidate: any): string {
  const question = candidate.generatedQuestions?.[0];

  return buildSecuritySystemPrompt({
    question: question
      ? {
          title: question.title,
          language: question.language,
          description: question.description,
        }
      : undefined,
  });
}

// Re-export for backward compatibility
export { SECURITY_CONSTRAINTS_XML };

/**
 * Sanitize tool output to hide evaluation metrics
 */
export function sanitizeToolOutput(toolName: string, output: any): any {
  switch (toolName) {
    case "run_tests":
      // Hide performance metrics, execution time, memory usage
      return {
        success: output.success,
        passed: output.passed,
        total: output.total,
        // REMOVED: executionTime, memoryUsage, complexityAnalysis, detailedErrors
        // Only show basic pass/fail to prevent gaming the system
        testResults: output.testResults?.map((test: any) => ({
          name: test.name,
          passed: test.passed,
          error: test.error, // Keep error messages for debugging
          // REMOVED: duration, output, hidden flag
        })),
      };

    case "execute_bash":
      // Sanitize bash output to prevent information leakage
      return {
        success: output.success,
        stdout: output.stdout?.substring(0, 5000), // Limit output size
        stderr: output.stderr?.substring(0, 5000),
        exitCode: output.exitCode,
        // REMOVED: duration, system info
      };

    case "read_file":
      // Prevent reading sensitive files
      const dangerousPatterns = [
        /\.env/i,
        /password/i,
        /secret/i,
        /token/i,
        /api[_-]?key/i,
        /credentials/i,
      ];

      if (dangerousPatterns.some(pattern => pattern.test(output.path))) {
        return {
          success: false,
          error: "Access denied: Cannot read sensitive files",
        };
      }

      return output;

    default:
      return output;
  }
}

/**
 * Sanitize user messages to prevent context injection
 * Optionally adds cache breakpoints for prompt caching optimization
 *
 * Cache strategy:
 * - Add cache_control to the last assistant message before the current turn
 * - This caches all previous conversation context
 * - New messages get added to the cached prefix, saving 90% on input tokens
 *
 * @param messages - Conversation messages to sanitize
 * @param enableCaching - Whether to add cache breakpoints (default: true)
 */
export function sanitizeMessages(messages: any[], enableCaching: boolean = true): any[] {
  const filtered = messages
    .filter(msg => {
      // Only allow user and assistant roles
      if (msg.role !== "user" && msg.role !== "assistant") {
        return false;
      }

      // Prevent special token injection
      if (typeof msg.content === "string") {
        const dangerousTokens = [
          "<|im_start|>",
          "<|im_end|>",
          "<|system|>",
          "\\n\\nHuman:",
          "\\n\\nAssistant:",
        ];

        if (dangerousTokens.some(token => msg.content.includes(token))) {
          return false;
        }
      }

      return true;
    });

  // If caching is disabled or not enough messages, just return sanitized messages
  if (!enableCaching || filtered.length < 4) {
    return filtered.map(msg => ({
      role: msg.role,
      content: typeof msg.content === "string"
        ? msg.content.substring(0, 10000) // Max message length
        : msg.content,
    }));
  }

  // Find the last assistant message before the final user message
  // This is the optimal cache breakpoint
  let lastAssistantIndex = -1;
  for (let i = filtered.length - 2; i >= 0; i--) {
    if (filtered[i].role === "assistant") {
      lastAssistantIndex = i;
      break;
    }
  }

  return filtered.map((msg, index) => {
    const sanitizedContent = typeof msg.content === "string"
      ? msg.content.substring(0, 10000) // Max message length
      : msg.content;

    // Add cache breakpoint to the last assistant message before current turn
    if (enableCaching && index === lastAssistantIndex) {
      // For string content, wrap in content block with cache_control
      if (typeof sanitizedContent === "string") {
        return {
          role: msg.role,
          content: [
            {
              type: "text",
              text: sanitizedContent,
              cache_control: { type: "ephemeral" },
            },
          ],
        };
      }
      // For array content (tool_use, tool_result blocks), add cache to last block
      if (Array.isArray(sanitizedContent) && sanitizedContent.length > 0) {
        const contentCopy = [...sanitizedContent];
        const lastBlock = { ...contentCopy[contentCopy.length - 1] };
        lastBlock.cache_control = { type: "ephemeral" };
        contentCopy[contentCopy.length - 1] = lastBlock;
        return {
          role: msg.role,
          content: contentCopy,
        };
      }
    }

    return {
      role: msg.role,
      content: sanitizedContent,
    };
  });
}

/**
 * Validate bash command for security
 */
export function validateBashCommand(command: string): { safe: boolean; reason?: string } {
  // Dangerous command patterns
  const dangerousPatterns = [
    /rm\s+-rf/i,
    /:\(\)\{/,  // Fork bomb
    /mkfs/i,
    /dd\s+if=/i,
    /wget|curl.*\|.*sh/i,  // Remote script execution
    /nc\s+-l/i,  // Netcat listener
    />\/dev\/sd/i,  // Direct disk write
    /chmod\s+777/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        safe: false,
        reason: "Command contains potentially dangerous operations",
      };
    }
  }

  // Check for directory traversal
  if (command.includes("../") && !command.startsWith("cd")) {
    return {
      safe: false,
      reason: "Directory traversal detected",
    };
  }

  return { safe: true };
}

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  MAX_MESSAGES_PER_QUESTION: 50,
  MAX_TOOL_CALLS_PER_QUESTION: 100,
  MAX_MESSAGE_LENGTH: 10000,
  MAX_CONVERSATION_TOKENS: 50000, // Rough estimate
};

/**
 * Check if rate limit is exceeded
 */
export function checkRateLimit(messages: any[]): { exceeded: boolean; reason?: string } {
  const userMessages = messages.filter(m => m.role === "user");

  if (userMessages.length > RATE_LIMITS.MAX_MESSAGES_PER_QUESTION) {
    return {
      exceeded: true,
      reason: `Message limit exceeded (${RATE_LIMITS.MAX_MESSAGES_PER_QUESTION} max per question)`,
    };
  }

  // Rough token estimate (4 chars per token)
  const totalChars = messages.reduce((sum, m) =>
    sum + (typeof m.content === "string" ? m.content.length : 0), 0
  );
  const estimatedTokens = totalChars / 4;

  if (estimatedTokens > RATE_LIMITS.MAX_CONVERSATION_TOKENS) {
    return {
      exceeded: true,
      reason: "Conversation too long - please start a new question",
    };
  }

  return { exceeded: false };
}
