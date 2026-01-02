/**
 * LangGraph Client
 *
 * Client for interacting with LangGraph server using the official SDK.
 * Supports both LangGraph dev server and production deployment on Cloud Run.
 *
 * Authentication:
 * - Production: Uses Google Cloud Run IAM (ID tokens) + internal API key
 * - Development: Uses internal API key only
 *
 * User context is passed via custom headers for audit trails:
 * - X-User-Id: The user making the request
 * - X-Session-Id: The interview session ID
 * - X-Request-Id: Correlation ID for distributed tracing
 */

import { Client } from '@langchain/langgraph-sdk';
import type { HelpfulnessLevel } from '../types/agent';
import type { FastEvaluationResult, FastEvaluationInput } from '../types/fast-evaluation';
import type { ComprehensiveEvaluationResult, ComprehensiveEvaluationInput } from '../types/comprehensive-evaluation';
import type { AssessmentType } from '@/types/seed';
import { randomUUID } from 'crypto';

// Configuration
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || 'http://localhost:2024';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Cache for ID token (Cloud Run tokens are valid for ~1 hour)
let cachedIdToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Google ID token from Cloud Run metadata server.
 * Only used in production (Cloud Run environment).
 */
async function getGoogleIdToken(): Promise<string | null> {
  if (!IS_PRODUCTION) {
    return null;
  }

  // Return cached token if still valid (with 5 minute buffer)
  if (cachedIdToken && cachedIdToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedIdToken.token;
  }

  try {
    const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
    const response = await fetch(`${metadataUrl}?audience=${LANGGRAPH_API_URL}`, {
      headers: { 'Metadata-Flavor': 'Google' },
    });

    if (!response.ok) {
      console.error('[LangGraph] Failed to fetch ID token:', response.status);
      return null;
    }

    const token = await response.text();

    // Cache the token (Cloud Run tokens are valid for ~1 hour)
    cachedIdToken = {
      token,
      expiresAt: Date.now() + 55 * 60 * 1000, // 55 minutes
    };

    return token;
  } catch (error) {
    console.error('[LangGraph] Error fetching ID token:', error);
    return null;
  }
}

/**
 * Get authentication headers for LangGraph requests.
 * Includes authorization and user context headers.
 */
async function getAuthHeaders(
  userId?: string,
  sessionId?: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'X-Request-Id': randomUUID(),
  };

  if (userId) headers['X-User-Id'] = userId;
  if (sessionId) headers['X-Session-Id'] = sessionId;

  if (IS_PRODUCTION) {
    // Production: Use Google ID token for Cloud Run IAM authentication
    const idToken = await getGoogleIdToken();
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    } else if (INTERNAL_API_KEY) {
      // Fallback to API key if ID token fetch fails
      headers['Authorization'] = `ApiKey ${INTERNAL_API_KEY}`;
    }
  } else {
    // Development: Use internal API key
    if (INTERNAL_API_KEY) {
      headers['Authorization'] = `ApiKey ${INTERNAL_API_KEY}`;
    }
  }

  return headers;
}

/**
 * Create a LangGraph client with authentication headers.
 * Creates a new client per request to include proper auth context.
 */
async function createAuthenticatedClient(
  userId?: string,
  sessionId?: string
): Promise<Client> {
  const headers = await getAuthHeaders(userId, sessionId);
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    defaultHeaders: headers,
  });
}

// Default client for operations that don't need user context
const defaultClient = new Client({ apiUrl: LANGGRAPH_API_URL });

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

import { v5 as uuidv5 } from 'uuid';

// Namespace UUID for generating deterministic thread IDs
const LANGGRAPH_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace

/**
 * Generate a deterministic UUID from session ID and agent type
 * This ensures the same session always gets the same thread UUID
 */
function generateThreadUUID(sessionId: string, agentType: string): string {
  const input = `${agentType}:${sessionId}`;
  return uuidv5(input, LANGGRAPH_NAMESPACE);
}

/**
 * Get or create a thread for a session.
 * Uses deterministic UUID v5 generated from agentType and sessionId
 * This ensures conversation history persists across requests.
 */
export async function getOrCreateThread(
  sessionId: string,
  agentType: string = 'coding_agent',
  userId?: string
): Promise<string> {
  // Generate deterministic UUID for consistent history
  const threadId = generateThreadUUID(sessionId, agentType);

  // Use authenticated client with user context
  const client = await createAuthenticatedClient(userId, sessionId);

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
    console.log(`[LangGraph] Created thread ${threadId} for session ${sessionId}`);
    return threadId;
  } catch {
    // Thread may already exist (race condition) or creation failed
    // Either way, use the deterministic UUID
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
  const threadId = await getOrCreateThread(request.sessionId, 'coding_agent', request.candidateId);

  // Create authenticated client with user context
  const client = await createAuthenticatedClient(request.candidateId, request.sessionId);

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
  const threadId = await getOrCreateThread(request.sessionId, 'coding_agent', request.candidateId);

  // Create authenticated client with user context
  const client = await createAuthenticatedClient(request.candidateId, request.sessionId);

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
  const threadId = await getOrCreateThread(event.sessionId, 'interview_agent', event.candidateId);

  // Create authenticated client with user context
  const client = await createAuthenticatedClient(event.candidateId, event.sessionId);

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
  sessionId: string,
  candidateId?: string
): Promise<InterviewMetrics> {
  const threadId = await getOrCreateThread(sessionId, 'interview_agent', candidateId);

  // Create authenticated client with user context
  const client = await createAuthenticatedClient(candidateId, sessionId);

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
  const threadId = await getOrCreateThread(request.sessionId, 'evaluation_agent', request.candidateId);

  // Create authenticated client with user context
  const client = await createAuthenticatedClient(request.candidateId, request.sessionId);

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
// Fast Progression Agent Client (LangGraph)
// =============================================================================

/**
 * Evaluate a question with the Fast Progression Agent (LangGraph).
 * Speed-optimized for live question progression (~20-40s).
 * Uses Haiku model and limited tools.
 */
export async function evaluateFastProgression(
  input: FastEvaluationInput
): Promise<FastEvaluationResult> {
  // Use per-question thread ID to avoid message accumulation across questions
  // Each question evaluation is independent and shouldn't see history from other questions
  const threadId = await getOrCreateThread(
    `${input.sessionId}:question:${input.questionId}`,
    'fast_progression_agent',
    input.candidateId
  );

  // Create authenticated client with user context
  const client = await createAuthenticatedClient(input.candidateId, input.sessionId);

  // Build evaluation prompt
  const evaluationPrompt = `Evaluate the candidate's solution for question "${input.questionTitle}".

**Session Details:**
- Session ID: ${input.sessionId}
- Candidate ID: ${input.candidateId}
- Question ID: ${input.questionId}
- Assessment Type: ${input.assessmentType}
- Language: ${input.language}
${input.fileName ? `- Solution File: ${input.fileName}` : ''}

**Test Results (TRUSTED - DO NOT RE-RUN):**
- Passed: ${input.testResults.passed}/${input.testResults.total}
- Failed: ${input.testResults.failed}
${input.testResults.output ? `- Output: ${input.testResults.output.slice(0, 500)}` : ''}

**Question:**
${input.questionDescription}

**Requirements:**
${input.questionRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

**Difficulty:** ${input.questionDifficulty}
**Passing Threshold:** ${input.passingThreshold || 70}

**Instructions:**
1. Use list_files to find the solution file (likely ${input.fileName || 'solution.*'})
2. Use read_file to read the code
3. Call ${input.assessmentType === 'SYSTEM_DESIGN' ? 'submit_system_design_evaluation' : 'submit_fast_evaluation'} with your scores

Be decisive. This is a gate check, not comprehensive review.`;

  const result = await client.runs.wait(threadId, 'fast_progression_agent', {
    input: {
      messages: [{ role: 'user', content: evaluationPrompt }],
      session_id: input.sessionId,
      candidate_id: input.candidateId,
      question_id: input.questionId,
      question_title: input.questionTitle,
      question_description: input.questionDescription,
      question_requirements: input.questionRequirements,
      question_difficulty: input.questionDifficulty,
      assessment_type: input.assessmentType,
      language: input.language,
      file_name: input.fileName,
      tests_passed: input.testResults.passed,
      tests_failed: input.testResults.failed,
      tests_total: input.testResults.total,
      test_output: input.testResults.output,
      passing_threshold: input.passingThreshold || 70,
    },
    config: {
      configurable: {
        session_id: input.sessionId,
        candidate_id: input.candidateId,
      },
    },
  });

  // Extract evaluation result from state
  const resultData = result as Record<string, unknown>;
  const evaluationResult = resultData.evaluation_result as Record<string, unknown> | undefined;

  if (evaluationResult) {
    // Map Python snake_case to TypeScript camelCase
    return {
      passed: evaluationResult.passed as boolean,
      overallScore: evaluationResult.overallScore as number,
      assessmentType: evaluationResult.assessmentType as AssessmentType,
      criteria: evaluationResult.criteria as FastEvaluationResult['criteria'],
      feedback: evaluationResult.feedback as string,
      blockingReason: evaluationResult.blockingReason as string | undefined,
      strengths: evaluationResult.strengths as string[],
      improvements: evaluationResult.improvements as string[],
      metadata: {
        model: (evaluationResult.metadata as Record<string, unknown>)?.model as string || 'claude-haiku-4-5-20251001',
        evaluationTimeMs: (evaluationResult.metadata as Record<string, unknown>)?.evaluationTimeMs as number || 0,
        toolCallCount: (evaluationResult.metadata as Record<string, unknown>)?.toolCallCount as number || 0,
        inputTokens: (evaluationResult.metadata as Record<string, unknown>)?.inputTokens as number || 0,
        outputTokens: (evaluationResult.metadata as Record<string, unknown>)?.outputTokens as number || 0,
      },
    };
  }

  // Fallback if agent didn't call submission tool
  throw new Error('Fast progression agent did not return evaluation result');
}

// =============================================================================
// Comprehensive Evaluation Agent Client (LangGraph)
// =============================================================================

/**
 * Evaluate a completed interview session comprehensively (LangGraph).
 * Quality-optimized for hiring managers (~3-5 minutes).
 * Uses Sonnet model with full tool access.
 */
export async function evaluateComprehensive(
  input: ComprehensiveEvaluationInput
): Promise<ComprehensiveEvaluationResult> {
  const threadId = await getOrCreateThread(input.sessionId, 'comprehensive_agent', input.candidateId);

  // Create authenticated client with user context
  const client = await createAuthenticatedClient(input.candidateId, input.sessionId);

  // Build evaluation prompt
  const evaluationPrompt = `Conduct a COMPREHENSIVE evaluation of this interview session.

**Session Details:**
- Session ID: ${input.sessionId}
- Candidate ID: ${input.candidateId}
- Role: ${input.role}
- Seniority Level: ${input.seniority}

**Questions in this Session:**
${input.questions.map((q, i) => `${i + 1}. ${q.title} (${q.difficulty}, ${q.assessmentType})`).join('\n')}

**Your Task:**
1. Use send_evaluation_progress to notify frontend (10%)
2. Use get_session_metadata to get session context (20%)
3. Use get_code_snapshots to retrieve the code (40%)
4. Use get_claude_interactions and get_test_results for history (60%)
5. Analyze all 4 dimensions with evidence (80%)
6. Use detect_evaluation_bias for fairness check
7. Use generate_actionable_report for Skills Gap Matrix
8. Use generate_hiring_recommendation for hiring decision
9. Use submit_comprehensive_evaluation to save results (100%)

**Role Context for ${input.role} at ${input.seniority} Level:**
Evaluate whether the candidate's skills match expectations for a ${input.seniority} ${input.role}.

**IMPORTANT:**
- Be thorough but fair
- Cite specific evidence from the session
- Check for bias before finalizing
- MUST call submit_comprehensive_evaluation at the end

Begin your evaluation now.`;

  const result = await client.runs.wait(threadId, 'comprehensive_agent', {
    input: {
      messages: [{ role: 'user', content: evaluationPrompt }],
      session_id: input.sessionId,
      candidate_id: input.candidateId,
      role: input.role,
      seniority: input.seniority,
    },
    config: {
      configurable: {
        session_id: input.sessionId,
        candidate_id: input.candidateId,
      },
    },
  });

  // Extract evaluation result from state
  const resultData = result as Record<string, unknown>;
  const evaluationResult = resultData.evaluation_result as Record<string, unknown> | undefined;

  if (evaluationResult) {
    // Map Python keys to TypeScript types
    const mapDimensionScore = (score: Record<string, unknown> | undefined) => ({
      score: (score?.score as number) || 0,
      confidence: (score?.confidence as number) || 0,
      evidence: (score?.evidence as ComprehensiveEvaluationResult['codeQuality']['evidence']) || [],
      breakdown: (score?.breakdown as Record<string, number>) || null,
    });

    return {
      sessionId: evaluationResult.session_id as string || input.sessionId,
      candidateId: evaluationResult.candidate_id as string || input.candidateId,
      codeQuality: mapDimensionScore(evaluationResult.code_quality as Record<string, unknown>),
      problemSolving: mapDimensionScore(evaluationResult.problem_solving as Record<string, unknown>),
      aiCollaboration: mapDimensionScore(evaluationResult.ai_collaboration as Record<string, unknown>),
      communication: mapDimensionScore(evaluationResult.communication as Record<string, unknown>),
      overallScore: (evaluationResult.overall_score as number) || 0,
      overallConfidence: (evaluationResult.overall_confidence as number) || 0,
      expertiseLevel: evaluationResult.expertise_level as ComprehensiveEvaluationResult['expertiseLevel'],
      expertiseGrowthTrend: evaluationResult.expertise_growth_trend as ComprehensiveEvaluationResult['expertiseGrowthTrend'],
      actionableReport: evaluationResult.actionable_report as ComprehensiveEvaluationResult['actionableReport'],
      hiringRecommendation: {
        decision: (evaluationResult.hiring_recommendation as Record<string, unknown>)?.decision as ComprehensiveEvaluationResult['hiringRecommendation']['decision'],
        confidence: (evaluationResult.hiring_recommendation as Record<string, unknown>)?.confidence as number || 0,
        reasoning: (evaluationResult.hiring_recommendation as Record<string, unknown>)?.reasoning as string[] || [],
        aiFactorInfluence: 'neutral',
      },
      confidenceMetrics: {
        overall: (evaluationResult.overall_confidence as number) || 0,
        dataQuality: 0.8,
        sampleSize: 1,
        consistency: 0.8,
        explanation: '',
        warnings: [],
      },
      biasDetection: evaluationResult.bias_detection as ComprehensiveEvaluationResult['biasDetection'],
      biasFlags: (evaluationResult.bias_flags as string[]) || [],
      fairnessReport: evaluationResult.fairness_report as string,
      evaluatedAt: new Date(),
      model: (evaluationResult.model as string) || 'claude-sonnet-4-5-20250929',
      evaluationTimeMs: (evaluationResult.evaluationTimeMs as number) || 0,
      toolCallCount: 0,
    };
  }

  // Fallback if agent didn't call submission tool
  throw new Error('Comprehensive evaluation agent did not return evaluation result');
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Clear/delete all agent threads for a session.
 */
export async function clearSession(sessionId: string, userId?: string): Promise<void> {
  const agentTypes = [
    'coding_agent',
    'interview_agent',
    'evaluation_agent',
    'fast_progression_agent',
    'comprehensive_agent',
  ];

  // Use authenticated client for deletion
  const client = await createAuthenticatedClient(userId, sessionId);

  for (const agentType of agentTypes) {
    try {
      const threadId = generateThreadUUID(sessionId, agentType);
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
    await defaultClient.assistants.search({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default LangGraph client instance for advanced usage.
 * Note: For authenticated requests with user context, use createAuthenticatedClient() instead.
 */
export function getLangGraphClient(): Client {
  return defaultClient;
}

/**
 * Get an authenticated LangGraph client with user context.
 * Use this for requests that need to be associated with a specific user/session.
 */
export async function getAuthenticatedLangGraphClient(
  userId?: string,
  sessionId?: string
): Promise<Client> {
  return createAuthenticatedClient(userId, sessionId);
}
