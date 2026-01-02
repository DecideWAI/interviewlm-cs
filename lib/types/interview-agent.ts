/**
 * Interview Agent Types
 *
 * Types for the Interview Agent that tracks candidate progress in real-time
 * using IRT (Item Response Theory) for adaptive difficulty.
 *
 * This agent is HIDDEN from candidates - it only observes and updates metrics.
 */

/**
 * Interview metrics tracked for each session (hidden from candidates)
 */
export interface InterviewMetrics {
  sessionId: string;

  // IRT (Item Response Theory) parameters
  irtTheta: number; // Ability estimate (-3 to +3, 0 = average)
  irtStandardError: number; // Confidence in theta estimate

  // Progress tracking
  questionsAnswered: number;
  questionsCorrect: number;
  questionsIncorrect: number;

  // AI usage metrics
  aiInteractionsCount: number;
  averagePromptQuality: number;
  aiDependencyScore: number; // 0-100, higher = more dependent

  // Struggle indicators
  strugglingIndicators: StrugglingIndicator[];
  averageResponseTime: number; // seconds
  testFailureRate: number; // 0-1

  // Adaptive difficulty
  currentDifficulty: number; // 1-10
  recommendedNextDifficulty: number;

  // Timestamps
  lastUpdated: string;
}

/**
 * Types of struggling indicators detected by the Interview Agent
 */
export type StrugglingIndicator =
  | "asking_for_help"
  | "short_prompts"
  | "high_test_failure_rate"
  | "slow_response_time";

/**
 * Event types that the Interview Agent can process
 */
export type InterviewEventType =
  | "session-started"
  | "ai-interaction"
  | "code-changed"
  | "test-run"
  | "question-answered"
  | "session-complete";

/**
 * Base interface for interview events
 */
export interface InterviewEvent {
  type: InterviewEventType;
  data: InterviewEventData;
}

/**
 * Union type for all event data types
 */
export type InterviewEventData =
  | SessionStartedEventData
  | AIInteractionEventData
  | CodeChangedEventData
  | TestRunEventData
  | QuestionAnsweredEventData
  | SessionCompleteEventData;

/**
 * Data for session-started event
 */
export interface SessionStartedEventData {
  difficulty?: number; // Initial difficulty (1-10), defaults to 5
}

/**
 * Data for ai-interaction event
 */
export interface AIInteractionEventData {
  candidateMessage: string;
  toolsUsed?: string[];
}

/**
 * Data for code-changed event
 */
export interface CodeChangedEventData {
  filePath?: string;
  changeType?: "create" | "edit" | "delete";
}

/**
 * Data for test-run event
 */
export interface TestRunEventData {
  passed: number;
  failed: number;
  total?: number;
}

/**
 * Data for question-answered event
 */
export interface QuestionAnsweredEventData {
  isCorrect: boolean;
  timeSpent: number; // seconds
  difficulty?: number; // Question difficulty (1-10)
}

/**
 * Data for session-complete event
 */
export interface SessionCompleteEventData {
  finalScore?: number;
}

/**
 * Configuration for the Interview Agent
 */
export interface InterviewAgentConfig {
  sessionId: string;
  candidateId: string;
  initialDifficulty?: number; // 1-10, defaults to 5
}

/**
 * Response from the Interview Agent after processing an event
 */
export interface InterviewAgentResponse {
  metrics: InterviewMetrics;
  processed: boolean;
  eventType: InterviewEventType;
}

/**
 * API request for recording an interview event
 */
export interface InterviewEventRequest {
  eventType: InterviewEventType;
  eventData: Record<string, unknown>;
}

/**
 * API response with current metrics
 */
export interface InterviewMetricsResponse {
  sessionId: string;
  irtTheta: number;
  currentDifficulty: number;
  recommendedNextDifficulty: number;
  aiDependencyScore: number;
  questionsAnswered: number;
  strugglingIndicators: string[];
}

/**
 * Creates default metrics for a new session
 */
export function createDefaultMetrics(
  sessionId: string,
  difficulty: number = 5
): InterviewMetrics {
  return {
    sessionId,
    irtTheta: 0.0, // Start at average ability
    irtStandardError: 1.5,
    questionsAnswered: 0,
    questionsCorrect: 0,
    questionsIncorrect: 0,
    aiInteractionsCount: 0,
    averagePromptQuality: 3.0,
    aiDependencyScore: 0.0,
    strugglingIndicators: [],
    averageResponseTime: 0.0,
    testFailureRate: 0.0,
    currentDifficulty: difficulty,
    recommendedNextDifficulty: difficulty,
    lastUpdated: new Date().toISOString(),
  };
}
