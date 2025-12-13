/**
 * Agent Router
 *
 * Routes requests to the appropriate agent backend based on experiment assignments.
 * Supports Claude Code SDK (TypeScript) and LangGraph (Python) backends.
 *
 * Now uses DB-based AgentAssignmentService for persistent, session-sticky assignments.
 */

import type { AgentBackend, AgentRequest, AgentResponse, ExperimentAssignment } from './types';
import { experimentService } from './experiment-service';
import { metricsCollector } from './metrics-collector';
import {
  agentAssignmentService,
  type AssignmentContext,
  type AgentBackendType,
} from './agent-assignment-service';

/**
 * Claude SDK Agent Interface (TypeScript)
 */
interface ClaudeSdkAgent {
  sendMessage(message: string): Promise<{
    text: string;
    toolsUsed: string[];
    filesModified: string[];
    metadata?: {
      model: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
      toolCallCount: number;
    };
  }>;
  loadConversationHistory(history: Array<{ role: string; content: string }>): void;
}

/**
 * LangGraph Agent Interface (Python via HTTP)
 */
interface LangGraphAgentConfig {
  baseUrl: string;
  apiKey?: string;
}

/**
 * Agent Router
 *
 * Routes requests to the appropriate backend based on experiment assignment.
 */
export class AgentRouter {
  private static instance: AgentRouter;
  private langGraphConfig: LangGraphAgentConfig;

  private constructor() {
    this.langGraphConfig = {
      baseUrl: process.env.LANGGRAPH_API_URL || 'http://localhost:2024',
      apiKey: process.env.LANGGRAPH_API_KEY,
    };
  }

  static getInstance(): AgentRouter {
    if (!AgentRouter.instance) {
      AgentRouter.instance = new AgentRouter();
    }
    return AgentRouter.instance;
  }

  /**
   * Route a request to the appropriate agent backend
   */
  async routeRequest(
    request: AgentRequest,
    experimentId?: string,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // Get experiment assignment if experiment is specified
    let assignment: ExperimentAssignment | null = null;
    let backend: AgentBackend = 'claude-sdk'; // Default

    if (experimentId) {
      assignment = await experimentService.getAssignment(
        experimentId,
        request.candidateId,
        request.sessionId,
      );

      if (assignment) {
        backend = assignment.backend;
      }
    }

    // Route to appropriate backend
    let response: AgentResponse;
    try {
      if (backend === 'langgraph') {
        response = await this.callLangGraphAgent(request);
      } else {
        response = await this.callClaudeSdkAgent(request);
      }

      // Record success metrics
      if (assignment) {
        await metricsCollector.recordMetric({
          experimentId: assignment.experimentId,
          variantId: assignment.variantId,
          metricName: 'response_latency_ms',
          value: response.latencyMs,
          timestamp: new Date(),
          metadata: {
            sessionId: request.sessionId,
            backend,
          },
        });

        await metricsCollector.recordMetric({
          experimentId: assignment.experimentId,
          variantId: assignment.variantId,
          metricName: 'request_success',
          value: 1,
          timestamp: new Date(),
        });

        if (response.tokenUsage) {
          await metricsCollector.recordMetric({
            experimentId: assignment.experimentId,
            variantId: assignment.variantId,
            metricName: 'tokens_used',
            value: response.tokenUsage.input + response.tokenUsage.output,
            timestamp: new Date(),
          });
        }
      }

      return response;
    } catch (error) {
      // Record error metrics
      if (assignment) {
        await metricsCollector.recordMetric({
          experimentId: assignment.experimentId,
          variantId: assignment.variantId,
          metricName: 'request_error',
          value: 1,
          timestamp: new Date(),
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            backend,
          },
        });
      }

      throw error;
    }
  }

  /**
   * Call Claude SDK agent (TypeScript implementation)
   */
  private async callClaudeSdkAgent(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Dynamic import to avoid circular dependencies
      const { createStreamingCodingAgent } = await import('../agents/coding-agent');

      const agent = await createStreamingCodingAgent({
        sessionId: request.sessionId,
        candidateId: request.candidateId,
        sessionRecordingId: request.sessionId, // Use sessionId as recording ID for routing
        helpfulnessLevel: (request.context?.helpfulnessLevel as any) || 'pair-programming',
        workspaceRoot: '/workspace', // Modal sandbox workspace root
        problemStatement: request.context?.problemStatement,
      });

      // Load conversation history if provided
      if (request.context?.conversationHistory) {
        agent.loadConversationHistory(
          request.context.conversationHistory.map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
        );
      }

      const result = await agent.sendMessage(request.message);

      return {
        text: result.text,
        toolsUsed: result.toolsUsed ?? [],
        filesModified: result.filesModified ?? [],
        backend: 'claude-sdk',
        latencyMs: Date.now() - startTime,
        tokenUsage: result.metadata?.usage
          ? {
              input: (result.metadata.usage as any).input_tokens,
              output: (result.metadata.usage as any).output_tokens,
            }
          : undefined,
        metadata: result.metadata,
      };
    } catch (error) {
      console.error('[AgentRouter] Claude SDK agent error:', error);
      throw error;
    }
  }

  /**
   * Call LangGraph agent (Python implementation via HTTP)
   */
  private async callLangGraphAgent(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.langGraphConfig.baseUrl}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.langGraphConfig.apiKey && {
            Authorization: `Bearer ${this.langGraphConfig.apiKey}`,
          }),
        },
        body: JSON.stringify({
          session_id: request.sessionId,
          candidate_id: request.candidateId,
          message: request.message,
          helpfulness_level: request.context?.helpfulnessLevel || 'pair-programming',
          problem_statement: request.context?.problemStatement,
          conversation_history: request.context?.conversationHistory,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LangGraph API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      return {
        text: result.text,
        toolsUsed: result.tools_used || [],
        filesModified: result.files_modified || [],
        backend: 'langgraph',
        latencyMs: Date.now() - startTime,
        tokenUsage: result.token_usage
          ? {
              input: result.token_usage.input,
              output: result.token_usage.output,
            }
          : undefined,
        metadata: result.metadata,
      };
    } catch (error) {
      console.error('[AgentRouter] LangGraph agent error:', error);
      throw error;
    }
  }

  /**
   * Get backend for a specific assignment (for testing/debugging)
   */
  async getBackendForUser(
    experimentId: string,
    userId: string,
    sessionId: string,
  ): Promise<AgentBackend | null> {
    const assignment = await experimentService.getAssignment(
      experimentId,
      userId,
      sessionId,
    );
    return assignment?.backend || null;
  }

  /**
   * Route request using DB-based assignment (recommended)
   *
   * Uses AgentAssignmentService for:
   * - Persistent DB storage
   * - Session-sticky assignments
   * - DB-configurable experiments
   * - Organization/assessment-level config
   */
  async routeRequestWithDbConfig(
    request: AgentRequest,
    context?: {
      organizationId?: string;
      assessmentId?: string;
      seniority?: string;
      role?: string;
      assessmentType?: string;
    },
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // Get assignment from DB-based service
    const assignmentContext: AssignmentContext = {
      sessionId: request.sessionId,
      candidateId: request.candidateId,
      organizationId: context?.organizationId,
      assessmentId: context?.assessmentId,
      seniority: context?.seniority,
      role: context?.role,
      assessmentType: context?.assessmentType,
    };

    const assignment = await agentAssignmentService.getBackendForSession(assignmentContext);
    const backend = assignment.backend;

    console.log(
      `[AgentRouter] Routing to ${backend} (source: ${assignment.source}${
        assignment.experimentId ? `, experiment: ${assignment.experimentId}` : ''
      })`,
    );

    // Route to appropriate backend
    let response: AgentResponse;
    try {
      if (backend === 'langgraph') {
        response = await this.callLangGraphAgent(request);
      } else {
        response = await this.callClaudeSdkAgent(request);
      }

      // Record metrics if from experiment
      if (assignment.experimentId) {
        await metricsCollector.recordMetric({
          experimentId: assignment.experimentId,
          variantId: assignment.variant || 'unknown',
          metricName: 'response_latency_ms',
          value: response.latencyMs,
          timestamp: new Date(),
          metadata: {
            sessionId: request.sessionId,
            backend,
            source: assignment.source,
          },
        });

        await metricsCollector.recordMetric({
          experimentId: assignment.experimentId,
          variantId: assignment.variant || 'unknown',
          metricName: 'request_success',
          value: 1,
          timestamp: new Date(),
        });
      }

      return response;
    } catch (error) {
      // Record error metrics if from experiment
      if (assignment.experimentId) {
        await metricsCollector.recordMetric({
          experimentId: assignment.experimentId,
          variantId: assignment.variant || 'unknown',
          metricName: 'request_error',
          value: 1,
          timestamp: new Date(),
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            backend,
          },
        });
      }

      throw error;
    }
  }

  /**
   * Get current assignment for a session (for UI display)
   */
  async getCurrentAssignment(
    sessionId: string,
    candidateId: string,
    context?: {
      organizationId?: string;
      assessmentId?: string;
    },
  ) {
    return agentAssignmentService.getBackendForSession({
      sessionId,
      candidateId,
      organizationId: context?.organizationId,
      assessmentId: context?.assessmentId,
    });
  }
}

// Export singleton instance
export const agentRouter = AgentRouter.getInstance();
