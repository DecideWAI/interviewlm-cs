/**
 * Fast Progression Agent
 *
 * Speed-optimized evaluation agent for live interview progression decisions.
 * Uses Claude Haiku with limited iterations and parallel tool execution.
 *
 * Key optimizations:
 * - Haiku model for speed (~3x faster than Sonnet)
 * - Max 2-3 tool iterations (vs 5+ for comprehensive)
 * - Parallel tool execution
 * - No RunTests - trusts test results from UI
 * - Concise prompts for faster inference
 *
 * Target: ~20-40 seconds for pass/fail decision
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getTracedAnthropicClient,
  traceToolExecution,
  traceAgentSession,
} from '../observability/langsmith';
import {
  buildCachedSystemPrompt,
  addMessageCacheBreakpoints,
  extractCacheMetrics,
  logCacheMetrics,
} from '../utils/agent-utils';
import type { AssessmentType } from '@/types/seed';
import {
  type FastEvaluationInput,
  type FastEvaluationResult,
  type FastEvaluationCriteria,
  type FastRealWorldCriteria,
  type FastSystemDesignCriteria,
  type FastCriterionScore,
  FAST_AGENT_DEFAULTS,
  createDefaultFastResult,
} from '../types/fast-evaluation';

// =============================================================================
// Constants
// =============================================================================

const { MODEL, MAX_ITERATIONS, MAX_TOKENS, TEMPERATURE, PASSING_THRESHOLD } =
  FAST_AGENT_DEFAULTS;

// =============================================================================
// Prompts
// =============================================================================

/**
 * Speed-optimized system prompt - concise and directive
 */
const buildSystemPrompt = (
  assessmentType: AssessmentType,
  testResults: { passed: number; failed: number; total: number },
  passingThreshold: number
): string => {
  const rubric =
    assessmentType === 'SYSTEM_DESIGN'
      ? `## Rubric (System Design - 100 pts total)
1. Design Clarity (30 pts): Architecture documented? Components clear?
2. Trade-off Analysis (25 pts): Scalability/consistency/availability discussed?
3. API Design (20 pts): Clean interfaces? Well-structured contracts?
4. Implementation (15 pts): Core logic functional? Matches design?
5. Communication (10 pts): Documentation clear?`
      : `## Rubric (Real World - 100 pts total)
1. Problem Completion (30 pts): Requirements met? Functionally complete?
2. Code Quality (25 pts): Clean, readable, organized?
3. Testing (20 pts): Tests cover edge cases? Adequate coverage?
4. Error Handling (15 pts): Edge cases handled? Graceful failures?
5. Efficiency (10 pts): Reasonably performant?`;

  return `You are a FAST code evaluator. Goal: quick, decisive pass/fail evaluation.

## Speed Rules (CRITICAL)
- Make at most 2-3 tool calls total
- Start with ListFiles to find solution, then Read it
- Trust the provided test results - DO NOT run tests
- Be decisive - this is a gate check, not comprehensive review

${rubric}

## Test Results (Trusted - DO NOT re-run)
${testResults.passed}/${testResults.total} tests passed
${testResults.passed === testResults.total ? '(All tests passing)' : `(${testResults.failed} tests failing)`}

## Passing Threshold
Score >= ${passingThreshold}/100 to pass

## Required Workflow
1. ListFiles /workspace to find solution file
2. Read the main solution file
3. Call SubmitFastEvaluation with scores

DO NOT explore extensively. Quick assessment only.`;
};

/**
 * Build user prompt with question context
 */
const buildUserPrompt = (input: FastEvaluationInput): string => {
  const requirements = input.questionRequirements?.length
    ? input.questionRequirements.map((r) => `- ${r}`).join('\n')
    : '- Complete the given task';

  const fileHint = input.fileName
    ? `Primary file: ${input.fileName}`
    : `Look for: solution.*, main.*, index.*, app.*`;

  return `Evaluate this submission for progression to next question.

## Question
**Title:** ${input.questionTitle}
**Difficulty:** ${input.questionDifficulty}
**Type:** ${input.assessmentType}

**Description:**
${input.questionDescription}

**Requirements:**
${requirements}

## Test Results (from UI - trusted)
- Passed: ${input.testResults.passed}/${input.testResults.total}
- Failed: ${input.testResults.failed}
${input.testResults.output ? `- Output: ${input.testResults.output.slice(0, 500)}` : ''}

## Code Location
- Language: ${input.language}
- ${fileHint}
- Workspace: /workspace/

Start evaluation now. Use ListFiles then Read, then SubmitFastEvaluation.`;
};

// =============================================================================
// Tool Definitions (Speed-Optimized Subset)
// =============================================================================

/**
 * SubmitFastEvaluation tool - required final tool
 */
const SUBMIT_FAST_EVALUATION_TOOL: Anthropic.Messages.Tool = {
  name: 'SubmitFastEvaluation',
  description:
    'Submit your final fast evaluation. This is the ONLY way to complete. You MUST call this after reading the code.',
  input_schema: {
    type: 'object' as const,
    properties: {
      assessmentType: {
        type: 'string',
        enum: ['REAL_WORLD', 'SYSTEM_DESIGN'],
        description: 'Assessment type',
      },
      overallScore: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Overall score 0-100',
      },
      criteria: {
        type: 'object',
        description:
          'Scores for each criterion. For REAL_WORLD: problemCompletion, codeQuality, testing, errorHandling, efficiency. For SYSTEM_DESIGN: designClarity, tradeoffAnalysis, apiDesign, implementation, communication.',
        additionalProperties: {
          type: 'object',
          properties: {
            score: { type: 'number', description: 'Score for criterion' },
            maxScore: { type: 'number', description: 'Max possible score' },
            met: { type: 'boolean', description: 'Criterion met?' },
            feedback: { type: 'string', description: 'Brief 1-sentence feedback' },
          },
          required: ['score', 'maxScore', 'met', 'feedback'],
        },
      },
      feedback: {
        type: 'string',
        description: 'Overall feedback (2-3 sentences max)',
      },
      blockingReason: {
        type: 'string',
        description: 'If failing, why? (1 sentence)',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
        description: 'Top 3 strengths',
      },
      improvements: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
        description: 'Top 3 improvements',
      },
    },
    required: ['assessmentType', 'overallScore', 'criteria', 'feedback', 'strengths', 'improvements'],
  },
};

/**
 * Read-only tools (NO RunTests)
 */
const FAST_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'Read',
    description: 'Read file contents. Use to read the solution code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to file (e.g., /workspace/solution.ts)',
        },
        limit: {
          type: 'number',
          description: 'Max characters to read (default: 10000)',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'ListFiles',
    description: 'List directory contents. Use first to find solution file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: "Directory to list (default: '/workspace')",
        },
        recursive: {
          type: 'boolean',
          description: 'List recursively? (default: false)',
        },
      },
    },
  },
  {
    name: 'Grep',
    description: 'Search for pattern in files. Use sparingly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search',
        },
        path: {
          type: 'string',
          description: 'Path to search in',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Glob',
    description: 'Find files by pattern.',
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
];

/**
 * All tools available to fast agent
 */
const ALL_FAST_TOOLS: Anthropic.Messages.Tool[] = [
  ...FAST_TOOLS,
  SUBMIT_FAST_EVALUATION_TOOL,
];

// =============================================================================
// FastProgressionAgent Class
// =============================================================================

export class FastProgressionAgent {
  private client: Anthropic;
  private input: FastEvaluationInput;
  private toolCallCount = 0;

  constructor(input: FastEvaluationInput) {
    this.input = {
      ...input,
      passingThreshold: input.passingThreshold ?? PASSING_THRESHOLD,
    };
    this.client = getTracedAnthropicClient(input.sessionId);
  }

  /**
   * Evaluate the code submission with speed optimizations
   */
  async evaluate(): Promise<FastEvaluationResult> {
    return traceAgentSession(
      this.input.sessionId,
      this.input.candidateId,
      async () => this._evaluateInternal(),
      {
        message: `Fast evaluation: ${this.input.questionTitle} (${this.input.language})`,
      }
    );
  }

  /**
   * Internal evaluation implementation
   */
  private async _evaluateInternal(): Promise<FastEvaluationResult> {
    const startTime = Date.now();

    console.log('[FastProgressionAgent] Starting fast evaluation');
    console.log('[FastProgressionAgent] Candidate:', this.input.candidateId);
    console.log('[FastProgressionAgent] Question:', this.input.questionTitle);
    console.log(
      '[FastProgressionAgent] Tests:',
      `${this.input.testResults.passed}/${this.input.testResults.total}`
    );

    const conversation: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: buildUserPrompt(this.input) },
    ];

    let totalUsage = { input_tokens: 0, output_tokens: 0 };
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`[FastProgressionAgent] Iteration ${iterations}/${MAX_ITERATIONS}`);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: buildCachedSystemPrompt(
          buildSystemPrompt(
            this.input.assessmentType,
            this.input.testResults,
            this.input.passingThreshold!
          )
        ),
        messages: addMessageCacheBreakpoints(conversation),
        tools: ALL_FAST_TOOLS,
      });

      // Log cache metrics
      const cacheMetrics = extractCacheMetrics(response);
      logCacheMetrics(cacheMetrics, 'FastProgression');

      totalUsage.input_tokens += response.usage.input_tokens;
      totalUsage.output_tokens += response.usage.output_tokens;

      // Collect tool uses and check for submission
      const toolUseBlocks: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];
      let submitInput: Record<string, unknown> | null = null;

      for (const content of response.content) {
        if (content.type === 'tool_use') {
          if (content.name === 'SubmitFastEvaluation') {
            submitInput = content.input as Record<string, unknown>;
          } else {
            toolUseBlocks.push({
              id: content.id,
              name: content.name,
              input: content.input as Record<string, unknown>,
            });
          }
        }
      }

      // If submission found, extract and return result
      if (submitInput) {
        const evaluationTime = Date.now() - startTime;
        console.log(
          `[FastProgressionAgent] Evaluation complete in ${evaluationTime}ms`
        );

        return this.extractResult(submitInput, {
          evaluationTimeMs: evaluationTime,
          inputTokens: totalUsage.input_tokens,
          outputTokens: totalUsage.output_tokens,
        });
      }

      // No tool uses and no submission - break
      if (toolUseBlocks.length === 0) {
        console.log('[FastProgressionAgent] No tool calls, forcing submission');
        break;
      }

      // Execute tools in PARALLEL for speed
      console.log(
        `[FastProgressionAgent] Executing ${toolUseBlocks.length} tools in parallel`
      );
      const toolResults = await this.executeToolsParallel(toolUseBlocks);
      this.toolCallCount += toolUseBlocks.length;

      // Add to conversation
      conversation.push({
        role: 'assistant',
        content: response.content,
      });
      conversation.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Force submission if iterations exhausted
    return this.forceSubmission(conversation, startTime, totalUsage);
  }

  /**
   * Execute tools in parallel for speed
   */
  private async executeToolsParallel(
    toolBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<
    Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }>
  > {
    const results = await Promise.all(
      toolBlocks.map(async (tool) => {
        return traceToolExecution(tool.name, tool.input, async () => {
          const result = await this.executeSingleTool(tool.name, tool.input);
          const isError =
            (result as Record<string, unknown>)?.success === false ||
            (result as Record<string, unknown>)?.error;

          return {
            type: 'tool_result' as const,
            tool_use_id: tool.id,
            content: JSON.stringify(result),
            ...(isError ? { is_error: true } : {}),
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

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  // =============================================================================
  // Tool Implementations (READ-ONLY, NO RunTests)
  // =============================================================================

  private async toolRead(
    filePath: string,
    limit?: number
  ): Promise<unknown> {
    if (!filePath) {
      return { success: false, error: 'Missing file_path' };
    }

    const normalizedPath = this.normalizePath(filePath);

    try {
      const { readFile } = await import('../services/modal');
      const result = await readFile(this.input.candidateId, normalizedPath);

      if (!result.success || !result.content) {
        throw new Error(result.error || 'Failed to read file');
      }

      const fullContent = result.content;
      const actualLimit = limit || 10000; // Larger limit for fast agent
      const content = fullContent.substring(0, actualLimit);
      const hasMore = fullContent.length > actualLimit;

      return {
        success: true,
        content,
        path: normalizedPath,
        totalSize: fullContent.length,
        truncated: hasMore,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  }

  private async toolListFiles(
    path?: string,
    recursive?: boolean
  ): Promise<unknown> {
    try {
      const { getFileSystem } = await import('../services/modal');
      const targetPath = path || '/workspace';
      const files = await getFileSystem(this.input.candidateId, targetPath);

      const results = files.map((file) => ({
        name: file.name,
        path: file.path,
        type: file.type,
        size: file.size || 0,
      }));

      const filteredResults = recursive
        ? results
        : results.filter((f) => {
            const relativePath = f.path
              .replace(targetPath, '')
              .replace(/^\//, '');
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
      return { success: false, error: 'Missing pattern', matches: [] };
    }

    try {
      const { getFileSystem, readFile } = await import('../services/modal');
      const files = await getFileSystem(
        this.input.candidateId,
        path || '/workspace'
      );
      const matches: Array<{ file: string; line: number; text: string }> = [];
      const regex = new RegExp(pattern);

      // Limit grep to avoid slow operations
      const maxFiles = 10;
      const maxMatches = 20;
      let filesSearched = 0;

      for (const file of files) {
        if (filesSearched >= maxFiles || matches.length >= maxMatches) break;
        if (file.type !== 'file') continue;

        try {
          const readResult = await readFile(this.input.candidateId, file.path);
          if (!readResult.success || !readResult.content) continue;

          filesSearched++;
          const lines = readResult.content.split('\n');

          lines.forEach((line, index) => {
            if (matches.length < maxMatches && regex.test(line)) {
              matches.push({
                file: file.path,
                line: index + 1,
                text: line.trim().slice(0, 100),
              });
            }
          });
        } catch {
          // Skip unreadable files
        }
      }

      return { success: true, matches, limited: matches.length >= maxMatches };
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
      return { success: false, error: 'Missing pattern', files: [] };
    }

    try {
      const { getFileSystem } = await import('../services/modal');
      const allFiles = await getFileSystem(this.input.candidateId, '/workspace');

      const regex = new RegExp(
        '^' +
          pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\./g, '\\.') +
          '$'
      );

      const matchedFiles = allFiles
        .filter((file) => file.type === 'file' && regex.test(file.path))
        .map((file) => file.path)
        .slice(0, 20); // Limit results

      return { success: true, files: matchedFiles };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Glob failed',
        files: [],
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
    return `/workspace/${cleanPath}`;
  }

  /**
   * Extract result from SubmitFastEvaluation tool input
   */
  private extractResult(
    input: Record<string, unknown>,
    metadata: {
      evaluationTimeMs: number;
      inputTokens: number;
      outputTokens: number;
    }
  ): FastEvaluationResult {
    const assessmentType =
      (input.assessmentType as AssessmentType) || this.input.assessmentType;
    const overallScore =
      typeof input.overallScore === 'number' ? input.overallScore : 0;
    const feedback = typeof input.feedback === 'string' ? input.feedback : '';
    const blockingReason =
      typeof input.blockingReason === 'string' ? input.blockingReason : undefined;
    const strengths = Array.isArray(input.strengths)
      ? input.strengths.filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];
    const improvements = Array.isArray(input.improvements)
      ? input.improvements
          .filter((s): s is string => typeof s === 'string')
          .slice(0, 3)
      : [];

    const criteria = this.buildCriteria(
      input.criteria as Record<string, Record<string, unknown>> | undefined,
      assessmentType
    );

    const passed = overallScore >= (this.input.passingThreshold ?? PASSING_THRESHOLD);

    return {
      passed,
      overallScore,
      assessmentType,
      criteria,
      feedback,
      blockingReason: passed ? undefined : blockingReason,
      strengths,
      improvements,
      metadata: {
        model: MODEL,
        evaluationTimeMs: metadata.evaluationTimeMs,
        toolCallCount: this.toolCallCount,
        inputTokens: metadata.inputTokens,
        outputTokens: metadata.outputTokens,
      },
    };
  }

  /**
   * Build typed criteria from tool input
   */
  private buildCriteria(
    rawCriteria: Record<string, Record<string, unknown>> | undefined,
    type: AssessmentType
  ): FastEvaluationCriteria {
    const getCriterion = (key: string, maxScore: number): FastCriterionScore => {
      const raw = rawCriteria?.[key];
      const score = typeof raw?.score === 'number' ? raw.score : 0;
      return {
        score,
        maxScore: typeof raw?.maxScore === 'number' ? raw.maxScore : maxScore,
        met: typeof raw?.met === 'boolean' ? raw.met : score >= maxScore * 0.6,
        feedback: typeof raw?.feedback === 'string' ? raw.feedback : '',
      };
    };

    if (type === 'SYSTEM_DESIGN') {
      return {
        designClarity: getCriterion('designClarity', 30),
        tradeoffAnalysis: getCriterion('tradeoffAnalysis', 25),
        apiDesign: getCriterion('apiDesign', 20),
        implementation: getCriterion('implementation', 15),
        communication: getCriterion('communication', 10),
      } as FastSystemDesignCriteria;
    }

    // REAL_WORLD (default)
    return {
      problemCompletion: getCriterion('problemCompletion', 30),
      codeQuality: getCriterion('codeQuality', 25),
      testing: getCriterion('testing', 20),
      errorHandling: getCriterion('errorHandling', 15),
      efficiency: getCriterion('efficiency', 10),
    } as FastRealWorldCriteria;
  }

  /**
   * Force submission when iterations exhausted
   */
  private async forceSubmission(
    conversation: Anthropic.Messages.MessageParam[],
    startTime: number,
    totalUsage: { input_tokens: number; output_tokens: number }
  ): Promise<FastEvaluationResult> {
    console.log('[FastProgressionAgent] Forcing final submission');

    // Add force submission message
    conversation.push({
      role: 'user',
      content: `You MUST call SubmitFastEvaluation NOW with your assessment. Based on what you've seen, provide scores. This is required.`,
    });

    const finalResponse = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: buildCachedSystemPrompt(
        buildSystemPrompt(
          this.input.assessmentType,
          this.input.testResults,
          this.input.passingThreshold!
        )
      ),
      messages: addMessageCacheBreakpoints(conversation),
      tools: [SUBMIT_FAST_EVALUATION_TOOL],
      tool_choice: { type: 'tool', name: 'SubmitFastEvaluation' },
    });

    totalUsage.input_tokens += finalResponse.usage.input_tokens;
    totalUsage.output_tokens += finalResponse.usage.output_tokens;

    const evaluationTime = Date.now() - startTime;

    // Extract submission
    for (const content of finalResponse.content) {
      if (content.type === 'tool_use' && content.name === 'SubmitFastEvaluation') {
        return this.extractResult(content.input as Record<string, unknown>, {
          evaluationTimeMs: evaluationTime,
          inputTokens: totalUsage.input_tokens,
          outputTokens: totalUsage.output_tokens,
        });
      }
    }

    // Ultimate fallback - return default based on test results
    console.warn('[FastProgressionAgent] No submission found, using test-based fallback');

    const testPassRate =
      this.input.testResults.total > 0
        ? (this.input.testResults.passed / this.input.testResults.total) * 100
        : 0;

    const fallbackResult = createDefaultFastResult(
      this.input.sessionId,
      this.input.assessmentType
    );

    return {
      ...fallbackResult,
      overallScore: testPassRate,
      passed: testPassRate >= (this.input.passingThreshold ?? PASSING_THRESHOLD),
      feedback:
        'Evaluation incomplete. Score based on test results only. Please retry.',
      blockingReason:
        testPassRate < (this.input.passingThreshold ?? PASSING_THRESHOLD)
          ? `Only ${this.input.testResults.passed}/${this.input.testResults.total} tests passing`
          : undefined,
      metadata: {
        model: MODEL,
        evaluationTimeMs: evaluationTime,
        toolCallCount: this.toolCallCount,
        inputTokens: totalUsage.input_tokens,
        outputTokens: totalUsage.output_tokens,
      },
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Fast Progression Agent
 */
export function createFastProgressionAgent(
  input: FastEvaluationInput
): FastProgressionAgent {
  return new FastProgressionAgent(input);
}
