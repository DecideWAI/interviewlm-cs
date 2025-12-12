/**
 * LangGraph Client
 *
 * Client for interacting with LangGraph server using the official SDK.
 * Supports both LangGraph dev server and LangGraph Cloud.
 */

import { Client } from '@langchain/langgraph-sdk';
import type { HelpfulnessLevel } from '../types/agent';

// Configuration
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || 'http://localhost:2024';

// Initialize LangGraph client
const client = new Client({ apiUrl: LANGGRAPH_API_URL });

// =============================================================================
// Types
// =============================================================================

export interface CodingChatRequest {
  sessionId: string;
  candidateId: string;
  message: string;
  helpfulnessLevel?: HelpfulnessLevel;
  problemStatement?: string;
  techStack?: string[];
  codeContext?: {
    fileName?: string;
    content?: string;
    language?: string;
  };
}

export interface CodingChatResponse {
  text: string;
  toolsUsed: string[];
  filesModified: string[];
  metadata: Record<string, unknown>;
}

export interface InterviewEventData {
  sessionId: string;
  candidateId: string;
  eventType:
    | 'session-started'
    | 'ai-interaction'
    | 'code-changed'
    | 'test-run'
    | 'question-answered'
    | 'session-completed';
  eventData: Record<string, unknown>;
}

export interface InterviewMetrics {
  sessionId: string;
  irtTheta: number;
  currentDifficulty: number;
  recommendedNextDifficulty: number;
  aiDependencyScore: number;
  questionsAnswered: number;
  strugglingIndicators: string[];
}

export interface EvaluationRequest {
  sessionId: string;
  candidateId: string;
  codeSnapshots?: Array<{
    timestamp: string;
    files: Record<string, string>;
  }>;
  testResults?: Array<{
    timestamp: string;
    passed: number;
    failed: number;
    total: number;
  }>;
  claudeInteractions?: Array<{
    candidateMessage: string;
    timestamp: string;
  }>;
}

export interface EvaluationResult {
  sessionId: string;
  candidateId: string;
  overallScore: number;
  codeQuality: { score: number; confidence: number; evidence: unknown[] };
  problemSolving: { score: number; confidence: number; evidence: unknown[] };
  aiCollaboration: { score: number; confidence: number; evidence: unknown[] };
  communication: { score: number; confidence: number; evidence: unknown[] };
  confidence: number;
  biasFlags: string[];
}

export interface StreamingCallbacks {
  onText?: (delta: string) => void;
  onToolStart?: (toolName: string, input: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, output: unknown) => void;
  onComplete?: (response: CodingChatResponse) => void;
  onError?: (error: string) => void;
}

// =============================================================================
// Thread Management
// =============================================================================

/**
 * Get or create a thread for a session.
 * Uses deterministic thread ID format: {agentType}_{sessionId}
 * This ensures conversation history persists across requests.
 */
export async function getOrCreateThread(sessionId: string, agentType: string = 'coding_agent'): Promise<string> {
  // Use deterministic thread ID format for consistent history
  const threadId = `${agentType}_${sessionId}`;

  try {
    // Try to get existing thread
    const thread = await client.threads.get(threadId);
    if (thread) {
      return threadId;
    }
  } catch {
    // Thread doesn't exist, create it
  }

  try {
    // Create thread with specific ID and metadata
    await client.threads.create({
      threadId,
      metadata: { sessionId, agentType },
    });
    console.log(`[LangGraph] Created thread ${threadId}`);
    return threadId;
  } catch {
    // Thread may already exist (race condition) or creation failed
    // Either way, use the deterministic ID
    console.log(`[LangGraph] Using thread ${threadId}`);
    return threadId;
  }
}

// =============================================================================
// Coding Agent Client
// =============================================================================

/**
 * Send a message to the Coding Agent with streaming response.
 */
export async function streamCodingChat(
  request: CodingChatRequest,
  callbacks: StreamingCallbacks
): Promise<void> {
  const threadId = await getOrCreateThread(request.sessionId);

  let fullText = '';
  const toolsUsed: string[] = [];
  const filesModified: string[] = [];

  try {
    const stream = client.runs.stream(threadId, 'coding_agent', {
      input: {
        messages: [{ role: 'user', content: request.message }],
      },
      config: {
        configurable: {
          session_id: request.sessionId,
          candidate_id: request.candidateId,
          helpfulness_level: request.helpfulnessLevel || 'pair-programming',
          problem_statement: request.problemStatement,
          tech_stack: request.techStack,
        },
      },
      // Use multiple stream modes for comprehensive event coverage
      streamMode: ['messages', 'events'],
    });

    for await (const chunk of stream) {
      // Cast to any for flexible event handling - LangGraph SDK types are strict
      const event = chunk as any;

      // Handle events mode - this is the primary source for text and tool events
      if (event.event === 'events') {
        const eventData = event.data;

        if (eventData?.event === 'on_chat_model_stream') {
          // Text streaming: content is in event.data.data.chunk.content as an array
          // Format: [{"text":"Hello! ","type":"text","index":0}]
          const chunkContent = eventData.data?.chunk?.content;
          if (Array.isArray(chunkContent)) {
            for (const item of chunkContent) {
              if (item?.type === 'text' && item?.text) {
                fullText += item.text;
                callbacks.onText?.(item.text);
              }
            }
          } else if (typeof chunkContent === 'string' && chunkContent) {
            fullText += chunkContent;
            callbacks.onText?.(chunkContent);
          }
        } else if (eventData?.event === 'on_tool_start') {
          const toolName = eventData.name || 'unknown';
          toolsUsed.push(toolName);
          callbacks.onToolStart?.(toolName, eventData.data?.input || {});

          // Track file modifications
          if (toolName === 'write_file' || toolName === 'edit_file') {
            const filePath = eventData.data?.input?.file_path;
            if (filePath && !filesModified.includes(filePath)) {
              filesModified.push(filePath);
            }
          }
        } else if (eventData?.event === 'on_tool_end') {
          callbacks.onToolEnd?.(eventData.name || 'unknown', eventData.data?.output);
        }
      }
      // Handle error event
      else if (event.event === 'error') {
        throw new Error(event.data?.message || 'Stream error');
      }
      // Note: messages/partial events are skipped as we get text from events/on_chat_model_stream
    }

    callbacks.onComplete?.({
      text: fullText,
      toolsUsed,
      filesModified,
      metadata: { threadId },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    callbacks.onError?.(errorMessage);
    throw error;
  }
}

/**
 * Send a message to the Coding Agent (non-streaming).
 */
export async function sendCodingChat(
  request: CodingChatRequest
): Promise<CodingChatResponse> {
  const threadId = await getOrCreateThread(request.sessionId);

  const result = await client.runs.wait(threadId, 'coding_agent', {
    input: {
      messages: [{ role: 'user', content: request.message }],
    },
    config: {
      configurable: {
        session_id: request.sessionId,
        candidate_id: request.candidateId,
        helpfulness_level: request.helpfulnessLevel || 'pair-programming',
        problem_statement: request.problemStatement,
        tech_stack: request.techStack,
      },
    },
  });

  // Extract response from result (cast to any for flexible type handling)
  const resultData = result as any;
  const messages = resultData.messages || [];
  const lastMessage = messages[messages.length - 1];
  const text = typeof lastMessage?.content === 'string' ? lastMessage.content : '';

  return {
    text,
    toolsUsed: [],
    filesModified: [],
    metadata: { threadId },
  };
}

// =============================================================================
// Interview Agent Client
// =============================================================================

/**
 * Record an interview event and get updated metrics.
 */
export async function recordInterviewEvent(
  event: InterviewEventData
): Promise<InterviewMetrics> {
  const threadId = await getOrCreateThread(event.sessionId, 'interview_agent');

  const result = await client.runs.wait(threadId, 'interview_agent', {
    input: {
      messages: [],
      session_id: event.sessionId,
      candidate_id: event.candidateId,
      current_event_type: event.eventType,
      current_event_data: event.eventData,
    },
  });

  // Cast to any for flexible type handling
  const resultData = result as any;
  const metrics = resultData.metrics || {};

  return {
    sessionId: event.sessionId,
    irtTheta: metrics.irt_theta || 0,
    currentDifficulty: metrics.current_difficulty || 5,
    recommendedNextDifficulty: metrics.recommended_next_difficulty || 5,
    aiDependencyScore: metrics.ai_dependency_score || 0,
    questionsAnswered: metrics.questions_answered || 0,
    strugglingIndicators: metrics.struggling_indicators || [],
  };
}

/**
 * Get current interview metrics for a session.
 */
export async function getInterviewMetrics(
  sessionId: string
): Promise<InterviewMetrics> {
  const threadId = await getOrCreateThread(sessionId, 'interview_agent');

  try {
    const state = await client.threads.getState(threadId);
    // Cast to any for flexible type handling
    const stateData = state as any;
    const metrics = stateData.values?.metrics || {};

    return {
      sessionId,
      irtTheta: metrics.irt_theta || 0,
      currentDifficulty: metrics.current_difficulty || 5,
      recommendedNextDifficulty: metrics.recommended_next_difficulty || 5,
      aiDependencyScore: metrics.ai_dependency_score || 0,
      questionsAnswered: metrics.questions_answered || 0,
      strugglingIndicators: metrics.struggling_indicators || [],
    };
  } catch {
    // Return default metrics if thread not found
    return {
      sessionId,
      irtTheta: 0,
      currentDifficulty: 5,
      recommendedNextDifficulty: 5,
      aiDependencyScore: 0,
      questionsAnswered: 0,
      strugglingIndicators: [],
    };
  }
}

// =============================================================================
// Evaluation Agent Client
// =============================================================================

/**
 * Evaluate a completed interview session.
 */
export async function evaluateSession(
  request: EvaluationRequest
): Promise<EvaluationResult> {
  const threadId = await getOrCreateThread(request.sessionId, 'evaluation_agent');

  const evaluationPrompt = `Evaluate interview session ${request.sessionId}.
Start by using get_session_metadata to understand the context, then explore the workspace
and gather all relevant data before scoring.

Session ID: ${request.sessionId}
Candidate ID: ${request.candidateId}`;

  const result = await client.runs.wait(threadId, 'evaluation_agent', {
    input: {
      messages: [{ role: 'user', content: evaluationPrompt }],
    },
    config: {
      configurable: {
        session_id: request.sessionId,
        candidate_id: request.candidateId,
      },
    },
  });

  // Parse evaluation result from response (cast to any for flexible type handling)
  const resultData = result as any;
  const defaultScore = { score: 50, confidence: 0.5, evidence: [] };

  return {
    sessionId: request.sessionId,
    candidateId: request.candidateId,
    overallScore: resultData.overall_score || 50,
    codeQuality: resultData.code_quality || defaultScore,
    problemSolving: resultData.problem_solving || defaultScore,
    aiCollaboration: resultData.ai_collaboration || defaultScore,
    communication: resultData.communication || defaultScore,
    confidence: resultData.overall_confidence || 0.5,
    biasFlags: resultData.bias_flags || [],
  };
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Clear/delete all agent threads for a session.
 */
export async function clearSession(sessionId: string): Promise<void> {
  const agentTypes = ['coding_agent', 'interview_agent', 'evaluation_agent'];

  for (const agentType of agentTypes) {
    try {
      const threadId = `${agentType}_${sessionId}`;
      await client.threads.delete(threadId);
      console.log(`[LangGraph] Deleted thread ${threadId}`);
    } catch {
      // Ignore errors if thread doesn't exist
    }
  }
}

/**
 * Check if the LangGraph API server is healthy.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    // Try to list assistants - this will fail if server is down
    await client.assistants.search({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the LangGraph client instance for advanced usage.
 */
export function getLangGraphClient(): Client {
  return client;
}
