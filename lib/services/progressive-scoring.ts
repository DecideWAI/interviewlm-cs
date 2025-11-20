/**
 * Progressive Scoring Service
 *
 * Implements weighted scoring where later questions are worth more,
 * rewarding candidates who demonstrate incremental expertise growth.
 *
 * NEW: Dynamic difficulty-based calibration ensures consistent scoring
 * across dynamically generated questions, reducing luck factor.
 */

import type { DifficultyAssessment } from '@/types/seed';

export interface QuestionScore {
  questionNumber: number;
  rawScore: number; // 0-1
  baseWeight: number; // Baseline weight (1.0, 1.2, 1.5, 2.0, 2.5)
  difficultyMultiplier: number; // Calibration based on LLM difficulty assessment
  finalWeight: number; // baseWeight * difficultyMultiplier
  weightedScore: number; // rawScore * finalWeight
  difficultyScore?: number; // Optional: 1-10 difficulty from LLM
}

export interface ProgressiveScoreResult {
  questionScores: QuestionScore[];
  totalWeightedScore: number; // 0-100
  averageRawScore: number; // 0-100
  expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  questionsCompleted: number;
}

/**
 * Progressive Scoring Calculator
 * Later questions have higher weight to reward expertise growth
 */
export class ProgressiveScoringCalculator {
  /**
   * Default weight multipliers for questions 1-5
   * Q1: 1.0x, Q2: 1.2x, Q3: 1.5x, Q4: 2.0x, Q5: 2.5x
   */
  private static DEFAULT_WEIGHTS = [1.0, 1.2, 1.5, 2.0, 2.5];

  /**
   * Calculate progressive score for an assessment
   * NEW: Supports dynamic difficulty calibration to ensure fairness
   */
  static calculateScore(
    questionScores: Array<{
      questionNumber: number;
      score: number;
      difficultyAssessment?: DifficultyAssessment;
    }>,
    customWeights?: number[]
  ): ProgressiveScoreResult {
    const weights = customWeights || this.DEFAULT_WEIGHTS;

    // Establish baseline difficulty (from Q1 if available)
    const baselineDifficulty = questionScores[0]?.difficultyAssessment?.difficultyScore || 5.0;

    // Calculate weighted scores with dynamic difficulty calibration
    const scoredQuestions: QuestionScore[] = questionScores.map((q) => {
      const baseWeight = weights[q.questionNumber - 1] || weights[weights.length - 1];

      // Calculate difficulty multiplier
      let difficultyMultiplier = 1.0;

      if (q.difficultyAssessment) {
        // Use relativeToBaseline if available (most accurate)
        if (q.difficultyAssessment.relativeToBaseline) {
          difficultyMultiplier = q.difficultyAssessment.relativeToBaseline;
        } else {
          // Fallback: normalize difficulty score relative to baseline
          // This ensures Q2 at difficulty 4 gets multiplier < 1.0 if Q1 was difficulty 5
          difficultyMultiplier = q.difficultyAssessment.difficultyScore / baselineDifficulty;
        }

        // Clamp multiplier to reasonable range (0.5x to 2.0x)
        difficultyMultiplier = Math.max(0.5, Math.min(2.0, difficultyMultiplier));
      }

      const finalWeight = baseWeight * difficultyMultiplier;

      return {
        questionNumber: q.questionNumber,
        rawScore: q.score,
        baseWeight,
        difficultyMultiplier,
        finalWeight,
        weightedScore: q.score * finalWeight,
        difficultyScore: q.difficultyAssessment?.difficultyScore,
      };
    });

    // Calculate total weighted score
    const totalWeight = scoredQuestions.reduce((sum, q) => sum + q.finalWeight, 0);
    const totalWeightedScore = scoredQuestions.reduce(
      (sum, q) => sum + q.weightedScore,
      0
    );

    // Normalize to 0-100 scale
    const normalizedScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;

    // Calculate average raw score
    const avgRawScore =
      questionScores.length > 0
        ? (questionScores.reduce((sum, q) => sum + q.score, 0) / questionScores.length) *
          100
        : 0;

    // Determine expertise level based on weighted score
    let expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    if (normalizedScore >= 85) expertiseLevel = 'expert';
    else if (normalizedScore >= 70) expertiseLevel = 'advanced';
    else if (normalizedScore >= 50) expertiseLevel = 'intermediate';
    else expertiseLevel = 'beginner';

    return {
      questionScores: scoredQuestions,
      totalWeightedScore: normalizedScore,
      averageRawScore: avgRawScore,
      expertiseLevel,
      questionsCompleted: questionScores.length,
    };
  }

  /**
   * Get weight for a specific question number
   */
  static getQuestionWeight(questionNumber: number, customWeights?: number[]): number {
    const weights = customWeights || this.DEFAULT_WEIGHTS;
    return weights[questionNumber - 1] || weights[weights.length - 1];
  }

  /**
   * Calculate expertise growth (improvement from Q1 to latest)
   */
  static calculateExpertiseGrowth(
    questionScores: Array<{ questionNumber: number; score: number }>
  ): {
    growth: number; // percentage point change
    trend: 'improving' | 'declining' | 'stable';
  } {
    if (questionScores.length < 2) {
      return { growth: 0, trend: 'stable' };
    }

    const firstScore = questionScores[0].score * 100;
    const lastScore = questionScores[questionScores.length - 1].score * 100;
    const growth = lastScore - firstScore;

    let trend: 'improving' | 'declining' | 'stable';
    if (growth > 5) trend = 'improving';
    else if (growth < -5) trend = 'declining';
    else trend = 'stable';

    return { growth, trend };
  }

  /**
   * Determine if candidate is ready for next question
   */
  static shouldAdvanceToNextQuestion(
    currentQuestionScore: number,
    currentQuestionNumber: number,
    expertiseThreshold: number = 0.7
  ): {
    shouldAdvance: boolean;
    reason: string;
  } {
    const maxQuestions = 5;

    // Reached max questions
    if (currentQuestionNumber >= maxQuestions) {
      return {
        shouldAdvance: false,
        reason: `Maximum questions (${maxQuestions}) reached`,
      };
    }

    // Check if score meets expertise threshold
    if (currentQuestionScore < expertiseThreshold) {
      return {
        shouldAdvance: false,
        reason: `Score ${(currentQuestionScore * 100).toFixed(0)}% below threshold ${(expertiseThreshold * 100).toFixed(0)}%`,
      };
    }

    // Good performance, advance
    return {
      shouldAdvance: true,
      reason: `Strong performance (${(currentQuestionScore * 100).toFixed(0)}%), ready for next challenge`,
    };
  }

  /**
   * Generate score summary for display
   */
  static generateScoreSummary(result: ProgressiveScoreResult): string {
    const lines = [
      `📊 Assessment Score: ${result.totalWeightedScore.toFixed(1)}/100 (${result.expertiseLevel})`,
      ``,
      `Questions Completed: ${result.questionsCompleted}`,
      `Average Raw Score: ${result.averageRawScore.toFixed(1)}%`,
      ``,
      `Question Breakdown (with difficulty-calibrated weights):`,
    ];

    result.questionScores.forEach((q) => {
      const bar = '█'.repeat(Math.floor(q.rawScore * 10));
      const difficultyInfo = q.difficultyScore
        ? ` [difficulty: ${q.difficultyScore}/10]`
        : '';
      const weightInfo = q.difficultyMultiplier !== undefined && q.difficultyMultiplier !== 1.0
        ? ` (${q.baseWeight}x × ${q.difficultyMultiplier.toFixed(2)} = ${q.finalWeight.toFixed(2)}x)`
        : ` (${q.finalWeight.toFixed(2)}x)`;

      lines.push(
        `  Q${q.questionNumber}: ${(q.rawScore * 100).toFixed(0)}%${weightInfo}${difficultyInfo} ${bar}`
      );
    });

    return lines.join('\n');
  }
}

// Export singleton instance
export const progressiveScoring = ProgressiveScoringCalculator;
