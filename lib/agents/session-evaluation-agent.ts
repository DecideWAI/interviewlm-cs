/**
 * Session Evaluation Agent - TypeScript Implementation
 *
 * Evaluates completed interview sessions across 4 dimensions with
 * evidence-based scoring. This is for full SESSION evaluation
 * (different from single question evaluation).
 *
 * Ported from the Python LangGraph implementation.
 */

import { logger } from "@/lib/utils/logger";
import {
  SessionEvaluationResult,
  SessionData,
  DimensionScore,
  SCORING_WEIGHTS,
  SessionEvaluationConfig,
  createDefaultEvaluationResult,
} from "@/lib/types/session-evaluation";
import {
  analyzeCodeQuality,
  analyzeProblemSolving,
  analyzeAICollaboration,
  analyzeCommunication,
} from "@/lib/agent-tools/analysis";

// =============================================================================
// Bias Detection
// =============================================================================

/**
 * Detect potential biases in evaluation
 */
function detectBiases(
  sessionData: SessionData,
  scores: {
    codeQuality: DimensionScore;
    problemSolving: DimensionScore;
    aiCollaboration: DimensionScore;
    communication: DimensionScore;
  }
): string[] {
  const biasFlags: string[] = [];

  // Code volume bias: high score with minimal code
  const totalLines =
    sessionData.codeSnapshots
      ?.slice(-1)[0]
      ?.files &&
    Object.values(sessionData.codeSnapshots.slice(-1)[0].files).reduce(
      (acc, content) =>
        acc + (typeof content === "string" ? content.split("\n").length : 0),
      0
    );

  if (totalLines && totalLines < 20 && scores.codeQuality.score > 80) {
    biasFlags.push("code_volume_bias");
  }

  // Low confidence warning
  const avgConfidence =
    (scores.codeQuality.confidence +
      scores.problemSolving.confidence +
      scores.aiCollaboration.confidence +
      scores.communication.confidence) /
    4;

  if (avgConfidence < 0.5) {
    biasFlags.push("low_confidence_evaluation");
  }

  // No AI usage but high AI collaboration score
  if (
    (!sessionData.claudeInteractions ||
      sessionData.claudeInteractions.length === 0) &&
    scores.aiCollaboration.score > 0
  ) {
    biasFlags.push("ai_usage_inconsistency");
  }

  // Perfect score warning (might indicate gaming)
  const overallScore =
    scores.codeQuality.score * SCORING_WEIGHTS.codeQuality +
    scores.problemSolving.score * SCORING_WEIGHTS.problemSolving +
    scores.aiCollaboration.score * SCORING_WEIGHTS.aiCollaboration +
    scores.communication.score * SCORING_WEIGHTS.communication;

  if (overallScore >= 98) {
    biasFlags.push("perfect_score_review_needed");
  }

  return biasFlags;
}

/**
 * Aggregate dimension scores into overall score
 */
function aggregateScores(scores: {
  codeQuality: DimensionScore;
  problemSolving: DimensionScore;
  aiCollaboration: DimensionScore;
  communication: DimensionScore;
}): { overallScore: number; overallConfidence: number } {
  const overallScore = Math.round(
    scores.codeQuality.score * SCORING_WEIGHTS.codeQuality +
      scores.problemSolving.score * SCORING_WEIGHTS.problemSolving +
      scores.aiCollaboration.score * SCORING_WEIGHTS.aiCollaboration +
      scores.communication.score * SCORING_WEIGHTS.communication
  );

  // Weighted confidence based on same weights
  const overallConfidence =
    scores.codeQuality.confidence * SCORING_WEIGHTS.codeQuality +
    scores.problemSolving.confidence * SCORING_WEIGHTS.problemSolving +
    scores.aiCollaboration.confidence * SCORING_WEIGHTS.aiCollaboration +
    scores.communication.confidence * SCORING_WEIGHTS.communication;

  return { overallScore, overallConfidence };
}

// =============================================================================
// Session Evaluation Agent Class
// =============================================================================

/**
 * Session Evaluation Agent
 *
 * Evaluates completed interview sessions across 4 dimensions:
 * - Code Quality (40%) - Test results + static analysis
 * - Problem Solving (25%) - Iteration patterns + debugging approach
 * - AI Collaboration (20%) - Prompt quality + usage effectiveness
 * - Communication (15%) - Prompt clarity + code documentation
 */
export class SessionEvaluationAgent {
  private sessionId: string;
  private candidateId: string;

  constructor(config: SessionEvaluationConfig) {
    this.sessionId = config.sessionId;
    this.candidateId = config.candidateId;
  }

  /**
   * Evaluate a complete session and return scores across all 4 dimensions.
   * Uses Promise.all for parallel evaluation.
   *
   * @param sessionData - All session data including code, tests, interactions
   * @returns Complete evaluation result with all dimension scores
   */
  async evaluateSession(
    sessionData: SessionData
  ): Promise<SessionEvaluationResult> {
    logger.info("Session Evaluation Agent starting evaluation", {
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      codeSnapshotCount: sessionData.codeSnapshots?.length || 0,
      testResultCount: sessionData.testResults?.length || 0,
      interactionCount: sessionData.claudeInteractions?.length || 0,
    });

    const startTime = Date.now();

    try {
      // Run all 4 evaluations in parallel
      const [codeQuality, problemSolving, aiCollaboration, communication] =
        await Promise.all([
          this.evaluateCodeQuality(sessionData),
          this.evaluateProblemSolving(sessionData),
          this.evaluateAICollaboration(sessionData),
          this.evaluateCommunication(sessionData),
        ]);

      const scores = { codeQuality, problemSolving, aiCollaboration, communication };

      // Aggregate scores
      const { overallScore, overallConfidence } = aggregateScores(scores);

      // Detect biases
      const biasFlags = detectBiases(sessionData, scores);

      const result: SessionEvaluationResult = {
        sessionId: this.sessionId,
        candidateId: this.candidateId,
        codeQuality,
        problemSolving,
        aiCollaboration,
        communication,
        overallScore,
        overallConfidence,
        evaluatedAt: new Date().toISOString(),
        model: "claude-sonnet-4-20250514",
        biasFlags,
      };

      const duration = Date.now() - startTime;
      logger.info("Session Evaluation Agent completed", {
        sessionId: this.sessionId,
        overallScore,
        overallConfidence: overallConfidence.toFixed(2),
        biasFlags,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      logger.error("Session Evaluation Agent failed", error as Error, {
        sessionId: this.sessionId,
      });

      // Return default result on error
      return createDefaultEvaluationResult(this.sessionId, this.candidateId);
    }
  }

  /**
   * Evaluate code quality dimension
   */
  private async evaluateCodeQuality(
    sessionData: SessionData
  ): Promise<DimensionScore> {
    try {
      return await analyzeCodeQuality(
        sessionData.codeSnapshots || [],
        sessionData.testResults || []
      );
    } catch (error) {
      logger.warn("Code quality evaluation failed", { error });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }

  /**
   * Evaluate problem solving dimension
   */
  private async evaluateProblemSolving(
    sessionData: SessionData
  ): Promise<DimensionScore> {
    try {
      return await analyzeProblemSolving(
        sessionData.codeSnapshots || [],
        sessionData.testResults || [],
        sessionData.terminalCommands
      );
    } catch (error) {
      logger.warn("Problem solving evaluation failed", { error });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }

  /**
   * Evaluate AI collaboration dimension
   */
  private async evaluateAICollaboration(
    sessionData: SessionData
  ): Promise<DimensionScore> {
    try {
      return await analyzeAICollaboration(
        sessionData.claudeInteractions || [],
        sessionData.interviewMetrics
      );
    } catch (error) {
      logger.warn("AI collaboration evaluation failed", { error });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }

  /**
   * Evaluate communication dimension
   */
  private async evaluateCommunication(
    sessionData: SessionData
  ): Promise<DimensionScore> {
    try {
      return await analyzeCommunication(
        sessionData.claudeInteractions || [],
        sessionData.codeSnapshots || []
      );
    } catch (error) {
      logger.warn("Communication evaluation failed", { error });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Factory function to create a Session Evaluation Agent
 */
export function createSessionEvaluationAgent(
  config: SessionEvaluationConfig
): SessionEvaluationAgent {
  return new SessionEvaluationAgent(config);
}
