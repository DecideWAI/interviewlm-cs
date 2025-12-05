/**
 * Streaming Coding Agent
 *
 * Extends the base CodingAgent with streaming capabilities for real-time
 * response delivery. Uses Anthropic's streaming API to provide:
 * - Token-by-token text delivery
 * - Real-time tool execution status
 * - Progressive response building
 *
 * This provides a Cursor/Warp-like experience where users see the AI
 * "thinking" in real-time rather than waiting for the full response.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  CodingAgentConfig,
  AgentResponse,
  HelpfulnessLevel,
  AgentTool,
  ClaudeModel,
} from '../types/agent';
import { AGENT_MODEL_RECOMMENDATIONS } from '../constants/models';
import { HELPFULNESS_CONFIGS } from '../types/agent';
import {
  sanitizeMessages,
  checkRateLimit,
} from '../agent-security';

/**
 * Streaming callbacks for real-time updates
 */
export interface StreamingCallbacks {
  /** Called when new text is generated */
  onTextDelta?: (delta: string) => void;
  /** Called when a tool execution starts */
  onToolStart?: (toolName: string, toolId: string, input: unknown) => void;
  /** Called when a tool execution completes */
  onToolResult?: (toolName: string, toolId: string, result: unknown, isError: boolean) => void;
  /** Called when thinking/reasoning updates */
  onThinking?: (text: string) => void;
}

/**
 * Streaming Coding Agent class
 */
export class StreamingCodingAgent {
  private client: Anthropic;
  private config: CodingAgentConfig;
  private conversation: Anthropic.Messages.MessageParam[] = [];
  private toolCallCount = 0;

  constructor(config: CodingAgentConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultHeaders: {
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
    });
  }

  /**
   * Send a message with streaming support
   * Provides real-time callbacks as the response is generated
   */
  async sendMessageStreaming(
    message: string,
    callbacks: StreamingCallbacks
  ): Promise<AgentResponse> {
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

    // Trim conversation history
    this.trimConversationHistory();

    // Get tools and system prompt
    const tools = this.getTools();
    const systemPrompt = this.buildSystemPromptWithCaching();

    // Track aggregated results
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

    const MAX_ITERATIONS = 25;
    let iterations = 0;

    // Agentic loop with streaming
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Call Claude API with streaming
      const { text, toolUseBlocks, usage, model, stopReason } = await this.callClaudeStreaming(
        {
          model: this.config.model || AGENT_MODEL_RECOMMENDATIONS.codingAgent,
          max_tokens: 4096,
          system: systemPrompt,
          messages: sanitizeMessages(this.conversation),
          tools: tools as Anthropic.Messages.Tool[],
        },
        callbacks
      );

      // Accumulate text
      finalText += text;

      // Track usage
      totalUsage.input_tokens += usage.input_tokens;
      totalUsage.output_tokens += usage.output_tokens;
      lastModel = model;

      // Handle max_tokens without tool use
      if (stopReason === 'max_tokens' && toolUseBlocks.length === 0) {
        this.conversation.push({
          role: 'assistant',
          content: [{ type: 'text', text }],
        });
        this.conversation.push({
          role: 'user',
          content: 'Continue your response from where you left off.',
        });
        continue;
      }

      // If no tool uses, we're done
      if (toolUseBlocks.length === 0) {
        this.conversation.push({
          role: 'assistant',
          content: [{ type: 'text', text }],
        });
        break;
      }

      // Execute tools with streaming callbacks
      const toolResults = await this.executeToolsWithCallbacks(
        toolUseBlocks,
        toolsUsed,
        filesModified,
        callbacks
      );

      // Build assistant content with text and tool uses
      const assistantContent: Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      > = [];
      if (text) {
        assistantContent.push({ type: 'text', text });
      }
      for (const toolBlock of toolUseBlocks) {
        assistantContent.push({
          type: 'tool_use',
          id: toolBlock.id,
          name: toolBlock.name,
          input: toolBlock.input,
        });
      }

      // Add assistant response to conversation
      this.conversation.push({
        role: 'assistant',
        content: assistantContent,
      });

      // Add tool results
      this.conversation.push({
        role: 'user',
        content: toolResults,
      });

      if (stopReason === 'end_turn') {
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      console.warn(`[StreamingAgent] Reached max iterations (${MAX_ITERATIONS})`);
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
   * Call Claude API with streaming
   */
  private async callClaudeStreaming(
    params: Anthropic.Messages.MessageCreateParams,
    callbacks: StreamingCallbacks
  ): Promise<{
    text: string;
    toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
    stopReason: string;
  }> {
    let text = '';
    const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInput = '';

    // Use streaming API
    const stream = this.client.messages.stream({
      ...params,
      stream: true,
    });

    // Process stream events
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'tool_use') {
          currentToolId = block.id;
          currentToolName = block.name;
          currentToolInput = '';
          // Notify tool start
          callbacks.onToolStart?.(currentToolName, currentToolId, {});
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          text += delta.text;
          callbacks.onTextDelta?.(delta.text);
        } else if (delta.type === 'input_json_delta') {
          currentToolInput += delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        // If we were building a tool use, finalize it
        if (currentToolId && currentToolName) {
          try {
            const input = currentToolInput ? JSON.parse(currentToolInput) : {};
            toolUseBlocks.push({
              id: currentToolId,
              name: currentToolName,
              input,
            });
          } catch (e) {
            console.error('[StreamingAgent] Failed to parse tool input:', e);
          }
          currentToolId = '';
          currentToolName = '';
          currentToolInput = '';
        }
      }
    }

    // Get final message for usage stats
    const finalMessage = await stream.finalMessage();

    return {
      text,
      toolUseBlocks,
      usage: {
        input_tokens: finalMessage.usage.input_tokens,
        output_tokens: finalMessage.usage.output_tokens,
      },
      model: finalMessage.model,
      stopReason: finalMessage.stop_reason || 'end_turn',
    };
  }

  /**
   * Execute tools with streaming callbacks
   */
  private async executeToolsWithCallbacks(
    toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    toolsUsed: AgentTool[],
    filesModified: string[],
    callbacks: StreamingCallbacks
  ): Promise<Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }>> {
    const TOOL_TIMEOUT_MS = 30000;
    const BASH_TIMEOUT_MS = 60000;
    const MAX_OUTPUT_SIZE = 5000;

    const toolPromises = toolUseBlocks.map(async (toolBlock) => {
      this.toolCallCount++;

      const timeoutMs = toolBlock.name === 'Bash' ? BASH_TIMEOUT_MS : TOOL_TIMEOUT_MS;

      let toolResult: unknown;
      let isError = false;

      try {
        toolResult = await Promise.race([
          this.executeTool(toolBlock.name, toolBlock.input),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Tool ${toolBlock.name} timed out`)), timeoutMs);
          }),
        ]);
      } catch (error) {
        isError = true;
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

      // Notify tool result
      callbacks.onToolResult?.(toolBlock.name, toolBlock.id, toolResult, isError);

      // Truncate large outputs
      let resultContent = JSON.stringify(toolResult);
      if (resultContent.length > MAX_OUTPUT_SIZE) {
        resultContent = resultContent.substring(0, MAX_OUTPUT_SIZE) + '... [TRUNCATED]';
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
   * Execute a single tool
   */
  private async executeTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    // Import tool implementations dynamically
    switch (toolName) {
      case 'Read': {
        const { executeReadFile } = await import('../agent-tools/read-file');
        return executeReadFile(
          this.config.sessionId,
          input.file_path as string,
          input.offset as number | undefined,
          input.limit as number | undefined
        );
      }
      case 'Write': {
        const { executeWriteFile } = await import('../agent-tools/write-file');
        return executeWriteFile(
          this.config.sessionId,
          input.file_path as string,
          input.content as string
        );
      }
      case 'Edit': {
        const { executeEditFile } = await import('../agent-tools/edit-file');
        return executeEditFile(
          this.config.sessionId,
          input.file_path as string,
          input.old_string as string,
          input.new_string as string
        );
      }
      case 'Bash': {
        const { executeBash } = await import('../agent-tools/bash');
        return executeBash(this.config.sessionId, input.command as string);
      }
      case 'Glob': {
        const { executeGlob } = await import('../agent-tools/glob');
        return executeGlob(
          this.config.sessionId,
          input.pattern as string,
          input.path as string | undefined
        );
      }
      case 'Grep': {
        const { executeGrep } = await import('../agent-tools/grep');
        return executeGrep(
          this.config.sessionId,
          input.pattern as string,
          input.path as string | undefined,
          input.include as string | undefined
        );
      }
      case 'list_files': {
        const { executeListFiles } = await import('../agent-tools/list-files');
        return executeListFiles(
          this.config.sessionId,
          input.directory as string | undefined
        );
      }
      case 'run_tests': {
        const { executeRunTests } = await import('../agent-tools/run-tests');
        return executeRunTests(
          this.config.candidateId || this.config.sessionId,
          this.config.sessionRecordingId || this.config.sessionId,
          { fileName: input.test_file as string | undefined }
        );
      }
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  }

  /**
   * Trim conversation history
   */
  private trimConversationHistory(): void {
    const MAX_MESSAGES = 40;
    if (this.conversation.length > MAX_MESSAGES) {
      this.conversation = this.conversation.slice(-MAX_MESSAGES);
    }
  }

  /**
   * Load conversation history
   */
  loadConversationHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): void {
    this.conversation = [];
    let lastRole: string | null = null;

    for (const msg of history) {
      if (lastRole === msg.role) {
        // Merge consecutive same-role messages
        const lastMsg = this.conversation[this.conversation.length - 1];
        if (lastMsg && typeof lastMsg.content === 'string') {
          lastMsg.content += '\n\n' + msg.content;
        }
      } else {
        this.conversation.push({
          role: msg.role,
          content: msg.content,
        });
        lastRole = msg.role;
      }
    }

    // Ensure conversation starts with user message
    if (this.conversation.length > 0 && this.conversation[0].role !== 'user') {
      this.conversation.shift();
    }

    // Ensure conversation alternates
    const validConversation: Anthropic.Messages.MessageParam[] = [];
    for (let i = 0; i < this.conversation.length; i++) {
      const msg = this.conversation[i];
      const expectedRole = i % 2 === 0 ? 'user' : 'assistant';
      if (msg.role === expectedRole) {
        validConversation.push(msg);
      }
    }
    this.conversation = validConversation;
  }

  /**
   * Build system prompt with caching
   */
  private buildSystemPromptWithCaching(): Anthropic.Messages.TextBlockParam[] {
    const helpfulnessConfig = HELPFULNESS_CONFIGS[this.config.helpfulnessLevel];

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
        ...(process.env.ENABLE_PROMPT_CACHING === 'true' && {
          cache_control: { type: 'ephemeral' } as unknown as undefined,
        }),
      },
    ];

    if (this.config.problemStatement) {
      systemBlocks.push({
        type: 'text',
        text: `\n**Current Problem:**\n${this.config.problemStatement}`,
      });
    }

    return systemBlocks;
  }

  /**
   * Get tools based on helpfulness level
   */
  private getTools(): unknown[] {
    const allowedTools = HELPFULNESS_CONFIGS[this.config.helpfulnessLevel].allowedTools;
    return this.getAllToolDefinitions().filter((tool: { name: string }) =>
      allowedTools.includes(tool.name as AgentTool)
    );
  }

  /**
   * Get all tool definitions
   */
  private getAllToolDefinitions() {
    return [
      {
        name: 'Read',
        description: 'Read the contents of a file from the workspace.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to read' },
            offset: { type: 'number', description: 'Character offset to start reading from' },
            limit: { type: 'number', description: 'Maximum number of characters to read' },
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
            file_path: { type: 'string', description: 'Absolute path to the file to write' },
            content: { type: 'string', description: 'Content to write to the file' },
          },
          required: ['file_path', 'content'],
        },
      },
      {
        name: 'Edit',
        description: 'Edit a file by replacing a specific string with new content',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to edit' },
            old_string: { type: 'string', description: 'Exact string to find and replace' },
            new_string: { type: 'string', description: 'New string to replace with' },
          },
          required: ['file_path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'Bash',
        description: 'Execute a bash command in the sandbox environment',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The bash command to execute' },
          },
          required: ['command'],
        },
      },
      {
        name: 'Glob',
        description: 'Find files matching a glob pattern',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern to match files' },
            path: { type: 'string', description: 'Directory to search in' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'Grep',
        description: 'Search for a pattern in files',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            path: { type: 'string', description: 'Directory or file to search in' },
            include: { type: 'string', description: 'File pattern to include (e.g., *.ts)' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'list_files',
        description: 'List files in a directory',
        input_schema: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Directory to list files from' },
          },
        },
      },
      {
        name: 'run_tests',
        description: 'Run tests in the project',
        input_schema: {
          type: 'object',
          properties: {
            test_file: { type: 'string', description: 'Specific test file to run' },
          },
        },
      },
    ];
  }
}

/**
 * Factory function to create a streaming coding agent
 */
export async function createStreamingCodingAgent(config: {
  sessionId: string;
  candidateId: string;
  sessionRecordingId: string;
  helpfulnessLevel: HelpfulnessLevel;
  workspaceRoot: string;
  problemStatement?: string;
  model?: string;
}): Promise<StreamingCodingAgent> {
  // Use the provided model or default to recommendation
  const model = (config.model as ClaudeModel) || AGENT_MODEL_RECOMMENDATIONS.codingAgent;

  return new StreamingCodingAgent({
    sessionId: config.sessionId,
    candidateId: config.candidateId,
    sessionRecordingId: config.sessionRecordingId,
    helpfulnessLevel: config.helpfulnessLevel,
    workspaceRoot: config.workspaceRoot,
    problemStatement: config.problemStatement,
    model,
    // CodingAgentConfig requires these fields
    tools: HELPFULNESS_CONFIGS[config.helpfulnessLevel].allowedTools,
    permissions: { mode: 'auto' },
  });
}
