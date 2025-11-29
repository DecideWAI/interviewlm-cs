/**
 * LangGraph Client
 *
 * Client for interacting with the LangGraph HTTP API server.
 * Provides streaming and non-streaming interfaces for the multi-agent system.
 */

import type {
  AgentTool,
  HelpfulnessLevel,
} from '../types/agent';

// Configuration
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || 'http://localhost:8080';

// =============================================================================
// Types
// =============================================================================

export interface CodingChatRequest {
  sessionId: string;
  candidateId: string;
  message: string;
  helpfulnessLevel?: HelpfulnessLevel;
  problemStatement?: string;
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
  onToolUsed?: (tool: string) => void;
  onFileModified?: (path: string) => void;
  onComplete?: (response: CodingChatResponse) => void;
  onError?: (error: string) => void;
}

// =============================================================================
// Coding Agent Client
// =============================================================================

/**
 * Send a message to the Coding Agent with streaming response.
 * Uses Server-Sent Events for real-time updates.
 */
export async function streamCodingChat(
  request: CodingChatRequest,
  callbacks: StreamingCallbacks
): Promise<void> {
  const url = `${LANGGRAPH_API_URL}/api/coding/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      session_id: request.sessionId,
      candidate_id: request.candidateId,
      message: request.message,
      helpfulness_level: request.helpfulnessLevel || 'pair-programming',
      problem_statement: request.problemStatement,
      code_context: request.codeContext,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete events in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7);
        } else if (line.startsWith('data: ') && eventType) {
          const data = JSON.parse(line.slice(6));

          switch (eventType) {
            case 'thinking':
              callbacks.onText?.(data.delta);
              break;
            case 'tool_used':
              callbacks.onToolUsed?.(data.tool);
              break;
            case 'file_modified':
              callbacks.onFileModified?.(data.path);
              break;
            case 'done':
              callbacks.onComplete?.({
                text: data.response,
                toolsUsed: data.tools_used || [],
                filesModified: data.files_modified || [],
                metadata: data.metadata || {},
              });
              break;
            case 'error':
              callbacks.onError?.(data.error);
              break;
          }

          eventType = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Send a message to the Coding Agent (non-streaming).
 */
export async function sendCodingChat(
  request: CodingChatRequest
): Promise<CodingChatResponse> {
  const url = `${LANGGRAPH_API_URL}/api/coding/chat/sync`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: request.sessionId,
      candidate_id: request.candidateId,
      message: request.message,
      helpfulness_level: request.helpfulnessLevel || 'pair-programming',
      problem_statement: request.problemStatement,
      code_context: request.codeContext,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    text: data.text,
    toolsUsed: data.tools_used,
    filesModified: data.files_modified,
    metadata: data.metadata,
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
  const url = `${LANGGRAPH_API_URL}/api/interview/event`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: event.sessionId,
      candidate_id: event.candidateId,
      event_type: event.eventType,
      event_data: event.eventData,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    sessionId: data.session_id,
    irtTheta: data.irt_theta,
    currentDifficulty: data.current_difficulty,
    recommendedNextDifficulty: data.recommended_next_difficulty,
    aiDependencyScore: data.ai_dependency_score,
    questionsAnswered: data.questions_answered,
    strugglingIndicators: data.struggling_indicators,
  };
}

/**
 * Get current interview metrics for a session.
 */
export async function getInterviewMetrics(
  sessionId: string
): Promise<InterviewMetrics> {
  const url = `${LANGGRAPH_API_URL}/api/interview/${sessionId}/metrics`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Session metrics not found');
    }
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    sessionId: data.session_id,
    irtTheta: data.irt_theta,
    currentDifficulty: data.current_difficulty,
    recommendedNextDifficulty: data.recommended_next_difficulty,
    aiDependencyScore: data.ai_dependency_score,
    questionsAnswered: data.questions_answered,
    strugglingIndicators: data.struggling_indicators,
  };
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
  const url = `${LANGGRAPH_API_URL}/api/evaluation/evaluate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: request.sessionId,
      candidate_id: request.candidateId,
      code_snapshots: request.codeSnapshots,
      test_results: request.testResults,
      claude_interactions: request.claudeInteractions,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    sessionId: data.session_id,
    candidateId: data.candidate_id,
    overallScore: data.overall_score,
    codeQuality: data.code_quality,
    problemSolving: data.problem_solving,
    aiCollaboration: data.ai_collaboration,
    communication: data.communication,
    confidence: data.confidence,
    biasFlags: data.bias_flags,
  };
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Clear cached session data from the LangGraph server.
 */
export async function clearSession(sessionId: string): Promise<void> {
  const url = `${LANGGRAPH_API_URL}/api/sessions/${sessionId}`;

  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LangGraph API error: ${response.status} - ${errorText}`);
  }
}

/**
 * Check if the LangGraph API server is healthy.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const url = `${LANGGRAPH_API_URL}/health`;
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}
