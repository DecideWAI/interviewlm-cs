/**
 * Interview Agent - TypeScript Implementation
 *
 * Observes candidate progress and adapts interview difficulty using IRT algorithms.
 * This agent is HIDDEN from candidates - it only observes and updates metrics.
 *
 * Ported from the Python LangGraph implementation.
 */

import { logger } from "@/lib/utils/logger";
import {
  InterviewMetrics,
  InterviewEventType,
  AIInteractionEventData,
  TestRunEventData,
  QuestionAnsweredEventData,
  SessionStartedEventData,
  StrugglingIndicator,
  InterviewAgentConfig,
  InterviewAgentResponse,
  createDefaultMetrics,
} from "@/lib/types/interview-agent";

// =============================================================================
// In-memory cache for metrics (per session)
// =============================================================================

const metricsCache = new Map<string, InterviewMetrics>();

// =============================================================================
// IRT (Item Response Theory) Functions
// =============================================================================

/**
 * Update IRT theta estimate based on question result.
 *
 * Uses simplified IRT formula:
 * - If correct and difficulty > theta: increase theta
 * - If incorrect and difficulty < theta: decrease theta
 *
 * @param currentTheta - Current ability estimate
 * @param questionDifficulty - Question difficulty (1-10)
 * @param isCorrect - Whether the answer was correct
 * @param questionsAnswered - Total questions answered
 * @returns Tuple of [newTheta, newStandardError]
 */
function updateIrtTheta(
  currentTheta: number,
  questionDifficulty: number,
  isCorrect: boolean,
  questionsAnswered: number
): [number, number] {
  // Normalize difficulty to IRT scale (-3 to +3)
  const difficultyNormalized = (questionDifficulty - 5.5) / 1.5;

  // Calculate theta delta
  let thetaDelta: number;
  if (isCorrect) {
    thetaDelta = Math.max(0, (difficultyNormalized - currentTheta) * 0.3);
  } else {
    thetaDelta = Math.min(0, (difficultyNormalized - currentTheta) * 0.3);
  }

  // Clamp theta to valid range (-3 to +3)
  const newTheta = Math.max(-3, Math.min(3, currentTheta + thetaDelta));

  // Update standard error (decreases with more questions)
  const newStandardError = 1.5 / Math.sqrt(Math.max(questionsAnswered, 1));

  return [newTheta, newStandardError];
}

/**
 * Calculate recommended next difficulty based on theta.
 * Target: slightly above current ability
 *
 * @param theta - Current ability estimate
 * @returns Recommended difficulty (1-10)
 */
function calculateRecommendedDifficulty(theta: number): number {
  const difficulty = Math.round(5.5 + (theta + 0.5) * 1.5);
  return Math.max(1, Math.min(10, difficulty));
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle session-started event - initialize metrics
 */
function handleSessionStarted(
  metrics: InterviewMetrics,
  data: SessionStartedEventData
): InterviewMetrics {
  const difficulty = data.difficulty ?? 5;
  return createDefaultMetrics(metrics.sessionId, difficulty);
}

/**
 * Handle AI interaction event - updates AI usage metrics
 */
function handleAIInteraction(
  metrics: InterviewMetrics,
  data: AIInteractionEventData
): InterviewMetrics {
  const candidateMessage = data.candidateMessage ?? "";
  const toolsUsed = data.toolsUsed ?? [];

  // Update AI interaction count
  metrics.aiInteractionsCount += 1;

  // Calculate AI dependency score
  const toolUsageScore = toolsUsed.length * 5;
  const questionsAnswered = Math.max(metrics.questionsAnswered, 1);
  const interactionFrequency = metrics.aiInteractionsCount / questionsAnswered;
  metrics.aiDependencyScore = Math.min(
    100,
    interactionFrequency * 20 + toolUsageScore
  );

  // Detect struggling indicators
  const messageLower = candidateMessage.toLowerCase();
  const helpKeywords = ["stuck", "don't understand", "help", "confused", "not sure"];

  if (helpKeywords.some((word) => messageLower.includes(word))) {
    if (!metrics.strugglingIndicators.includes("asking_for_help")) {
      metrics.strugglingIndicators.push("asking_for_help");
    }
  }

  // Very short messages might indicate frustration
  const wordCount = candidateMessage.split(/\s+/).filter(Boolean).length;
  if (wordCount < 5 && wordCount > 0) {
    if (!metrics.strugglingIndicators.includes("short_prompts")) {
      metrics.strugglingIndicators.push("short_prompts");
    }
  }

  metrics.lastUpdated = new Date().toISOString();
  return metrics;
}

/**
 * Handle code-changed event
 * Primarily for session recording, metrics don't change much here
 */
function handleCodeChanged(metrics: InterviewMetrics): InterviewMetrics {
  metrics.lastUpdated = new Date().toISOString();
  return metrics;
}

/**
 * Handle test run event - updates test failure rate
 */
function handleTestRun(
  metrics: InterviewMetrics,
  data: TestRunEventData
): InterviewMetrics {
  const passed = data.passed ?? 0;
  const failed = data.failed ?? 0;
  const total = data.total ?? passed + failed;

  if (total > 0) {
    // Update test failure rate (exponential moving average)
    const currentFailureRate = failed / total;
    metrics.testFailureRate =
      metrics.testFailureRate * 0.7 + currentFailureRate * 0.3;

    // Detect struggling if multiple test failures
    if (failed > passed && failed > 2) {
      if (!metrics.strugglingIndicators.includes("high_test_failure_rate")) {
        metrics.strugglingIndicators.push("high_test_failure_rate");
      }
    }
  }

  metrics.lastUpdated = new Date().toISOString();
  return metrics;
}

/**
 * Handle question answered event - updates IRT and difficulty
 */
function handleQuestionAnswered(
  metrics: InterviewMetrics,
  data: QuestionAnsweredEventData
): InterviewMetrics {
  const isCorrect = data.isCorrect ?? false;
  const timeSpent = data.timeSpent ?? 0;
  const questionDifficulty = data.difficulty ?? metrics.currentDifficulty;

  // Update question counts
  metrics.questionsAnswered += 1;
  if (isCorrect) {
    metrics.questionsCorrect += 1;
  } else {
    metrics.questionsIncorrect += 1;
  }

  // Update average response time (exponential moving average)
  metrics.averageResponseTime =
    metrics.averageResponseTime * 0.7 + timeSpent * 0.3;

  // Update IRT theta estimate
  const [newTheta, newStandardError] = updateIrtTheta(
    metrics.irtTheta,
    questionDifficulty,
    isCorrect,
    metrics.questionsAnswered
  );
  metrics.irtTheta = newTheta;
  metrics.irtStandardError = newStandardError;

  // Update recommended difficulty
  metrics.recommendedNextDifficulty = calculateRecommendedDifficulty(newTheta);

  // Detect struggling indicators
  if (timeSpent > 1800) {
    // More than 30 minutes
    if (!metrics.strugglingIndicators.includes("slow_response_time")) {
      metrics.strugglingIndicators.push("slow_response_time");
    }
  }

  // Log if difficulty adjustment is needed
  const diffChange = Math.abs(
    metrics.currentDifficulty - metrics.recommendedNextDifficulty
  );
  if (diffChange >= 2) {
    logger.info("Interview Agent recommends difficulty adjustment", {
      sessionId: metrics.sessionId,
      currentDifficulty: metrics.currentDifficulty,
      recommendedDifficulty: metrics.recommendedNextDifficulty,
      theta: metrics.irtTheta,
    });
  }

  metrics.lastUpdated = new Date().toISOString();
  return metrics;
}

/**
 * Handle session complete event - log final metrics
 */
function handleSessionComplete(metrics: InterviewMetrics): InterviewMetrics {
  logger.info("Interview Agent - Session complete", {
    sessionId: metrics.sessionId,
    irtTheta: metrics.irtTheta.toFixed(2),
    questionsAnswered: metrics.questionsAnswered,
    aiDependencyScore: metrics.aiDependencyScore.toFixed(1),
    strugglingIndicators: metrics.strugglingIndicators,
  });

  metrics.lastUpdated = new Date().toISOString();
  return metrics;
}

// =============================================================================
// Interview Agent Class
// =============================================================================

/**
 * Interview Agent
 *
 * Observes candidate progress and adapts interview difficulty using IRT algorithms.
 * This agent is HIDDEN from candidates - it only observes and updates metrics.
 */
export class InterviewAgent {
  private sessionId: string;
  private candidateId: string;

  constructor(config: InterviewAgentConfig) {
    this.sessionId = config.sessionId;
    this.candidateId = config.candidateId;

    // Initialize metrics if not exists
    if (!metricsCache.has(this.sessionId)) {
      const initialDifficulty = config.initialDifficulty ?? 5;
      metricsCache.set(
        this.sessionId,
        createDefaultMetrics(this.sessionId, initialDifficulty)
      );
    }
  }

  /**
   * Process an interview event and return updated metrics.
   *
   * @param eventType - Type of event
   * @param eventData - Event-specific data
   * @returns Updated metrics and processing status
   */
  async processEvent(
    eventType: InterviewEventType,
    eventData: Record<string, unknown>
  ): Promise<InterviewAgentResponse> {
    let metrics = this.getMetrics();

    logger.debug("Interview Agent processing event", {
      sessionId: this.sessionId,
      eventType,
      currentTheta: metrics.irtTheta,
    });

    // Process event based on type
    switch (eventType) {
      case "session-started":
        metrics = handleSessionStarted(
          metrics,
          eventData as unknown as SessionStartedEventData
        );
        break;

      case "ai-interaction":
        metrics = handleAIInteraction(
          metrics,
          eventData as unknown as AIInteractionEventData
        );
        break;

      case "code-changed":
        metrics = handleCodeChanged(metrics);
        break;

      case "test-run":
        metrics = handleTestRun(metrics, eventData as unknown as TestRunEventData);
        break;

      case "question-answered":
        metrics = handleQuestionAnswered(
          metrics,
          eventData as unknown as QuestionAnsweredEventData
        );
        break;

      case "session-complete":
        metrics = handleSessionComplete(metrics);
        break;

      default:
        logger.warn("Unknown event type", { eventType, sessionId: this.sessionId });
    }

    // Update cache
    metricsCache.set(this.sessionId, metrics);

    return {
      metrics,
      processed: true,
      eventType,
    };
  }

  /**
   * Get current metrics for the session
   */
  getMetrics(): InterviewMetrics {
    return (
      metricsCache.get(this.sessionId) ??
      createDefaultMetrics(this.sessionId)
    );
  }

  /**
   * Update the current difficulty level
   */
  setCurrentDifficulty(difficulty: number): void {
    const metrics = this.getMetrics();
    metrics.currentDifficulty = Math.max(1, Math.min(10, difficulty));
    metrics.lastUpdated = new Date().toISOString();
    metricsCache.set(this.sessionId, metrics);
  }

  /**
   * Clear struggling indicators (e.g., when candidate recovers)
   */
  clearStrugglingIndicator(indicator: StrugglingIndicator): void {
    const metrics = this.getMetrics();
    metrics.strugglingIndicators = metrics.strugglingIndicators.filter(
      (i) => i !== indicator
    );
    metrics.lastUpdated = new Date().toISOString();
    metricsCache.set(this.sessionId, metrics);
  }

  /**
   * Get summary for API response
   */
  getMetricsSummary(): {
    sessionId: string;
    irtTheta: number;
    currentDifficulty: number;
    recommendedNextDifficulty: number;
    aiDependencyScore: number;
    questionsAnswered: number;
    strugglingIndicators: string[];
  } {
    const metrics = this.getMetrics();
    return {
      sessionId: metrics.sessionId,
      irtTheta: metrics.irtTheta,
      currentDifficulty: metrics.currentDifficulty,
      recommendedNextDifficulty: metrics.recommendedNextDifficulty,
      aiDependencyScore: metrics.aiDependencyScore,
      questionsAnswered: metrics.questionsAnswered,
      strugglingIndicators: metrics.strugglingIndicators,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Factory function to create an Interview Agent
 */
export function createInterviewAgent(
  config: InterviewAgentConfig
): InterviewAgent {
  return new InterviewAgent(config);
}

// =============================================================================
// Static Methods for Cache Management
// =============================================================================

/**
 * Get metrics for a session without creating an agent
 */
export function getSessionMetrics(sessionId: string): InterviewMetrics | null {
  return metricsCache.get(sessionId) ?? null;
}

/**
 * Clear metrics for a session
 */
export function clearSessionMetrics(sessionId: string): void {
  metricsCache.delete(sessionId);
  logger.debug("Interview Agent - Cleared metrics", { sessionId });
}

/**
 * Clear all cached metrics
 */
export function clearAllMetrics(): void {
  metricsCache.clear();
  logger.debug("Interview Agent - Cleared all metrics");
}
