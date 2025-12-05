/**
 * Question Evaluation Agent - TypeScript/Anthropic SDK Implementation
 *
 * AI agent that evaluates candidate code submissions during interviews.
 * Uses Claude Code-like capabilities with READ-ONLY tools to gather
 * context before evaluating.
 *
 * Features:
 * - 5-criteria evaluation (20 points each = 100 total)
 * - READ-ONLY tool access (Read, ListFiles, Grep, Glob, RunTests, Bash)
 * - Always uses tools to gather context before evaluating
 * - Pass/fail determination based on configurable threshold
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getTracedAnthropicClient,
  traceToolExecution,
  traceAgentSession,
} from '../observability/langsmith';
import type { AssessmentType } from '@/types/seed';

// =============================================================================
// Types
// =============================================================================

export interface EvaluationCriterion {
  score: number;
  maxScore: number;
  feedback: string;
}

/**
 * Real World assessment evaluation criteria
 */
export interface RealWorldEvaluationCriteria {
  problemCompletion: EvaluationCriterion;  // 30 pts
  codeQuality: EvaluationCriterion;         // 25 pts
  testing: EvaluationCriterion;             // 20 pts
  errorHandling: EvaluationCriterion;       // 15 pts
  efficiency: EvaluationCriterion;          // 10 pts
}

/**
 * System Design assessment evaluation criteria
 */
export interface SystemDesignEvaluationCriteria {
  designClarity: EvaluationCriterion;       // 30 pts
  tradeoffAnalysis: EvaluationCriterion;    // 25 pts
  apiDesign: EvaluationCriterion;           // 20 pts
  implementation: EvaluationCriterion;      // 15 pts
  communication: EvaluationCriterion;       // 10 pts
}

/**
 * Legacy evaluation criteria (backwards compatibility)
 * @deprecated Use RealWorldEvaluationCriteria or SystemDesignEvaluationCriteria
 */
export interface EvaluationCriteria {
  problemCompletion: EvaluationCriterion;
  codeQuality: EvaluationCriterion;
  bestPractices: EvaluationCriterion;
  errorHandling: EvaluationCriterion;
  efficiency: EvaluationCriterion;
}

/**
 * Union type for all evaluation criteria
 */
export type TypedEvaluationCriteria = RealWorldEvaluationCriteria | SystemDesignEvaluationCriteria;

export interface EvaluationResult {
  overallScore: number;
  passed: boolean;
  assessmentType: AssessmentType;
  criteria: TypedEvaluationCriteria;
  feedback: string;
  strengths: string[];
  improvements: string[];
  metadata?: {
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
    toolCallCount: number;
    evaluationTime: number;
  };
}

export interface QuestionEvaluationConfig {
  sessionId: string;
  candidateId: string;
  questionId: string;
  questionTitle: string;
  questionDescription: string;
  questionDifficulty: string;
  questionRequirements: string[] | null;
  code: string;
  language: string;
  fileName?: string;
  passingThreshold?: number;
  workspaceRoot?: string;
  model?: string;
  /** Assessment type determines which evaluation rubric to use */
  assessmentType?: AssessmentType;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_THRESHOLD = 70;
const MAX_ITERATIONS = 5; // Limit tool iterations for evaluation

// =============================================================================
// Prompts
// =============================================================================

/**
 * Shared prompt sections for tool usage
 */
const SHARED_TOOL_INSTRUCTIONS = `## Available Tools
You have access to the following tools to gather context:
- **Read**: Read file contents from the workspace
- **ListFiles**: List directory contents
- **Grep**: Search for patterns in files
- **Glob**: Find files by pattern
- **RunTests**: Execute the test suite
- **Bash**: Execute shell commands (with restrictions - see below)

## CRITICAL: Bash Tool Restrictions
The Bash tool is available but MUST ONLY be used for:
- Running test commands (npm test, pytest, go test, etc.)
- Checking file information (ls, stat, wc -l)
- Viewing environment details (node --version, python --version)
- Reading file contents with head/tail/cat when Read tool is insufficient
- Running linters or type checkers (eslint, tsc --noEmit, mypy)

NEVER use Bash for:
- Writing or modifying files (no echo >, no sed -i, no tee)
- Installing packages (no npm install, no pip install)
- Deleting files (no rm, no rmdir)
- Executing candidate's code directly (don't run their scripts)
- Network operations (no curl, no wget, no fetch)
- System modifications (no chmod on non-test files, no chown)
- Any destructive operations

Your role is to EVALUATE code, not to modify the workspace. The Bash tool is ONLY for gathering additional information to inform your evaluation.`;

/**
 * Real World Problem evaluation system prompt
 * Focuses on practical implementation, testing, and code quality
 */
const REAL_WORLD_SYSTEM_PROMPT = `You are a senior software engineer evaluating code submissions for a technical interview.

## Your Role
Provide honest, constructive, and fair evaluations. Be critical but encouraging.
Focus on what the code does well and what could be improved.

## Assessment Type: Real World Problem
This is a practical coding assessment focused on implementing working software.
The candidate is expected to write functional code, tests, and handle edge cases.

## Evaluation Criteria (100 total points)

1. **Problem Completion (30 pts)**: Does the solution address all stated requirements? Is it functionally complete? Are all acceptance criteria met?
2. **Code Quality (25 pts)**: Is the code clean, readable, well-organized, and properly named? Does it follow SOLID principles?
3. **Testing (20 pts)**: Are there comprehensive tests? Do tests cover edge cases and error scenarios? Is test coverage adequate?
4. **Error Handling (15 pts)**: Are edge cases handled gracefully? Is there proper input validation? Are errors informative?
5. **Efficiency (10 pts)**: Is the solution reasonably performant? Are there obvious inefficiencies? Is complexity acceptable?

${SHARED_TOOL_INSTRUCTIONS}

## Workflow
1. First, run tests using RunTests to verify the solution works
2. Read test files to assess test coverage and quality
3. Read additional files for context (configs, related modules) if needed
4. List files to understand project structure if needed
5. After gathering context, provide your evaluation

## IMPORTANT: Final Evaluation Format
When ready to submit your evaluation, respond with EXACTLY this format:

FINAL_EVALUATION:
{
  "assessmentType": "REAL_WORLD",
  "overallScore": <0-100>,
  "criteria": {
    "problemCompletion": { "score": <0-30>, "maxScore": 30, "feedback": "<specific feedback>" },
    "codeQuality": { "score": <0-25>, "maxScore": 25, "feedback": "<specific feedback>" },
    "testing": { "score": <0-20>, "maxScore": 20, "feedback": "<specific feedback>" },
    "errorHandling": { "score": <0-15>, "maxScore": 15, "feedback": "<specific feedback>" },
    "efficiency": { "score": <0-10>, "maxScore": 10, "feedback": "<specific feedback>" }
  },
  "feedback": "<overall feedback paragraph>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"]
}`;

/**
 * System Design evaluation system prompt
 * Focuses on architecture, trade-offs, API design, and documentation
 */
const SYSTEM_DESIGN_SYSTEM_PROMPT = `You are a senior software architect evaluating system design submissions for a technical interview.

## Your Role
Provide honest, constructive, and fair evaluations of architectural decisions.
Focus on how well the candidate reasons about system design trade-offs.
Evaluate both the design documentation AND the partial implementation.

## Assessment Type: System Design (Hybrid)
This is a system design assessment with a hybrid format:
- The candidate writes a DESIGN.md document explaining their architecture
- The candidate implements core components (API contracts, key services)
- Both documentation and implementation are evaluated together

## Evaluation Criteria (100 total points)

1. **Design Clarity (30 pts)**: Is the architecture clearly documented? Are component responsibilities well-defined? Is the overall system structure understandable?
2. **Trade-off Analysis (25 pts)**: Does the candidate identify and discuss trade-offs? Are scalability, consistency, and availability considered? Are decisions justified?
3. **API Design (20 pts)**: Are API contracts well-structured? Are interfaces clean and intuitive? Is the API consistent and follows best practices?
4. **Implementation (15 pts)**: Does the code implement core logic correctly? Are the key components functional? Does implementation match the design?
5. **Communication (10 pts)**: Is the design document well-written? Are diagrams/explanations clear? Would a team understand this design?

${SHARED_TOOL_INSTRUCTIONS}

## Workflow
1. First, read the DESIGN.md or design document to understand the proposed architecture
2. Run tests using RunTests to verify the implementation works
3. Read implementation files to assess how well code matches the design
4. Read API contracts or interface definitions
5. After gathering context, provide your evaluation

## IMPORTANT: Final Evaluation Format
When ready to submit your evaluation, respond with EXACTLY this format:

FINAL_EVALUATION:
{
  "assessmentType": "SYSTEM_DESIGN",
  "overallScore": <0-100>,
  "criteria": {
    "designClarity": { "score": <0-30>, "maxScore": 30, "feedback": "<specific feedback>" },
    "tradeoffAnalysis": { "score": <0-25>, "maxScore": 25, "feedback": "<specific feedback>" },
    "apiDesign": { "score": <0-20>, "maxScore": 20, "feedback": "<specific feedback>" },
    "implementation": { "score": <0-15>, "maxScore": 15, "feedback": "<specific feedback>" },
    "communication": { "score": <0-10>, "maxScore": 10, "feedback": "<specific feedback>" }
  },
  "feedback": "<overall feedback paragraph>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"]
}`;

/**
 * Legacy system prompt for backwards compatibility
 * @deprecated Use REAL_WORLD_SYSTEM_PROMPT or SYSTEM_DESIGN_SYSTEM_PROMPT
 */
const SYSTEM_PROMPT = REAL_WORLD_SYSTEM_PROMPT;

// =============================================================================
// Tool Definitions (READ-ONLY only)
// =============================================================================

const EVALUATION_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'Read',
    description: 'Read the contents of a file from the workspace. Use this to examine test files, configurations, or other relevant code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to read. Must start with /workspace',
        },
        offset: {
          type: 'number',
          description: 'Character offset to start reading from (default: 0)',
        },
        limit: {
          type: 'number',
          description: 'Maximum characters to read (default: 5000)',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'ListFiles',
    description: 'List contents of a directory. Use to understand project structure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: "Directory to list (default: '/workspace')",
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively (default: false)',
        },
      },
    },
  },
  {
    name: 'Grep',
    description: 'Search for a pattern in files.',
    input_schema: {
      type: 'object' as const,
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
    description: 'Find files matching a glob pattern.',
    input_schema: {
      type: 'object' as const,
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
    name: 'RunTests',
    description: 'Execute the test suite to verify if the solution passes.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'Bash',
    description: 'Execute a shell command. RESTRICTED: Only use for running tests, checking versions, or reading file info. NEVER use for writing, deleting, or modifying files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute. Must be read-only (no file modifications).',
        },
      },
      required: ['command'],
    },
  },
];

// =============================================================================
// QuestionEvaluationAgent Class
// =============================================================================

export class QuestionEvaluationAgent {
  private client: Anthropic;
  private config: QuestionEvaluationConfig;
  private toolCallCount = 0;

  constructor(config: QuestionEvaluationConfig) {
    this.config = {
      ...config,
      passingThreshold: config.passingThreshold ?? DEFAULT_THRESHOLD,
      workspaceRoot: config.workspaceRoot ?? '/workspace',
      model: config.model ?? DEFAULT_MODEL,
      assessmentType: config.assessmentType ?? 'REAL_WORLD',
    };

    // Initialize with LangSmith tracing
    this.client = getTracedAnthropicClient(config.sessionId);
  }

  /**
   * Get the system prompt based on assessment type
   */
  private getSystemPrompt(): string {
    return this.config.assessmentType === 'SYSTEM_DESIGN'
      ? SYSTEM_DESIGN_SYSTEM_PROMPT
      : REAL_WORLD_SYSTEM_PROMPT;
  }

  /**
   * Evaluate the code submission using agent with tools
   */
  async evaluate(): Promise<EvaluationResult> {
    return traceAgentSession(
      this.config.sessionId,
      this.config.candidateId,
      async () => this._evaluateInternal(),
      {
        message: `Evaluating ${this.config.questionTitle} (${this.config.language})`,
      }
    );
  }

  /**
   * Internal evaluation implementation - always uses tools
   */
  private async _evaluateInternal(): Promise<EvaluationResult> {
    const startTime = Date.now();
    const evaluationPrompt = this.buildEvaluationPrompt();

    const conversation: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: evaluationPrompt },
    ];

    let totalUsage = { input_tokens: 0, output_tokens: 0 };
    let lastModel = '';
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await this.client.messages.create({
        model: this.config.model!,
        max_tokens: 4096,
        temperature: 0.3,
        system: this.getSystemPrompt(),
        messages: conversation,
        tools: EVALUATION_TOOLS,
      });

      totalUsage.input_tokens += response.usage.input_tokens;
      totalUsage.output_tokens += response.usage.output_tokens;
      lastModel = response.model;

      // Collect text and tool uses
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let responseText = '';

      for (const content of response.content) {
        if (content.type === 'text') {
          responseText += content.text;
        } else if (content.type === 'tool_use') {
          toolUseBlocks.push({
            id: content.id,
            name: content.name,
            input: content.input as Record<string, unknown>,
          });
        }
      }

      // Check if we have a final evaluation
      if (responseText.includes('FINAL_EVALUATION:') ||
          (responseText.includes('"overallScore"') && responseText.includes('"criteria"'))) {
        const evaluationTime = Date.now() - startTime;
        const result = this.parseEvaluationResult(responseText);

        return {
          ...result,
          passed: result.overallScore >= (this.config.passingThreshold ?? DEFAULT_THRESHOLD),
          metadata: {
            model: lastModel,
            usage: totalUsage,
            toolCallCount: this.toolCallCount,
            evaluationTime,
          },
        };
      }

      // No tool uses and no evaluation - end loop
      if (toolUseBlocks.length === 0) {
        break;
      }

      // Execute tools
      const toolResults = await this.executeTools(toolUseBlocks);

      // Add assistant response and tool results to conversation
      conversation.push({
        role: 'assistant',
        content: response.content,
      });
      conversation.push({
        role: 'user',
        content: toolResults,
      });
    }

    // If we get here without a final evaluation, request one
    conversation.push({
      role: 'user',
      content: 'Please provide your FINAL_EVALUATION now based on everything you\'ve observed.',
    });

    const finalResponse = await this.client.messages.create({
      model: this.config.model!,
      max_tokens: 2048,
      temperature: 0.3,
      system: this.getSystemPrompt(),
      messages: conversation,
    });

    totalUsage.input_tokens += finalResponse.usage.input_tokens;
    totalUsage.output_tokens += finalResponse.usage.output_tokens;

    const evaluationTime = Date.now() - startTime;
    const content = finalResponse.content[0];

    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const result = this.parseEvaluationResult(content.text);

    return {
      ...result,
      passed: result.overallScore >= (this.config.passingThreshold ?? DEFAULT_THRESHOLD),
      metadata: {
        model: finalResponse.model,
        usage: totalUsage,
        toolCallCount: this.toolCallCount,
        evaluationTime,
      },
    };
  }

  /**
   * Execute tools and return results
   */
  private async executeTools(
    toolBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }>> {
    const results = await Promise.all(
      toolBlocks.map(async (tool) => {
        this.toolCallCount++;

        return traceToolExecution(tool.name, tool.input, async () => {
          const result = await this.executeSingleTool(tool.name, tool.input);
          const isError = (result as Record<string, unknown>)?.success === false || (result as Record<string, unknown>)?.error;

          return {
            type: 'tool_result' as const,
            tool_use_id: tool.id,
            content: JSON.stringify(result),
            ...(isError && { is_error: true }),
          };
        });
      })
    );

    return results;
  }

  /**
   * Execute a single tool
   */
  private async executeSingleTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case 'Read':
        return this.toolRead(
          input.file_path as string,
          input.offset as number | undefined,
          input.limit as number | undefined
        );

      case 'ListFiles':
        return this.toolListFiles(
          input.path as string | undefined,
          input.recursive as boolean | undefined
        );

      case 'Grep':
        return this.toolGrep(
          input.pattern as string,
          input.path as string | undefined
        );

      case 'Glob':
        return this.toolGlob(input.pattern as string);

      case 'RunTests':
        return this.toolRunTests();

      case 'Bash':
        return this.toolBash(input.command as string);

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  // =============================================================================
  // Tool Implementations (READ-ONLY)
  // =============================================================================

  private async toolRead(
    filePath: string,
    offset?: number,
    limit?: number
  ): Promise<unknown> {
    if (!filePath) {
      return { success: false, error: 'Missing required parameter: file_path' };
    }

    const normalizedPath = this.normalizePath(filePath);

    try {
      const { readFile } = await import('../services/modal');
      const result = await readFile(this.config.sessionId, normalizedPath);

      if (!result.success || !result.content) {
        throw new Error(result.error || 'Failed to read file');
      }

      const fullContent = result.content;
      const totalSize = fullContent.length;
      const actualOffset = offset || 0;
      const actualLimit = limit || 5000;

      const content = fullContent.substring(actualOffset, actualOffset + actualLimit);
      const hasMore = actualOffset + actualLimit < totalSize;

      return {
        success: true,
        content,
        path: normalizedPath,
        totalSize,
        offset: actualOffset,
        limit: actualLimit,
        hasMore,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  }

  private async toolListFiles(path?: string, recursive?: boolean): Promise<unknown> {
    try {
      const { getFileSystem } = await import('../services/modal');
      const targetPath = path || '/workspace';
      const files = await getFileSystem(this.config.sessionId, targetPath);

      const results = files.map(file => ({
        name: file.name,
        path: file.path,
        type: file.type,
        size: file.size || 0,
      }));

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

  private async toolGrep(pattern: string, path?: string): Promise<unknown> {
    if (!pattern) {
      return { success: false, error: 'Missing required parameter: pattern', matches: [] };
    }

    try {
      const { getFileSystem, readFile } = await import('../services/modal');
      const files = await getFileSystem(this.config.sessionId, path || '/');
      const matches: Array<{ file: string; line: number; text: string }> = [];
      const regex = new RegExp(pattern);

      for (const file of files) {
        if (file.type === 'file') {
          try {
            const readResult = await readFile(this.config.sessionId, file.path);
            if (!readResult.success || !readResult.content) continue;
            const lines = readResult.content.split('\n');

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
            // Skip unreadable files
          }
        }
      }

      return { success: true, matches };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Grep failed',
        matches: [],
      };
    }
  }

  private async toolGlob(pattern: string): Promise<unknown> {
    if (!pattern) {
      return { success: false, error: 'Missing required parameter: pattern', files: [] };
    }

    try {
      const { getFileSystem } = await import('../services/modal');
      const allFiles = await getFileSystem(this.config.sessionId, '/');

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

      return { success: true, files: matchedFiles };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Glob failed',
        files: [],
      };
    }
  }

  private async toolRunTests(): Promise<unknown> {
    try {
      const { executeRunTests } = await import('../agent-tools/run-tests');

      // Use a placeholder sessionRecordingId for evaluation (results not saved)
      const result = await executeRunTests(
        this.config.candidateId,
        'evaluation-temp', // Temporary ID since we don't need to save
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

  private async toolBash(command: string): Promise<unknown> {
    if (!command) {
      return { success: false, error: 'Missing required parameter: command' };
    }

    // Security: Block dangerous commands for evaluation agent
    const blockedPatterns = [
      /\becho\s+.*>/,           // echo with redirect
      /\btee\b/,                // tee (writes to files)
      /\bsed\s+-i/,             // sed in-place edit
      /\brm\s/,                 // rm command
      /\brmdir\b/,              // rmdir command
      /\bmkdir\b/,              // mkdir command
      /\btouch\b/,              // touch command
      /\bmv\s/,                 // mv command
      /\bcp\s/,                 // cp command
      /\bchmod\b/,              // chmod command
      /\bchown\b/,              // chown command
      /\bcurl\b/,               // curl command
      /\bwget\b/,               // wget command
      /\bnpm\s+install/,        // npm install
      /\bnpm\s+i\b/,            // npm i
      /\bpip\s+install/,        // pip install
      /\bpip3\s+install/,       // pip3 install
      /\byarn\s+add/,           // yarn add
      /\bpnpm\s+add/,           // pnpm add
      /\bapt\b/,                // apt commands
      /\bbrew\b/,               // brew commands
      />/,                      // any redirect
      /\bsudo\b/,               // sudo
      /\bdd\b/,                 // dd command
      /\|.*>/,                  // pipe to redirect
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(command)) {
        return {
          success: false,
          error: `Command blocked: Evaluation agent cannot execute commands that modify files or install packages. Use read-only commands only.`,
        };
      }
    }

    try {
      const { runCommand } = await import('../services/modal');

      const result = await runCommand(this.config.sessionId, command);

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
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

  // =============================================================================
  // Helpers
  // =============================================================================

  private normalizePath(filePath: string): string {
    if (filePath.startsWith('/')) {
      return filePath;
    }
    const cleanPath = filePath.startsWith('./') ? filePath.slice(2) : filePath;
    return `${this.config.workspaceRoot}/${cleanPath}`;
  }

  private buildEvaluationPrompt(): string {
    const requirements = this.config.questionRequirements?.length
      ? '\n- ' + this.config.questionRequirements.join('\n- ')
      : 'Complete the given task';

    return `Evaluate this code solution for a technical interview.

**Question:** ${this.config.questionTitle}
**Difficulty:** ${this.config.questionDifficulty}
**Description:** ${this.config.questionDescription}

**Requirements:**
${requirements}

**Candidate's Code (${this.config.language}):**
\`\`\`${this.config.language}
${this.config.code}
\`\`\`

**Session ID for tools:** ${this.config.sessionId}

Before evaluating, you MUST:
1. Run tests using RunTests to verify the solution works
2. List files to understand the project structure
3. Read test files or other relevant files for context if needed

After gathering information, provide your FINAL_EVALUATION with JSON.
`;
  }

  private parseEvaluationResult(text: string): Omit<EvaluationResult, 'metadata'> {
    // Extract JSON from text
    let jsonText = text;

    if (text.includes('FINAL_EVALUATION:')) {
      jsonText = text.split('FINAL_EVALUATION:')[1];
    }

    // Remove markdown code blocks
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0];
    } else if (jsonText.includes('```')) {
      const parts = jsonText.split('```');
      for (const part of parts) {
        if (part.includes('"overallScore"')) {
          jsonText = part;
          break;
        }
      }
    }

    // Find JSON object using brace matching
    const startIdx = jsonText.indexOf('{');
    if (startIdx === -1) {
      throw new Error('Could not parse evaluation result: No JSON object found');
    }

    // Find matching closing brace
    let braceCount = 0;
    let endIdx = -1;
    for (let i = startIdx; i < jsonText.length; i++) {
      if (jsonText[i] === '{') braceCount++;
      else if (jsonText[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    if (endIdx === -1) {
      throw new Error('Could not parse evaluation result: Unbalanced JSON braces');
    }

    let jsonString = jsonText.substring(startIdx, endIdx);

    // Clean up common issues in the JSON string
    // Replace control characters that break JSON parsing
    jsonString = jsonString
      .replace(/[\x00-\x1F\x7F]/g, (char) => {
        // Preserve newlines and tabs in strings, but escape them
        if (char === '\n') return '\\n';
        if (char === '\r') return '\\r';
        if (char === '\t') return '\\t';
        return ''; // Remove other control characters
      });

    // Try to parse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any;
    try {
      json = JSON.parse(jsonString);
    } catch (parseError) {
      // Try to salvage the JSON by attempting to fix common issues
      try {
        // Sometimes feedback contains unescaped quotes or code blocks
        // Try a more aggressive cleanup
        jsonString = jsonString
          .replace(/\\(?!["\\/bfnrt])/g, '\\\\') // Escape lone backslashes
          .replace(/[\u2018\u2019]/g, "'") // Smart quotes to regular
          .replace(/[\u201C\u201D]/g, '"'); // Smart double quotes

        json = JSON.parse(jsonString);
      } catch {
        // Last resort: extract fields manually with regex
        const overallScoreMatch = jsonString.match(/"overallScore"\s*:\s*(\d+)/);
        const feedbackMatch = jsonString.match(/"feedback"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);

        if (overallScoreMatch) {
          // Build a minimal fallback result based on config assessment type
          return this.buildFallbackResult(jsonString, feedbackMatch);
        }

        // If we still can't parse, throw with context
        throw new Error(
          `Could not parse evaluation result: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}. ` +
          `First 500 chars: ${jsonString.substring(0, 500)}...`
        );
      }
    }

    // Determine assessment type from response or config
    const assessmentType: AssessmentType =
      json.assessmentType === 'SYSTEM_DESIGN' ? 'SYSTEM_DESIGN' :
      json.assessmentType === 'REAL_WORLD' ? 'REAL_WORLD' :
      (this.config.assessmentType || 'REAL_WORLD');

    // Build result with type-specific criteria structure
    return {
      overallScore: json.overallScore || 0,
      passed: false, // Will be set by caller based on threshold
      assessmentType,
      criteria: this.buildCriteriaFromJson(json.criteria, assessmentType),
      feedback: json.feedback || '',
      strengths: json.strengths || [],
      improvements: json.improvements || [],
    };
  }

  /**
   * Build type-specific criteria from JSON response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildCriteriaFromJson(criteria: any, type: AssessmentType): TypedEvaluationCriteria {
    if (type === 'SYSTEM_DESIGN') {
      return {
        designClarity: {
          score: criteria?.designClarity?.score || 0,
          maxScore: 30,
          feedback: criteria?.designClarity?.feedback || '',
        },
        tradeoffAnalysis: {
          score: criteria?.tradeoffAnalysis?.score || 0,
          maxScore: 25,
          feedback: criteria?.tradeoffAnalysis?.feedback || '',
        },
        apiDesign: {
          score: criteria?.apiDesign?.score || 0,
          maxScore: 20,
          feedback: criteria?.apiDesign?.feedback || '',
        },
        implementation: {
          score: criteria?.implementation?.score || 0,
          maxScore: 15,
          feedback: criteria?.implementation?.feedback || '',
        },
        communication: {
          score: criteria?.communication?.score || 0,
          maxScore: 10,
          feedback: criteria?.communication?.feedback || '',
        },
      } as SystemDesignEvaluationCriteria;
    }

    // REAL_WORLD (default)
    return {
      problemCompletion: {
        score: criteria?.problemCompletion?.score || 0,
        maxScore: 30,
        feedback: criteria?.problemCompletion?.feedback || '',
      },
      codeQuality: {
        score: criteria?.codeQuality?.score || 0,
        maxScore: 25,
        feedback: criteria?.codeQuality?.feedback || '',
      },
      testing: {
        score: criteria?.testing?.score || 0,
        maxScore: 20,
        feedback: criteria?.testing?.feedback || '',
      },
      errorHandling: {
        score: criteria?.errorHandling?.score || 0,
        maxScore: 15,
        feedback: criteria?.errorHandling?.feedback || '',
      },
      efficiency: {
        score: criteria?.efficiency?.score || 0,
        maxScore: 10,
        feedback: criteria?.efficiency?.feedback || '',
      },
    } as RealWorldEvaluationCriteria;
  }

  /**
   * Build a fallback result when JSON parsing fails
   */
  private buildFallbackResult(
    jsonString: string,
    feedbackMatch: RegExpMatchArray | null
  ): Omit<EvaluationResult, 'metadata'> {
    const extractNumber = (pattern: RegExp): number => {
      const match = jsonString.match(pattern);
      return match ? parseInt(match[1], 10) : 0;
    };

    const extractString = (pattern: RegExp): string => {
      const match = jsonString.match(pattern);
      return match ? match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '';
    };

    const assessmentType = this.config.assessmentType || 'REAL_WORLD';

    if (assessmentType === 'SYSTEM_DESIGN') {
      return {
        overallScore: extractNumber(/"overallScore"\s*:\s*(\d+)/),
        passed: false,
        assessmentType: 'SYSTEM_DESIGN',
        criteria: {
          designClarity: {
            score: extractNumber(/"designClarity"[^}]*"score"\s*:\s*(\d+)/),
            maxScore: 30,
            feedback: extractString(/"designClarity"[^}]*"feedback"\s*:\s*"([^"]+)"/),
          },
          tradeoffAnalysis: {
            score: extractNumber(/"tradeoffAnalysis"[^}]*"score"\s*:\s*(\d+)/),
            maxScore: 25,
            feedback: extractString(/"tradeoffAnalysis"[^}]*"feedback"\s*:\s*"([^"]+)"/),
          },
          apiDesign: {
            score: extractNumber(/"apiDesign"[^}]*"score"\s*:\s*(\d+)/),
            maxScore: 20,
            feedback: extractString(/"apiDesign"[^}]*"feedback"\s*:\s*"([^"]+)"/),
          },
          implementation: {
            score: extractNumber(/"implementation"[^}]*"score"\s*:\s*(\d+)/),
            maxScore: 15,
            feedback: extractString(/"implementation"[^}]*"feedback"\s*:\s*"([^"]+)"/),
          },
          communication: {
            score: extractNumber(/"communication"[^}]*"score"\s*:\s*(\d+)/),
            maxScore: 10,
            feedback: extractString(/"communication"[^}]*"feedback"\s*:\s*"([^"]+)"/),
          },
        } as SystemDesignEvaluationCriteria,
        feedback: feedbackMatch ? feedbackMatch[1] : 'Evaluation completed but feedback parsing failed.',
        strengths: [],
        improvements: [],
      };
    }

    // REAL_WORLD (default)
    return {
      overallScore: extractNumber(/"overallScore"\s*:\s*(\d+)/),
      passed: false,
      assessmentType: 'REAL_WORLD',
      criteria: {
        problemCompletion: {
          score: extractNumber(/"problemCompletion"[^}]*"score"\s*:\s*(\d+)/),
          maxScore: 30,
          feedback: extractString(/"problemCompletion"[^}]*"feedback"\s*:\s*"([^"]+)"/),
        },
        codeQuality: {
          score: extractNumber(/"codeQuality"[^}]*"score"\s*:\s*(\d+)/),
          maxScore: 25,
          feedback: extractString(/"codeQuality"[^}]*"feedback"\s*:\s*"([^"]+)"/),
        },
        testing: {
          score: extractNumber(/"testing"[^}]*"score"\s*:\s*(\d+)/),
          maxScore: 20,
          feedback: extractString(/"testing"[^}]*"feedback"\s*:\s*"([^"]+)"/),
        },
        errorHandling: {
          score: extractNumber(/"errorHandling"[^}]*"score"\s*:\s*(\d+)/),
          maxScore: 15,
          feedback: extractString(/"errorHandling"[^}]*"feedback"\s*:\s*"([^"]+)"/),
        },
        efficiency: {
          score: extractNumber(/"efficiency"[^}]*"score"\s*:\s*(\d+)/),
          maxScore: 10,
          feedback: extractString(/"efficiency"[^}]*"feedback"\s*:\s*"([^"]+)"/),
        },
      } as RealWorldEvaluationCriteria,
      feedback: feedbackMatch ? feedbackMatch[1] : 'Evaluation completed but feedback parsing failed.',
      strengths: [],
      improvements: [],
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Question Evaluation Agent
 *
 * @param config - Evaluation configuration
 * @returns QuestionEvaluationAgent instance
 */
export function createQuestionEvaluationAgent(
  config: QuestionEvaluationConfig
): QuestionEvaluationAgent {
  return new QuestionEvaluationAgent(config);
}
