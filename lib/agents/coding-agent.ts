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
import { buildCodingAgentSystemPrompt } from '../prompts/coding-agent-system';
import { traceClaudeStreaming, getTracedAnthropicClient } from '../observability/langsmith';
import { logCacheMetrics } from '../utils/agent-utils';

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
    // Initialize Anthropic client with LangSmith tracing
    // Pass sessionId as thread ID to group all traces from the same session
    this.client = getTracedAnthropicClient(config.sessionId);
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
          max_tokens: 32000,
          system: systemPrompt,
          messages: sanitizeMessages(this.conversation),
          tools: tools as Anthropic.Messages.Tool[],
        },
        callbacks
      );

      // Accumulate text
      finalText += text;

      // Track usage including cache metrics
      totalUsage.input_tokens += usage.input_tokens;
      totalUsage.output_tokens += usage.output_tokens;
      totalUsage.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
      totalUsage.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
      lastModel = model;

      // Log cache metrics per iteration
      if (usage.cache_creation_input_tokens || usage.cache_read_input_tokens) {
        logCacheMetrics({
          cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
          cacheReadInputTokens: usage.cache_read_input_tokens || 0,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheSavingsPercent: usage.input_tokens > 0
            ? Math.round(((usage.cache_read_input_tokens || 0) / usage.input_tokens) * 90)
            : 0,
        }, 'CodingAgent');
      }

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
   * Send a message without streaming (collects all output)
   * Convenience wrapper for non-streaming use cases
   */
  async sendMessage(message: string): Promise<AgentResponse> {
    // Use streaming with empty callbacks to collect the full response
    return this.sendMessageStreaming(message, {});
  }

  /**
   * Call Claude API with streaming
   * Wrapped with LangSmith tracing to capture model, tokens, cache, and cost
   */
  private async callClaudeStreaming(
    params: Anthropic.Messages.MessageCreateParams,
    callbacks: StreamingCallbacks
  ): Promise<{
    text: string;
    toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>;
    usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    model: string;
    stopReason: string;
  }> {
    // Wrap the entire streaming call with LangSmith tracing
    return traceClaudeStreaming(
      { model: params.model, operation: 'messages.stream' },
      async () => {
        let text = '';
        const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        let currentToolId = '';
        let currentToolName = '';

        // Use streaming API
        const stream = this.client.messages.stream({
          ...params,
          stream: true,
        });

        // Process stream events for real-time callbacks only
        // We'll get the actual tool inputs from finalMessage (more reliable)
        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            const block = event.content_block;
            if (block.type === 'tool_use') {
              currentToolId = block.id;
              currentToolName = block.name;
              // Notify tool start (input will come from finalMessage)
              callbacks.onToolStart?.(currentToolName, currentToolId, {});
            }
          } else if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if (delta.type === 'text_delta') {
              text += delta.text;
              callbacks.onTextDelta?.(delta.text);
            }
            // Note: We skip input_json_delta parsing here - using finalMessage instead
          } else if (event.type === 'content_block_stop') {
            // Reset tool tracking
            currentToolId = '';
            currentToolName = '';
          }
        }

        // Get final message - this has properly parsed tool_use blocks
        const finalMessage = await stream.finalMessage();

        // Extract tool use blocks from finalMessage (more reliable than streaming JSON parsing)
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            toolUseBlocks.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }

        return {
          text,
          toolUseBlocks,
          usage: {
            input_tokens: finalMessage.usage.input_tokens,
            output_tokens: finalMessage.usage.output_tokens,
            cache_read_input_tokens: (finalMessage.usage as any).cache_read_input_tokens || 0,
            cache_creation_input_tokens: (finalMessage.usage as any).cache_creation_input_tokens || 0,
          },
          model: finalMessage.model,
          stopReason: finalMessage.stop_reason || 'end_turn',
        };
      }
    );
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

      // Validate WriteFile tool has content (most common failure mode)
      if (toolBlock.name === 'WriteFile' && (toolBlock.input.content === undefined || toolBlock.input.content === null)) {
        console.error('[StreamingAgent] WriteFile called without content:', {
          toolId: toolBlock.id,
          inputKeys: Object.keys(toolBlock.input),
          path: toolBlock.input.path,
        });

        const error =
          'ERROR: WriteFile requires both "path" and "content" parameters.\n' +
          'Usage: WriteFile({ path: "/workspace/solution.py", content: "your code here" })';

        callbacks.onToolResult?.(toolBlock.name, toolBlock.id, { success: false, error }, true);
        return {
          type: 'tool_result' as const,
          tool_use_id: toolBlock.id,
          content: JSON.stringify({ success: false, error }),
          is_error: true,
        };
      }

      // Block Bash commands that write files (use WriteFile instead)
      // This is a defense-in-depth measure since prompts alone are unreliable
      if (toolBlock.name === 'Bash') {
        const command = (toolBlock.input.command as string) || '';
        const fileWritePatterns = [
          /cat\s*>/, /cat\s*>>/, /cat\s*<</, // cat with redirection or heredoc
          /echo\s+(['"]|[^|])*>/, // echo with redirection (but not pipes)
          /printf\s+(['"]|[^|])*>/, // printf with redirection
          /tee\s+(-a\s+)?\/workspace/, // tee writing to workspace
          />\s*\/workspace/, // any redirect to /workspace
          /<<\s*['"]?EOF/, // heredoc pattern
        ];

        const isFileWrite = fileWritePatterns.some(p => p.test(command));
        if (isFileWrite) {
          console.warn('[StreamingAgent] Blocked Bash file-writing command:', command.substring(0, 100));

          const error =
            'ERROR: Do not use Bash for file writing. Use the WriteFile tool instead.\n' +
            'WriteFile is faster, more reliable, and handles encoding correctly.\n\n' +
            'Example: WriteFile({ path: "/workspace/file.py", content: "your code here" })\n\n' +
            'Blocked command: ' + command.substring(0, 80) + (command.length > 80 ? '...' : '');

          callbacks.onToolResult?.(toolBlock.name, toolBlock.id, { success: false, error }, true);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ success: false, error }),
            is_error: true,
          };
        }
      }

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
      if (toolBlock.name === 'WriteFile' || toolBlock.name === 'Edit') {
        const filePath = toolBlock.name === 'WriteFile'
          ? (toolBlock.input as { path?: string }).path
          : (toolBlock.input as { file_path?: string }).file_path;
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
      case 'WriteFile': {
        const { executeWriteFile } = await import('../agent-tools/write-file');
        return executeWriteFile(
          this.config.sessionId,
          input.path as string,
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
      case 'ListFiles': {
        const { executeListFiles } = await import('../agent-tools/list-files');
        // Accept both 'directory' and 'path' as parameter names
        const dir = (input.directory || input.path) as string | undefined;
        return executeListFiles(this.config.sessionId, dir);
      }
      case 'RunTests': {
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
   * Caching is ALWAYS enabled - no conditional checks
   */
  private buildSystemPromptWithCaching(): Anthropic.Messages.TextBlockParam[] {
    const helpfulnessConfig = HELPFULNESS_CONFIGS[this.config.helpfulnessLevel];

    // Use centralized system prompt from prompts folder
    const staticInstructions = buildCodingAgentSystemPrompt({
      level: helpfulnessConfig.level,
      description: helpfulnessConfig.description,
      allowedTools: helpfulnessConfig.allowedTools,
    });

    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
      {
        type: 'text',
        text: staticInstructions,
        // Always enable caching for static instructions
        cache_control: { type: 'ephemeral' },
      } as Anthropic.Messages.TextBlockParam,
    ];

    if (this.config.problemStatement) {
      // Dynamic content is NOT cached as it changes per problem
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
        description:
          'Read the contents of a file from the workspace. Use this to:\n' +
          '- Examine existing code before making changes\n' +
          '- Understand current implementation details\n' +
          '- Check configuration files or dependencies\n\n' +
          'Always read a file before editing it to understand its current state.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: "Absolute path to the file. MUST start with /workspace (e.g., '/workspace/solution.js', '/workspace/src/utils.ts')" },
            offset: { type: 'number', description: 'Character offset to start reading from (default: 0)' },
            limit: { type: 'number', description: 'Maximum characters to read (default: 5000)' },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'WriteFile',
        description:
          'Create or overwrite a file with source code. THIS IS THE PREFERRED METHOD for all file creation.\n' +
          'Use this instead of Bash with cat/heredocs - WriteFile is faster and more reliable.\n\n' +
          'Usage: WriteFile({ path: "/workspace/solution.py", content: "def main():\\n    print(\'hello\')\\nmain()" })',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path starting with /workspace (e.g., /workspace/src/utils.py)',
            },
            content: {
              type: 'string',
              description: 'Complete file content - must include ALL code, no placeholders',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'Edit',
        description:
          'Make targeted edits to a file by replacing specific text. Use this to:\n' +
          '- Fix bugs in existing code\n' +
          '- Update function implementations\n' +
          '- Modify specific sections without rewriting the whole file\n\n' +
          'IMPORTANT: File path MUST start with /workspace. The old_string must match EXACTLY, including all whitespace and indentation.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: "Absolute path to the file. MUST start with /workspace (e.g., '/workspace/solution.js')" },
            old_string: { type: 'string', description: 'The exact text to find and replace (must match character-for-character)' },
            new_string: { type: 'string', description: 'The replacement text (can be empty to delete)' },
          },
          required: ['file_path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'Bash',
        description:
          'Execute a shell command in the sandbox environment. Use this to:\n' +
          "- Run tests: `npm test`, `pytest`, `node test.js`\n" +
          "- Install packages: `npm install lodash`, `pip install requests`\n" +
          "- Run code: `node solution.js`, `python solution.py`\n" +
          "- Create directories: `mkdir -p src/components`\n\n" +
          'Commands run in /workspace directory.\n\n' +
          'IMPORTANT: Do NOT use Bash for file writing (no cat/echo/heredocs). Use WriteFile tool instead.',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: "Shell command to execute (e.g., 'npm test', 'node solution.js'). Do NOT use for file writing." },
          },
          required: ['command'],
        },
      },
      {
        name: 'Glob',
        description:
          'Find files matching a glob pattern. Use this to:\n' +
          "- Discover project structure: `**/*.js`, `**/*.ts`\n" +
          "- Find specific file types: `*.json`, `*.md`\n" +
          "- Search in directories: `src/**/*.ts`\n\n" +
          'Use before Read to find files to examine.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: "Glob pattern (e.g., '**/*.js', 'src/**/*.ts')" },
            path: { type: 'string', description: 'Directory to search in (default: workspace root)' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'Grep',
        description:
          'Search file contents for a text pattern. Use this to:\n' +
          '- Find function/variable definitions and usages\n' +
          '- Locate TODOs, FIXMEs, or specific comments\n' +
          '- Find import statements or dependencies\n\n' +
          'Returns matching lines with file paths and line numbers. Supports regex.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: "Text or regex pattern (e.g., 'TODO', 'function solve')" },
            path: { type: 'string', description: 'Directory or file to search in (default: workspace)' },
            include: { type: 'string', description: "Filter by file type (e.g., '*.ts', '*.js')" },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'ListFiles',
        description:
          'List contents of a directory (non-recursive). Use this to:\n' +
          '- See what files exist in a specific directory\n' +
          '- Explore project structure one level at a time\n' +
          '- Find files before reading them\n\n' +
          'Returns file names, types (file/directory), and sizes. For recursive search, use Glob instead.',
        input_schema: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: "Directory to list (default: '/workspace'). Example: '/workspace/src'" },
            path: { type: 'string', description: "Alias for directory parameter" },
          },
        },
      },
      {
        name: 'RunTests',
        description:
          'Execute the test suite for the current coding challenge. Use this to:\n' +
          '- Validate code changes against test cases\n' +
          '- Check if the solution passes all requirements\n' +
          '- Get detailed feedback on failing tests\n\n' +
          'Run tests after making code changes to verify correctness.',
        input_schema: {
          type: 'object',
          properties: {
            test_file: { type: 'string', description: 'Specific test file to run (optional)' },
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
