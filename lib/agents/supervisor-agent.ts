/**
 * Supervisor Agent - TypeScript Implementation
 *
 * Coordinates between specialized agents (Coding, Interview, Evaluation)
 * using tool-based handoffs with the Anthropic SDK.
 *
 * Ported from the Python LangGraph implementation.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/utils/logger";
import {
  InterviewAgent,
  createInterviewAgent,
} from "@/lib/agents/interview-agent";
import {
  SessionEvaluationAgent,
  createSessionEvaluationAgent,
} from "@/lib/agents/session-evaluation-agent";
import { InterviewMetrics, InterviewEventType } from "@/lib/types/interview-agent";
import { SessionEvaluationResult, SessionData } from "@/lib/types/session-evaluation";
import { HelpfulnessLevel } from "@/lib/types/agent";
import {
  createAgentClient,
  buildCachedSystemPrompt,
  extractCacheMetrics,
  logCacheMetrics,
} from "@/lib/utils/agent-utils";

// =============================================================================
// Types
// =============================================================================

export type AgentType = "coding" | "interview" | "evaluation" | "end";

export interface SupervisorConfig {
  sessionId: string;
  candidateId: string;
  defaultHelpfulnessLevel?: HelpfulnessLevel;
}

export interface SupervisorState {
  sessionId: string;
  candidateId: string;
  nextAgent: AgentType | null;
  taskInfo: Record<string, unknown>;
  codingResult: Record<string, unknown> | null;
  interviewResult: Record<string, unknown> | null;
  evaluationResult: Record<string, unknown> | null;
  workflowComplete: boolean;
}

export interface WorkflowResult {
  codingResult: Record<string, unknown> | null;
  interviewResult: Record<string, unknown> | null;
  evaluationResult: Record<string, unknown> | null;
  summary?: string;
}

// =============================================================================
// Handoff Tools Definition
// =============================================================================

const SUPERVISOR_TOOLS: Anthropic.Tool[] = [
  {
    name: "handoff_to_coding_agent",
    description:
      "Hand off to the Coding Agent for code assistance tasks.\n" +
      "Use this when the candidate needs help with:\n" +
      "- Writing or editing code\n" +
      "- Debugging issues\n" +
      "- Running tests\n" +
      "- File operations\n" +
      "- Understanding code structure",
    input_schema: {
      type: "object",
      properties: {
        task_description: {
          type: "string",
          description: "Description of what the candidate needs help with",
        },
        session_id: {
          type: "string",
          description: "Session identifier for the interview",
        },
        helpfulness_level: {
          type: "string",
          enum: ["consultant", "pair-programming", "full-copilot"],
          description: "Level of assistance to provide",
        },
      },
      required: ["task_description", "session_id"],
    },
  },
  {
    name: "handoff_to_interview_agent",
    description:
      "Hand off to the Interview Agent for tracking metrics.\n" +
      "Use this to report interview events that should be tracked:\n" +
      "- AI interactions\n" +
      "- Code changes\n" +
      "- Test runs\n" +
      "- Question completions\n\n" +
      "Note: Interview Agent runs in background and is hidden from candidates.",
    input_schema: {
      type: "object",
      properties: {
        event_type: {
          type: "string",
          enum: [
            "session-started",
            "ai-interaction",
            "code-changed",
            "test-run",
            "question-answered",
            "session-complete",
          ],
          description: "Type of event to record",
        },
        event_data: {
          type: "object",
          description: "Event-specific data",
        },
        session_id: {
          type: "string",
          description: "Session identifier",
        },
      },
      required: ["event_type", "session_id"],
    },
  },
  {
    name: "handoff_to_evaluation_agent",
    description:
      "Hand off to the Evaluation Agent to evaluate a completed session.\n" +
      "Use this when an interview session is complete and needs evaluation.\n" +
      "The Evaluation Agent will analyze code quality, problem solving,\n" +
      "AI collaboration, and communication skills.",
    input_schema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Session identifier to evaluate",
        },
        candidate_id: {
          type: "string",
          description: "Candidate identifier",
        },
      },
      required: ["session_id", "candidate_id"],
    },
  },
  {
    name: "complete_workflow",
    description:
      "Mark the workflow as complete.\n" +
      "Use this when all tasks have been completed and no further\n" +
      "agent assistance is needed.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Summary of what was accomplished",
        },
      },
      required: ["summary"],
    },
  },
];

// =============================================================================
// Supervisor System Prompt
// =============================================================================

/**
 * NOTE: This prompt is intentionally detailed (~1200+ tokens) to enable
 * Anthropic's prompt caching. Minimum ~1024 tokens required for caching.
 */
const SUPERVISOR_SYSTEM_PROMPT = `You are a Supervisor Agent coordinating an AI-powered technical interview platform called InterviewLM. Your primary responsibility is to route requests between specialized agents while maintaining interview integrity and tracking all relevant events.

## Platform Overview

InterviewLM evaluates candidates' ability to effectively collaborate with AI coding tools in realistic development environments. Candidates work in secure sandboxes solving coding problems with AI assistance. The platform monitors problem-solving approach, AI prompt quality, and code quality to provide comprehensive assessments.

## Specialized Agents Under Your Coordination

### 1. Coding Agent
The Coding Agent provides direct assistance to candidates during interviews. It operates within a Modal AI sandbox environment with access to file system, terminal, and code execution capabilities.

**When to use \`handoff_to_coding_agent\`:**
- Writing, editing, or refactoring code
- Debugging issues, analyzing errors, or fixing bugs
- Running tests and interpreting results
- File system operations (create, read, update files)
- Understanding code structure or architecture
- Implementing algorithms or data structures
- Explaining code concepts or patterns

**Parameters:**
- \`task_description\`: Clear description of what the candidate needs help with
- \`session_id\`: Session identifier for context tracking
- \`helpfulness_level\`: Level of assistance to provide:
  - \`consultant\`: Guidance and hints only, candidate writes code
  - \`pair-programming\`: Collaborative coding, AI and candidate work together
  - \`full-copilot\`: AI can write complete implementations

### 2. Interview Agent
The Interview Agent runs silently in the background, tracking metrics and events for later evaluation. Candidates are not aware of this agent.

**When to use \`handoff_to_interview_agent\`:**
- After any AI interaction to log the exchange
- When code changes are detected
- After test runs (pass or fail)
- When a question is answered or submitted
- At session start and completion

**Event Types:**
- \`session-started\`: Interview session begins
- \`ai-interaction\`: Candidate interacted with AI assistant
- \`code-changed\`: Code was modified in the sandbox
- \`test-run\`: Tests were executed
- \`question-answered\`: Candidate submitted their answer
- \`session-complete\`: Interview session ended

**Event Data Structure:**
Event data should include relevant context like timestamps, prompt quality indicators, code diffs, test results, and any performance metrics available.

### 3. Evaluation Agent
The Evaluation Agent performs comprehensive assessment of completed interview sessions.

**When to use \`handoff_to_evaluation_agent\`:**
- Only after \`session-complete\` event has been recorded
- When the interview is fully finished
- To generate final candidate assessment

**Evaluation Dimensions:**
- Code Quality: Correctness, efficiency, maintainability, best practices
- Problem Solving: Approach, decomposition, debugging strategy
- AI Collaboration: Prompt quality, iteration effectiveness, tool usage
- Communication: Clarity, technical vocabulary, documentation

## Your Responsibilities

1. **Request Routing**: Analyze incoming requests and route to the appropriate agent
2. **Event Tracking**: Ensure all significant events are logged via Interview Agent
3. **Workflow Coordination**: Manage multi-step workflows that span multiple agents
4. **Interview Integrity**: Never reveal evaluation details, scores, or internal metrics to candidates
5. **Session Management**: Track session state and ensure proper workflow completion

## Workflow Patterns

### Coding Assistance Request
1. \`handoff_to_coding_agent\` with task description
2. \`handoff_to_interview_agent\` to record \`ai-interaction\` event
3. Continue or complete based on context

### Test Execution
1. \`handoff_to_coding_agent\` to run tests
2. \`handoff_to_interview_agent\` to record \`test-run\` event with results

### Session Completion
1. \`handoff_to_interview_agent\` to record \`session-complete\` event
2. \`handoff_to_evaluation_agent\` to generate assessment
3. \`complete_workflow\` with summary

## Important Guidelines

- Always maintain candidate-facing neutrality - don't reveal scoring or evaluation
- Log events promptly to ensure complete data for evaluation
- When uncertain about routing, prefer Coding Agent for candidate-facing requests
- Use \`complete_workflow\` only when all tasks are genuinely finished
- Include comprehensive task descriptions when handing off to other agents

Use your judgment to coordinate effectively while maintaining interview integrity.`;

// =============================================================================
// Agent Instance Cache
// =============================================================================

const interviewAgentCache = new Map<string, InterviewAgent>();

function getInterviewAgent(sessionId: string, candidateId: string): InterviewAgent {
  if (!interviewAgentCache.has(sessionId)) {
    interviewAgentCache.set(
      sessionId,
      createInterviewAgent({ sessionId, candidateId })
    );
  }
  return interviewAgentCache.get(sessionId)!;
}

// =============================================================================
// Supervisor Agent Class
// =============================================================================

/**
 * Supervisor Agent
 *
 * Coordinates between specialized agents using tool-based handoffs.
 */
export class SupervisorAgent {
  private client: Anthropic;
  private sessionId: string;
  private candidateId: string;
  private defaultHelpfulnessLevel: HelpfulnessLevel;
  private sessionData?: SessionData;

  constructor(config: SupervisorConfig) {
    // Use shared client with caching always enabled
    this.client = createAgentClient({ threadId: config.sessionId });
    this.sessionId = config.sessionId;
    this.candidateId = config.candidateId;
    this.defaultHelpfulnessLevel = config.defaultHelpfulnessLevel ?? "pair-programming";
  }

  /**
   * Set session data for evaluation
   */
  setSessionData(data: SessionData): void {
    this.sessionData = data;
  }

  /**
   * Run a multi-agent workflow
   *
   * @param task - Description of the task to perform
   * @returns Results from all agents involved
   */
  async runWorkflow(task: string): Promise<WorkflowResult> {
    logger.info("Supervisor Agent starting workflow", {
      sessionId: this.sessionId,
      task: task.substring(0, 100),
    });

    const state: SupervisorState = {
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      nextAgent: null,
      taskInfo: {},
      codingResult: null,
      interviewResult: null,
      evaluationResult: null,
      workflowComplete: false,
    };

    let summary = "";
    let iterations = 0;
    const maxIterations = 10;

    while (!state.workflowComplete && iterations < maxIterations) {
      iterations++;

      // Call Claude to route the task
      const routingResult = await this.routeTask(task, state);

      state.nextAgent = routingResult.nextAgent;
      state.taskInfo = routingResult.taskInfo;

      if (routingResult.nextAgent === "end") {
        state.workflowComplete = true;
        summary = routingResult.taskInfo.summary as string || "Workflow completed";
        break;
      }

      // Execute the routed agent
      if (routingResult.nextAgent === "coding") {
        // Note: Coding agent would be called here
        // For now, we just record the routing decision
        state.codingResult = {
          status: "routed",
          taskDescription: routingResult.taskInfo.task_description,
          helpfulnessLevel: routingResult.taskInfo.helpfulness_level,
        };
        logger.info("Supervisor routed to Coding Agent", {
          sessionId: this.sessionId,
          taskInfo: routingResult.taskInfo,
        });
      } else if (routingResult.nextAgent === "interview") {
        const result = await this.executeInterviewAgent(
          routingResult.taskInfo.event_type as InterviewEventType,
          routingResult.taskInfo.event_data as Record<string, unknown>
        );
        state.interviewResult = result;
      } else if (routingResult.nextAgent === "evaluation") {
        const result = await this.executeEvaluationAgent();
        state.evaluationResult = result;
      }

      // Check if we should continue
      if (
        state.evaluationResult ||
        (state.codingResult && state.interviewResult)
      ) {
        state.workflowComplete = true;
      }
    }

    logger.info("Supervisor Agent workflow complete", {
      sessionId: this.sessionId,
      iterations,
      hasEvaluation: !!state.evaluationResult,
    });

    return {
      codingResult: state.codingResult,
      interviewResult: state.interviewResult,
      evaluationResult: state.evaluationResult,
      summary,
    };
  }

  /**
   * Route task using Claude tool calls
   */
  private async routeTask(
    task: string,
    state: SupervisorState
  ): Promise<{ nextAgent: AgentType | null; taskInfo: Record<string, unknown> }> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: task,
      },
    ];

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: buildCachedSystemPrompt(SUPERVISOR_SYSTEM_PROMPT),
      tools: SUPERVISOR_TOOLS,
      messages,
    });

    // Log cache metrics
    const cacheMetrics = extractCacheMetrics(response);
    logCacheMetrics(cacheMetrics, 'SupervisorAgent');

    // Extract tool calls
    let nextAgent: AgentType | null = null;
    let taskInfo: Record<string, unknown> = {};

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const toolName = block.name;
        const input = block.input as Record<string, unknown>;

        if (toolName === "handoff_to_coding_agent") {
          nextAgent = "coding";
          taskInfo = {
            task_description: input.task_description || "",
            helpfulness_level:
              input.helpfulness_level || this.defaultHelpfulnessLevel,
            session_id: input.session_id || this.sessionId,
          };
        } else if (toolName === "handoff_to_interview_agent") {
          nextAgent = "interview";
          taskInfo = {
            event_type: input.event_type || "",
            event_data: input.event_data || {},
            session_id: input.session_id || this.sessionId,
          };
        } else if (toolName === "handoff_to_evaluation_agent") {
          nextAgent = "evaluation";
          taskInfo = {
            session_id: input.session_id || this.sessionId,
            candidate_id: input.candidate_id || this.candidateId,
          };
        } else if (toolName === "complete_workflow") {
          nextAgent = "end";
          taskInfo = { summary: input.summary || "" };
        }

        // Only process first tool call
        break;
      }
    }

    return { nextAgent, taskInfo };
  }

  /**
   * Execute Interview Agent
   */
  private async executeInterviewAgent(
    eventType: InterviewEventType,
    eventData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      const agent = getInterviewAgent(this.sessionId, this.candidateId);
      const result = await agent.processEvent(eventType, eventData);

      return {
        status: "event_recorded",
        eventType,
        irtTheta: result.metrics.irtTheta,
        recommendedDifficulty: result.metrics.recommendedNextDifficulty,
        strugglingIndicators: result.metrics.strugglingIndicators,
      };
    } catch (error) {
      logger.error("Interview Agent error in Supervisor", error as Error, {
        sessionId: this.sessionId,
      });
      return {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Execute Evaluation Agent
   */
  private async executeEvaluationAgent(): Promise<Record<string, unknown>> {
    try {
      const agent = createSessionEvaluationAgent({
        sessionId: this.sessionId,
        candidateId: this.candidateId,
      });

      // Use provided session data or empty defaults
      const sessionData: SessionData = this.sessionData || {
        sessionId: this.sessionId,
        candidateId: this.candidateId,
        codeSnapshots: [],
        testResults: [],
        claudeInteractions: [],
      };

      const result = await agent.evaluateSession(sessionData);

      return {
        status: "completed",
        overallScore: result.overallScore,
        overallConfidence: result.overallConfidence,
        dimensions: {
          codeQuality: result.codeQuality.score,
          problemSolving: result.problemSolving.score,
          aiCollaboration: result.aiCollaboration.score,
          communication: result.communication.score,
        },
        biasFlags: result.biasFlags,
      };
    } catch (error) {
      logger.error("Evaluation Agent error in Supervisor", error as Error, {
        sessionId: this.sessionId,
      });
      return {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Directly hand off to Interview Agent (bypass routing)
   */
  async recordInterviewEvent(
    eventType: InterviewEventType,
    eventData: Record<string, unknown>
  ): Promise<InterviewMetrics> {
    const agent = getInterviewAgent(this.sessionId, this.candidateId);
    const result = await agent.processEvent(eventType, eventData);
    return result.metrics;
  }

  /**
   * Directly hand off to Evaluation Agent (bypass routing)
   */
  async evaluateSession(
    sessionData: SessionData
  ): Promise<SessionEvaluationResult> {
    const agent = createSessionEvaluationAgent({
      sessionId: this.sessionId,
      candidateId: this.candidateId,
    });
    return agent.evaluateSession(sessionData);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Factory function to create a Supervisor Agent
 */
export function createSupervisorAgent(
  config: SupervisorConfig
): SupervisorAgent {
  return new SupervisorAgent(config);
}

/**
 * Clear the agent cache (useful for testing)
 */
export function clearSupervisorCache(): void {
  interviewAgentCache.clear();
}
