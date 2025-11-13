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

    // Get allowed tools based on helpfulness level
    const tools = this.getTools();

    // Build system prompt with security constraints
    const systemPrompt = this.buildSystemPrompt();

    // Call Claude API with tool use
    const response = await this.client.messages.create({
      model: this.config.model || AGENT_MODEL_RECOMMENDATIONS.codingAgent,
      max_tokens: 4096,
      system: systemPrompt,
      messages: sanitizeMessages(this.conversation),
      tools: tools as Anthropic.Messages.Tool[],
    });

    // Process tool calls if any
    let finalText = '';
    const toolsUsed: string[] = [];
    const filesModified: string[] = [];

    for (const content of response.content) {
      if (content.type === 'text') {
        finalText += content.text;
      } else if (content.type === 'tool_use') {
        this.toolCallCount++;

        // Execute tool and get result
        const toolResult = await this.executeTool(
          content.name,
          content.input as Record<string, unknown>
        );

        toolsUsed.push(content.name);

        // Track file modifications
        if (content.name === 'Write' || content.name === 'Edit') {
          const filePath = (content.input as { file_path?: string }).file_path;
          if (filePath) {
            filesModified.push(filePath);
          }
        }

        // Continue conversation with tool result
        this.conversation.push({
          role: 'assistant',
          content: response.content,
        });

        this.conversation.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: content.id,
              content: JSON.stringify(toolResult),
            },
          ],
        });

        // Get final response after tool use
        const followUp = await this.client.messages.create({
          model: this.config.model || AGENT_MODEL_RECOMMENDATIONS.codingAgent,
          max_tokens: 4096,
          system: systemPrompt,
          messages: sanitizeMessages(this.conversation),
          tools: tools as Anthropic.Messages.Tool[],
        });

        // Extract text from follow-up
        for (const followUpContent of followUp.content) {
          if (followUpContent.type === 'text') {
            finalText += followUpContent.text;
          }
        }

        // Add final response to conversation
        this.conversation.push({
          role: 'assistant',
          content: followUp.content,
        });
      }
    }

    // Add assistant response to conversation if no tool use
    if (response.content.every((c) => c.type === 'text')) {
      this.conversation.push({
        role: 'assistant',
        content: response.content,
      });
    }

    return {
      text: finalText || 'I apologize, but I encountered an error processing your request.',
      toolsUsed,
      filesModified,
      metadata: {
        model: response.model,
        usage: response.usage,
        toolCallCount: this.toolCallCount,
      },
    };
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
   * Build system prompt with security constraints
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
        description: 'Read the contents of a file from the workspace',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to read',
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
        return await this.toolRead(input.file_path as string);

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
   * These would interact with the Modal sandbox in production
   */

  private async toolRead(filePath: string): Promise<unknown> {
    // Validate path
    const pathCheck = isPathAllowed(filePath, this.config.workspaceRoot);
    if (!pathCheck.allowed) {
      return { success: false, error: pathCheck.reason };
    }

    // TODO: Implement actual file reading from Modal sandbox
    // For now, return a placeholder
    return {
      success: true,
      content: '// File content would be read from Modal sandbox',
      path: filePath,
    };
  }

  private async toolWrite(filePath: string, content: string): Promise<unknown> {
    // Validate path
    const pathCheck = isPathAllowed(filePath, this.config.workspaceRoot);
    if (!pathCheck.allowed) {
      return { success: false, error: pathCheck.reason };
    }

    // TODO: Implement actual file writing to Modal sandbox
    return {
      success: true,
      path: filePath,
      bytesWritten: content.length,
    };
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

    // TODO: Implement actual file editing in Modal sandbox
    return {
      success: true,
      path: filePath,
      replacements: 1,
    };
  }

  private async toolGrep(pattern: string, path?: string): Promise<unknown> {
    // TODO: Implement grep in Modal sandbox
    return {
      success: true,
      matches: [],
    };
  }

  private async toolGlob(pattern: string): Promise<unknown> {
    // TODO: Implement glob in Modal sandbox
    return {
      success: true,
      files: [],
    };
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

    // TODO: Implement actual bash execution in Modal sandbox
    const output = {
      success: true,
      stdout: '// Command output from Modal sandbox',
      stderr: '',
      exitCode: 0,
    };

    // Sanitize output
    return sanitizeToolOutput('execute_bash', output);
  }

  private async toolRunTests(): Promise<unknown> {
    // TODO: Implement actual test execution in Modal sandbox
    const output = {
      success: true,
      passed: 5,
      total: 5,
      testResults: [
        { name: 'test_example', passed: true, error: null },
      ],
    };

    // Sanitize to hide evaluation metrics
    return sanitizeToolOutput('run_tests', output);
  }
}

/**
 * Factory function to create a Coding Agent
 */
export async function createCodingAgent(
  config: Partial<CodingAgentConfig>
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
  };

  return new CodingAgent(fullConfig);
}
