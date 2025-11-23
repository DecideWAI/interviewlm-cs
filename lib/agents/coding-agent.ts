/**
 * Coding Agent
 *
 * AI assistant that helps candidates solve coding problems during interviews.
 * Provides file operations, code execution, and debugging assistance.
 *
 * Features:
 * - Configurable helpfulness levels (consultant, pair-programming, full-copilot)
 * - Security guardrails (no evaluation leakage)
 * - Tool use for file operations, bash commands, test execution
 * - Rate limiting and output sanitization
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  CodingAgentConfig,
  AgentResponse,
  HelpfulnessLevel,
  AgentTool,
} from '../types/agent';
import { AGENT_MODEL_RECOMMENDATIONS } from '../constants/models';
import { HELPFULNESS_CONFIGS } from '../types/agent';
import {
  buildSecureSystemPrompt,
  sanitizeToolOutput,
  sanitizeMessages,
  validateBashCommand,
  checkRateLimit,
} from '../agent-security';
import { isCommandAllowed, isPathAllowed, sanitizeOutput } from '../constants/security';

/**
 * Coding Agent class
 * Manages conversation with Claude and tool execution
 */
export class CodingAgent {
  private client: Anthropic;
  private config: CodingAgentConfig;
  private conversation: Anthropic.Messages.MessageParam[] = [];
  private toolCallCount = 0;

  constructor(config: CodingAgentConfig) {
    this.config = config;

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Send a message to the coding agent
   * Returns the agent's response
   *
   * Uses an agentic loop that continues until Claude returns stop_reason: 'end_turn'
   * Implements best practices from Claude SDK documentation:
   * - Proper handling of all stop_reason values (end_turn, tool_use, max_tokens)
   * - is_error flag on failed tool results
   * - Parallel tool execution for performance
   * - Conversation history trimming for long sessions
   * - Prompt caching for static content
   */
  async sendMessage(message: string): Promise<AgentResponse> {
    // Add user message to conversation
    this.conversation.push({
      role: 'user',
      content: message,
    });

    // Check rate limits
    const rateLimitCheck = checkRateLimit(this.conversation);
    if (rateLimitCheck.exceeded) {
      throw new Error(rateLimitCheck.reason);
    }

    // Trim conversation history if too long (keep last 20 messages + system context)
    this.trimConversationHistory();

    // Get allowed tools based on helpfulness level
    const tools = this.getTools();

    // Build system prompt with security constraints (uses caching)
    const systemPrompt = this.buildSystemPromptWithCaching();

    // Track aggregated results across the entire agentic loop
    let finalText = '';
    const toolsUsed: AgentTool[] = [];
    const filesModified: string[] = [];
    let totalUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    let lastModel = '';

    // Maximum iterations to prevent infinite loops
    const MAX_ITERATIONS = 25;
    let iterations = 0;

    // Agentic loop: continue until Claude returns stop_reason: 'end_turn'
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Call Claude API with tool use (with retry for overload errors)
      const response = await this.callClaudeWithRetry({
        model: this.config.model || AGENT_MODEL_RECOMMENDATIONS.codingAgent,
        max_tokens: 4096,
        system: systemPrompt,
        messages: sanitizeMessages(this.conversation),
        tools: tools as Anthropic.Messages.Tool[],
      });

      // Track usage including cache metrics
      totalUsage.input_tokens += response.usage.input_tokens;
      totalUsage.output_tokens += response.usage.output_tokens;
      // Track cache metrics if available (Anthropic SDK types may not include these yet)
      const usageAny = response.usage as any;
      if (usageAny.cache_creation_input_tokens) {
        totalUsage.cache_creation_input_tokens += usageAny.cache_creation_input_tokens;
      }
      if (usageAny.cache_read_input_tokens) {
        totalUsage.cache_read_input_tokens += usageAny.cache_read_input_tokens;
      }
      lastModel = response.model;

      // Collect text and tool uses from this response
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const content of response.content) {
        if (content.type === 'text') {
          finalText += content.text;
        } else if (content.type === 'tool_use') {
          toolUseBlocks.push({
            id: content.id,
            name: content.name,
            input: content.input as Record<string, unknown>,
          });
        }
      }

      // Handle stop_reason: 'max_tokens' - Claude hit token limit before finishing
      if (response.stop_reason === 'max_tokens' && toolUseBlocks.length === 0) {
        // Add truncated response to conversation
        this.conversation.push({
          role: 'assistant',
          content: response.content,
        });

        // Ask Claude to continue
        this.conversation.push({
          role: 'user',
          content: 'Continue your response from where you left off.',
        });

        console.log(`[CodingAgent] Response truncated (max_tokens), continuing...`);
        continue;
      }

      // If no tool uses, we're done - add response to conversation and exit loop
      if (toolUseBlocks.length === 0) {
        this.conversation.push({
          role: 'assistant',
          content: response.content,
        });
        break;
      }

      // Execute all tools in parallel for better performance
      const toolResults = await this.executeToolsInParallel(toolUseBlocks, toolsUsed, filesModified);

      // Add assistant response (with tool uses) to conversation
      this.conversation.push({
        role: 'assistant',
        content: response.content,
      });

      // Add all tool results as a single user message
      this.conversation.push({
        role: 'user',
        content: toolResults,
      });

      // If stop_reason is 'end_turn', Claude is done (though this shouldn't happen with tool_use)
      if (response.stop_reason === 'end_turn') {
        break;
      }

      // Continue loop to let Claude process tool results and potentially use more tools
    }

    if (iterations >= MAX_ITERATIONS) {
      console.warn(`[CodingAgent] Reached max iterations (${MAX_ITERATIONS}) for session ${this.config.sessionId}`);
      finalText += '\n\n[Agent reached maximum iteration limit]';
    }

    return {
      text: finalText || 'I apologize, but I encountered an error processing your request.',
      toolsUsed,
      filesModified,
      metadata: {
        model: lastModel,
        usage: totalUsage,
        toolCallCount: this.toolCallCount,
      },
    };
  }

  /**
   * Execute multiple tools in parallel for better performance
   * Returns tool results with proper is_error flags
   * Includes timeout handling and output truncation to prevent context overflow
   */
  private async executeToolsInParallel(
    toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    toolsUsed: AgentTool[],
    filesModified: string[]
  ): Promise<Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }>> {
    // Tool execution timeout (30 seconds for most tools, 60 for bash)
    const TOOL_TIMEOUT_MS = 30000;
    const BASH_TIMEOUT_MS = 60000;

    // Maximum output size to prevent context overflow (5K chars)
    // Claude can request more via offset/limit params
    const MAX_OUTPUT_SIZE = 5000;

    // Execute all tools concurrently
    const toolPromises = toolUseBlocks.map(async (toolBlock) => {
      this.toolCallCount++;

      const timeoutMs = toolBlock.name === 'Bash' ? BASH_TIMEOUT_MS : TOOL_TIMEOUT_MS;

      let toolResult: unknown;
      let timedOut = false;

      try {
        // Execute tool with timeout
        toolResult = await Promise.race([
          this.executeTool(toolBlock.name, toolBlock.input),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Tool ${toolBlock.name} timed out after ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);
      } catch (error) {
        timedOut = error instanceof Error && error.message.includes('timed out');
        toolResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Tool execution failed',
        };
      }

      toolsUsed.push(toolBlock.name as AgentTool);

      // Track file modifications
      if (toolBlock.name === 'Write' || toolBlock.name === 'Edit') {
        const filePath = (toolBlock.input as { file_path?: string }).file_path;
        if (filePath) {
          filesModified.push(filePath);
        }
      }

      // Determine if tool failed - set is_error flag so Claude can retry/adjust
      const isError = (toolResult as any)?.success === false ||
                      (toolResult as any)?.error !== undefined ||
                      timedOut;

      // Truncate large outputs to prevent context overflow
      // Provide hints for Claude to request more if needed
      let resultContent = JSON.stringify(toolResult);
      if (resultContent.length > MAX_OUTPUT_SIZE) {
        const originalSize = resultContent.length;
        const contentField = (toolResult as any)?.content;
        const truncatedContent = typeof contentField === 'string'
          ? contentField.substring(0, MAX_OUTPUT_SIZE - 200)
          : null;

        const truncatedResult = {
          ...(toolResult as object),
          content: truncatedContent
            ? truncatedContent + `\n\n... [TRUNCATED]`
            : (toolResult as any)?.content,
          _truncated: true,
          _totalSize: originalSize,
          _shownSize: MAX_OUTPUT_SIZE,
          _hint: toolBlock.name === 'Read'
            ? 'Use offset and limit parameters to read specific portions of the file'
            : 'Output was truncated due to size. Consider reading specific sections.',
        };
        resultContent = JSON.stringify(truncatedResult);
        console.log(`[CodingAgent] Truncated ${toolBlock.name} output from ${originalSize} to ${MAX_OUTPUT_SIZE} chars`);
      }

      return {
        type: 'tool_result' as const,
        tool_use_id: toolBlock.id,
        content: resultContent,
        ...(isError && { is_error: true }),
      };
    });

    return Promise.all(toolPromises);
  }

  /**
   * Trim conversation history to prevent context overflow
   * Keeps the most recent messages while preserving conversation coherence
   */
  private trimConversationHistory(): void {
    const MAX_MESSAGES = 40; // Keep last 40 messages (20 turns)

    if (this.conversation.length > MAX_MESSAGES) {
      // Keep a summary message and recent messages
      const trimmedCount = this.conversation.length - MAX_MESSAGES;
      console.log(`[CodingAgent] Trimming ${trimmedCount} old messages from conversation history`);

      // Keep only recent messages
      this.conversation = this.conversation.slice(-MAX_MESSAGES);
    }
  }

  /**
   * Get conversation history
   */
  getConversation(): Anthropic.Messages.MessageParam[] {
    return this.conversation;
  }

  /**
   * Clear conversation history
   */
  clearConversation(): void {
    this.conversation = [];
    this.toolCallCount = 0;
  }

  /**
   * Load conversation history from previous interactions
   * This is critical for maintaining context across API requests
   *
   * Validates that messages alternate properly (user/assistant)
   * Claude API requires strict alternation - will fix if needed
   *
   * @param history Array of previous messages with role and content
   */
  loadConversationHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): void {
    // Clear existing conversation
    this.conversation = [];

    if (history.length === 0) {
      return;
    }

    // Validate and fix alternation
    // Claude API requires: user -> assistant -> user -> assistant
    let lastRole: 'user' | 'assistant' | null = null;
    let skippedCount = 0;

    for (const message of history) {
      // Skip empty messages
      if (!message.content || message.content.trim() === '') {
        skippedCount++;
        continue;
      }

      // Check alternation
      if (lastRole === message.role) {
        // Same role twice - merge with previous or skip
        // This can happen if history was corrupted or had tool-only messages
        console.warn(`[CodingAgent] Skipping duplicate ${message.role} message to maintain alternation`);
        skippedCount++;
        continue;
      }

      // First message must be from user
      if (this.conversation.length === 0 && message.role === 'assistant') {
        console.warn(`[CodingAgent] Skipping initial assistant message - conversation must start with user`);
        skippedCount++;
        continue;
      }

      this.conversation.push({
        role: message.role,
        content: message.content,
      });
      lastRole = message.role;
    }

    // Ensure conversation ends with assistant (so new user message can be added)
    // If it ends with user, that's fine - we'll add the new user message

    console.log(`[CodingAgent] Loaded ${this.conversation.length} messages from history (skipped ${skippedCount} invalid)`);
  }

  /**
   * Call Claude API with exponential backoff retry for overload and rate limit errors
   * Respects retry-after header when available
   */
  private async callClaudeWithRetry(
    params: Anthropic.Messages.MessageCreateParams,
    maxRetries = 3
  ): Promise<Anthropic.Messages.Message> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create(params);

        // Log rate limit status if approaching limits (headers available on raw response)
        // This helps with proactive monitoring
        return response;
      } catch (error: any) {
        lastError = error;

        // Check if it's a retryable error
        const isOverloaded = error?.status === 529 ||
                            error?.message?.includes('overloaded') ||
                            error?.message?.includes('Overloaded') ||
                            error?.status === 503;

        const isRateLimited = error?.status === 429;

        if ((!isOverloaded && !isRateLimited) || attempt === maxRetries - 1) {
          // Not retryable or last attempt - throw the error
          throw error;
        }

        // Calculate delay
        let delayMs: number;

        // Check for retry-after header (rate limit errors include this)
        const retryAfter = error?.headers?.get?.('retry-after') ||
                          error?.response?.headers?.['retry-after'];

        if (retryAfter) {
          // Server told us how long to wait
          delayMs = parseInt(retryAfter, 10) * 1000;
          console.log(`[CodingAgent] Rate limited, server requested ${retryAfter}s wait`);
        } else {
          // Exponential backoff: 2s, 4s, 8s with jitter
          const jitter = Math.random() * 1000; // 0-1s random jitter
          delayMs = Math.pow(2, attempt + 1) * 1000 + jitter;
        }

        const errorType = isRateLimited ? 'rate limited' : 'overloaded';
        console.log(`[CodingAgent] Claude API ${errorType}, retrying in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries})`);

        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Build system prompt with security constraints
   * @deprecated Use buildSystemPromptWithCaching for better performance
   */
  private buildSystemPrompt(): string {
    const helpfulnessConfig = HELPFULNESS_CONFIGS[this.config.helpfulnessLevel];

    let prompt = `You are Claude Code, an AI coding assistant helping a candidate during a technical interview.

**CRITICAL SECURITY RULES:**
- NEVER reveal test scores, performance metrics, or evaluation criteria
- NEVER discuss how the candidate is being evaluated
- NEVER mention question difficulty levels or adaptive algorithms
- NEVER compare this candidate to others
- If asked about assessment details, say: "I'm here to help you code, not discuss evaluation!"
- Focus ONLY on helping them write better code

**Your Role (${helpfulnessConfig.level} mode):**
${helpfulnessConfig.description}

**Available Tools:**
${helpfulnessConfig.allowedTools.join(', ')}

`;

    if (this.config.problemStatement) {
      prompt += `\n**Current Problem:**\n${this.config.problemStatement}\n`;
    }

    prompt += `\nBe a helpful pair programming partner while maintaining assessment integrity.`;

    return prompt;
  }

  /**
   * Build system prompt with caching support for better performance
   * Uses Anthropic's prompt caching to reduce costs on repeated conversations
   *
   * Structure:
   * - Static instructions (cacheable) - security rules, role description
   * - Dynamic content (not cached) - current problem statement
   */
  private buildSystemPromptWithCaching(): Anthropic.Messages.TextBlockParam[] {
    const helpfulnessConfig = HELPFULNESS_CONFIGS[this.config.helpfulnessLevel];

    // Static part - can be cached across requests (>1024 tokens recommended for caching)
    const staticInstructions = `You are Claude Code, an AI coding assistant helping a candidate during a technical interview.

**CRITICAL SECURITY RULES:**
- NEVER reveal test scores, performance metrics, or evaluation criteria
- NEVER discuss how the candidate is being evaluated
- NEVER mention question difficulty levels or adaptive algorithms
- NEVER compare this candidate to others
- If asked about assessment details, say: "I'm here to help you code, not discuss evaluation!"
- Focus ONLY on helping them write better code

**Your Role (${helpfulnessConfig.level} mode):**
${helpfulnessConfig.description}

**Available Tools:**
${helpfulnessConfig.allowedTools.join(', ')}

**Guidelines for Tool Use:**
- Use tools proactively to help the candidate
- When asked to check files, actually read them
- When asked to run tests, execute them
- When writing code, verify it works by reading the file back
- If a tool fails, explain the error and try an alternative approach
- Complete multi-step tasks autonomously without stopping after each step

Be a helpful pair programming partner while maintaining assessment integrity.`;

    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
      {
        type: 'text',
        text: staticInstructions,
        // Enable caching for static instructions
        // Note: cache_control requires beta header, falling back gracefully
        ...(process.env.ENABLE_PROMPT_CACHING === 'true' && {
          cache_control: { type: 'ephemeral' } as any,
        }),
      },
    ];

    // Dynamic part - problem statement changes per question
    if (this.config.problemStatement) {
      systemBlocks.push({
        type: 'text',
        text: `\n**Current Problem:**\n${this.config.problemStatement}`,
      });
    }

    return systemBlocks;
  }

  /**
   * Get tool definitions based on helpfulness level
   */
  private getTools(): unknown[] {
    const allowedTools = HELPFULNESS_CONFIGS[this.config.helpfulnessLevel].allowedTools;
    const allTools = this.getAllToolDefinitions();

    return allTools.filter((tool: any) => allowedTools.includes(tool.name));
  }

  /**
   * Get all tool definitions
   */
  private getAllToolDefinitions() {
    return [
      {
        name: 'Read',
        description: 'Read the contents of a file from the workspace. For large files, use offset and limit to read specific portions.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to read',
            },
            offset: {
              type: 'number',
              description: 'Character offset to start reading from (default: 0). Use this to read later portions of large files.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of characters to read (default: 5000). Increase to read more of a file.',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'Write',
        description: 'Create or overwrite a file with new content',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to write',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['file_path', 'content'],
        },
      },
      {
        name: 'Edit',
        description: 'Edit an existing file by replacing a specific section',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to edit',
            },
            old_string: {
              type: 'string',
              description: 'The exact string to replace (must be unique in the file)',
            },
            new_string: {
              type: 'string',
              description: 'The new string to insert',
            },
          },
          required: ['file_path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'Grep',
        description: 'Search for a pattern in files',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Regular expression pattern to search for',
            },
            path: {
              type: 'string',
              description: 'Path to search in (default: workspace root)',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'Glob',
        description: 'Find files matching a glob pattern',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern (e.g., "**/*.ts")',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'Bash',
        description: 'Execute a bash command in the workspace',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Bash command to execute',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'list_files',
        description: 'List files and directories in a path. Returns file names, types, and sizes.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (default: workspace root)',
            },
            recursive: {
              type: 'boolean',
              description: 'Whether to list recursively (default: false)',
            },
          },
        },
      },
      {
        name: 'run_tests',
        description: 'Run the test suite for the current problem',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * Execute a tool and return the result
   * This is a placeholder - actual implementation would interact with the Modal sandbox
   */
  private async executeTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    // Validate tool is allowed
    const allowedTools = HELPFULNESS_CONFIGS[this.config.helpfulnessLevel].allowedTools;
    if (!allowedTools.includes(toolName as any)) {
      return {
        success: false,
        error: `Tool ${toolName} is not allowed in ${this.config.helpfulnessLevel} mode`,
      };
    }

    // Execute tool based on type
    switch (toolName) {
      case 'Read':
        return await this.toolRead(
          input.file_path as string,
          input.offset as number | undefined,
          input.limit as number | undefined
        );

      case 'Write':
        return await this.toolWrite(
          input.file_path as string,
          input.content as string
        );

      case 'Edit':
        return await this.toolEdit(
          input.file_path as string,
          input.old_string as string,
          input.new_string as string
        );

      case 'Grep':
        return await this.toolGrep(
          input.pattern as string,
          input.path as string | undefined
        );

      case 'Glob':
        return await this.toolGlob(input.pattern as string);

      case 'Bash':
        return await this.toolBash(input.command as string);

      case 'list_files':
        return await this.toolListFiles(
          input.path as string | undefined,
          input.recursive as boolean | undefined
        );

      case 'run_tests':
        return await this.toolRunTests();

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  }

  /**
   * Tool implementations
   * These interact with the Modal sandbox for real file operations
   */

  private async toolRead(
    filePath: string,
    offset?: number,
    limit?: number
  ): Promise<unknown> {
    // Validate path
    const pathCheck = isPathAllowed(filePath, this.config.workspaceRoot);
    if (!pathCheck.allowed) {
      return { success: false, error: pathCheck.reason };
    }

    // Default limit to 5000 chars to prevent context overflow
    const DEFAULT_LIMIT = 5000;
    const actualOffset = offset || 0;
    const actualLimit = limit || DEFAULT_LIMIT;

    try {
      // Import Modal service dynamically
      const { readFile } = await import('../services/modal-production');

      // Get volume ID from session
      const volumeId = `vol-${this.config.sessionId}`;

      // Read file from Modal
      const fullContent = await readFile(volumeId, filePath);
      const totalSize = fullContent.length;

      // Apply offset and limit
      const content = fullContent.substring(actualOffset, actualOffset + actualLimit);
      const hasMore = actualOffset + actualLimit < totalSize;

      return {
        success: true,
        content,
        path: filePath,
        totalSize,
        offset: actualOffset,
        limit: actualLimit,
        hasMore,
        ...(hasMore && {
          _hint: `File has ${totalSize - actualOffset - actualLimit} more characters. Use offset: ${actualOffset + actualLimit} to continue reading.`,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  }

  private async toolWrite(filePath: string, content: string): Promise<unknown> {
    // Validate path
    const pathCheck = isPathAllowed(filePath, this.config.workspaceRoot);
    if (!pathCheck.allowed) {
      return { success: false, error: pathCheck.reason };
    }

    try {
      // Import services dynamically
      const { writeFile } = await import('../services/modal-production');
      const { streamCodeGeneration } = await import('../services/code-streaming');

      // Get volume ID from session
      const volumeId = `vol-${this.config.sessionId}`;

      // Stream code generation to frontend in real-time (if enabled)
      const fileName = filePath.split('/').pop() || filePath;
      const enableStreaming = process.env.ENABLE_CODE_STREAMING !== 'false';

      if (enableStreaming) {
        // Stream code in chunks with typing effect
        streamCodeGeneration(this.config.sessionId, fileName, content, {
          chunkSize: 5, // 5 characters at a time
          delayMs: 20, // 20ms between chunks
        }).catch((err) => {
          console.error('[CodingAgent] Code streaming error:', err);
          // Don't fail the write operation if streaming fails
        });
      }

      // Write file to Modal (happens immediately, streaming is for visual effect)
      await writeFile(volumeId, filePath, content);

      return {
        success: true,
        path: filePath,
        bytesWritten: content.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file',
      };
    }
  }

  private async toolEdit(
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<unknown> {
    // Validate path
    const pathCheck = isPathAllowed(filePath, this.config.workspaceRoot);
    if (!pathCheck.allowed) {
      return { success: false, error: pathCheck.reason };
    }

    try {
      // Import Modal service dynamically
      const { readFile, writeFile } = await import('../services/modal-production');

      // Get volume ID from session
      const volumeId = `vol-${this.config.sessionId}`;

      // Read current file content
      const currentContent = await readFile(volumeId, filePath);

      // Count occurrences to validate uniqueness
      // Use indexOf for exact string matching (not regex)
      let count = 0;
      let pos = 0;
      while ((pos = currentContent.indexOf(oldString, pos)) !== -1) {
        count++;
        pos += oldString.length;
      }

      if (count === 0) {
        return {
          success: false,
          error: `String not found in file. Make sure you're using the exact string including whitespace and newlines.`,
        };
      }

      if (count > 1) {
        return {
          success: false,
          error: `String found ${count} times in file. The old_string must be unique. Add more surrounding context to make it unique.`,
        };
      }

      // Exactly one occurrence - safe to replace
      const newContent = currentContent.replace(oldString, newString);

      // Write back to Modal
      await writeFile(volumeId, filePath, newContent);

      return {
        success: true,
        path: filePath,
        replacements: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to edit file',
      };
    }
  }

  private async toolGrep(pattern: string, path?: string): Promise<unknown> {
    try {
      // Import Modal service dynamically
      const { getFileSystem, readFile } = await import('../services/modal-production');

      // Get volume ID from session
      const volumeId = `vol-${this.config.sessionId}`;
      const sessionId = this.config.sessionId;

      // Get all files
      const files = await getFileSystem(sessionId, path || '/');

      const matches: Array<{ file: string; line: number; text: string }> = [];
      const regex = new RegExp(pattern);

      // Search through files
      for (const file of files) {
        if (file.type === 'file') {
          try {
            const content = await readFile(volumeId, file.path);
            const lines = content.split('\n');

            lines.forEach((line, index) => {
              if (regex.test(line)) {
                matches.push({
                  file: file.path,
                  line: index + 1,
                  text: line.trim(),
                });
              }
            });
          } catch {
            // Skip files that can't be read
          }
        }
      }

      return {
        success: true,
        matches,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Grep failed',
        matches: [],
      };
    }
  }

  private async toolGlob(pattern: string): Promise<unknown> {
    try {
      // Import Modal service dynamically
      const { getFileSystem } = await import('../services/modal-production');

      const sessionId = this.config.sessionId;

      // Get all files
      const allFiles = await getFileSystem(sessionId, '/');

      // Simple glob matching (supports ** and *)
      const regex = new RegExp(
        '^' + pattern
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\./g, '\\.')
          + '$'
      );

      const matchedFiles = allFiles
        .filter(file => file.type === 'file' && regex.test(file.path))
        .map(file => file.path);

      return {
        success: true,
        files: matchedFiles,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Glob failed',
        files: [],
      };
    }
  }

  private async toolListFiles(path?: string, recursive?: boolean): Promise<unknown> {
    try {
      // Import Modal service dynamically
      const { getFileSystem } = await import('../services/modal-production');

      const sessionId = this.config.sessionId;
      const targetPath = path || '/workspace';

      // Get files from Modal
      const files = await getFileSystem(sessionId, targetPath);

      // Filter based on recursive flag
      const results = files.map(file => ({
        name: file.name,
        path: file.path,
        type: file.type, // 'file' or 'directory'
        size: file.size || 0,
      }));

      // If not recursive, only return immediate children
      const filteredResults = recursive
        ? results
        : results.filter(f => {
            const relativePath = f.path.replace(targetPath, '').replace(/^\//, '');
            return !relativePath.includes('/');
          });

      return {
        success: true,
        path: targetPath,
        files: filteredResults,
        count: filteredResults.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
        files: [],
      };
    }
  }

  private async toolBash(command: string): Promise<unknown> {
    // Validate command security
    const commandCheck = isCommandAllowed(command);
    if (!commandCheck.allowed) {
      return { success: false, error: commandCheck.reason };
    }

    // Additional validation from agent-security
    const bashCheck = validateBashCommand(command);
    if (!bashCheck.safe) {
      return { success: false, error: bashCheck.reason };
    }

    try {
      // Import Modal service dynamically
      const { runCommand } = await import('../services/modal-production');

      const sessionId = this.config.sessionId;

      // Execute command in Modal
      const result = await runCommand(sessionId, command);

      const output = {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };

      // Sanitize output
      return sanitizeToolOutput('execute_bash', output);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
        stdout: '',
        stderr: '',
        exitCode: 1,
      };
    }
  }

  private async toolRunTests(): Promise<unknown> {
    // Validate required config
    if (!this.config.candidateId) {
      return {
        success: false,
        error: 'candidateId not configured - cannot run tests',
        passed: 0,
        failed: 0,
        total: 0,
        testResults: [],
      };
    }

    if (!this.config.sessionRecordingId) {
      return {
        success: false,
        error: 'sessionRecordingId not configured - cannot save test results',
        passed: 0,
        failed: 0,
        total: 0,
        testResults: [],
      };
    }

    try {
      // Import the test execution function
      const { executeRunTests } = await import('../agent-tools/run-tests');

      // Execute tests using the dedicated test runner
      // candidateId: for looking up candidate's question and volume
      // sessionRecordingId: for saving test results to DB
      const result = await executeRunTests(
        this.config.candidateId,
        this.config.sessionRecordingId,
        {}
      );

      return {
        success: result.success,
        passed: result.passed,
        failed: result.failed,
        total: result.total,
        testResults: result.results,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run tests',
        passed: 0,
        failed: 0,
        total: 0,
        testResults: [],
      };
    }
  }
}

/**
 * Factory function to create a Coding Agent
 *
 * Required config:
 * - sessionId: Used for Modal volume ID (vol-{sessionId})
 * - candidateId: For looking up candidate's questions and code
 * - sessionRecordingId: For saving interactions and test results to DB
 */
export async function createCodingAgent(
  config: Partial<CodingAgentConfig> & {
    sessionRecordingId?: string;
  }
): Promise<CodingAgent> {
  const fullConfig: CodingAgentConfig = {
    model: config.model || AGENT_MODEL_RECOMMENDATIONS.codingAgent,
    tools: config.tools || HELPFULNESS_CONFIGS['pair-programming'].allowedTools,
    permissions: config.permissions || { mode: 'auto' },
    sessionId: config.sessionId || '',
    helpfulnessLevel: config.helpfulnessLevel || 'pair-programming',
    workspaceRoot: config.workspaceRoot || '/workspace',
    problemStatement: config.problemStatement,
    systemPrompt: config.systemPrompt,
    candidateId: config.candidateId,
    sessionRecordingId: config.sessionRecordingId,
  };

  return new CodingAgent(fullConfig);
}
