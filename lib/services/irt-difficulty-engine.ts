/**
 * IRT (Item Response Theory) Difficulty Engine
 *
 * Implements a 2-Parameter Logistic (2-PL) model for adaptive difficulty targeting.
 * This ensures consistent, fair scoring across dynamically generated questions by:
 *
 * 1. Estimating candidate ability (theta) from performance history
 * 2. Calculating optimal next question difficulty (theta + 0.3 for max information)
 * 3. Calibrating scores to account for question difficulty variation
 *
 * IRT Model: P(correct | theta, a, b) = 1 / (1 + exp(-a * (theta - b)))
 * Where:
 *   theta = candidate ability (typically -3 to +3)
 *   a = discrimination parameter (how well question differentiates ability levels)
 *   b = difficulty parameter (ability level needed for 50% success)
 */

export interface IRTQuestionParams {
  difficulty: number;     // b parameter: -3 (trivial) to +3 (expert)
  discrimination: number; // a parameter: 0.5-2.5 (how well it differentiates)
  guessing?: number;      // c parameter: probability of guessing correctly (optional, for 3-PL)
}

export interface CandidateAbilityEstimate {
  theta: number;              // Estimated ability (-3 to +3)
  standardError: number;      // Uncertainty in estimate
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  reliability: number;        // 0-1, how reliable is this estimate
  questionsUsed: number;      // Number of questions used in estimate
}

export interface DifficultyTargeting {
  targetDifficulty: number;   // Optimal difficulty for next question
  targetRange: {
    min: number;
    max: number;
  };
  reasoning: string;
  informationGain: number;    // Expected information gain at this difficulty
}

export interface PerformanceRecord {
  questionId: string;
  score: number;              // 0-1 normalized score
  difficulty: number;         // Question difficulty (b parameter)
  discrimination: number;     // Question discrimination (a parameter)
  timeSpent: number;          // Minutes
  expectedTime: number;       // Expected minutes
}

/**
 * IRT Difficulty Engine
 * Core engine for adaptive difficulty calculations
 */
export class IRTDifficultyEngine {
  // Constants for IRT calculations
  private static readonly THETA_MIN = -3.0;
  private static readonly THETA_MAX = 3.0;
  private static readonly DEFAULT_DISCRIMINATION = 1.0;
  private static readonly DEFAULT_DIFFICULTY = 0.0;
  private static readonly OPTIMAL_OFFSET = 0.3; // Target difficulty above current ability

  // Mapping from categorical difficulty to IRT b-parameter
  private static readonly DIFFICULTY_TO_THETA: Record<string, number> = {
    'EASY': -1.0,
    'MEDIUM': 0.0,
    'HARD': 1.5,
  };

  /**
   * Estimate candidate ability from performance history
   * Uses Maximum Likelihood Estimation (MLE)
   */
  static estimateAbility(
    performanceHistory: PerformanceRecord[]
  ): CandidateAbilityEstimate {
    if (performanceHistory.length === 0) {
      // No history - return prior (neutral ability)
      return {
        theta: 0.0,
        standardError: 1.5,
        confidenceInterval: { lower: -1.5, upper: 1.5 },
        reliability: 0.0,
        questionsUsed: 0,
      };
    }

    // Use MLE to estimate theta
    let theta = this.maximumLikelihoodEstimate(performanceHistory);

    // Calculate standard error
    const se = this.calculateStandardError(performanceHistory, theta);

    // Calculate reliability (based on number of questions and consistency)
    const reliability = this.calculateReliability(performanceHistory, theta);

    // Clamp theta to valid range
    theta = Math.max(this.THETA_MIN, Math.min(this.THETA_MAX, theta));

    return {
      theta,
      standardError: se,
      confidenceInterval: {
        lower: theta - 1.96 * se,
        upper: theta + 1.96 * se,
      },
      reliability,
      questionsUsed: performanceHistory.length,
    };
  }

  /**
   * Maximum Likelihood Estimation for theta
   * Uses Newton-Raphson iteration
   */
  private static maximumLikelihoodEstimate(
    performanceHistory: PerformanceRecord[]
  ): number {
    let theta = 0.0; // Start at neutral ability
    const maxIterations = 20;
    const convergenceThreshold = 0.001;

    for (let i = 0; i < maxIterations; i++) {
      let firstDerivative = 0;
      let secondDerivative = 0;

      for (const record of performanceHistory) {
        const a = record.discrimination || this.DEFAULT_DISCRIMINATION;
        const b = record.difficulty;
        const score = record.score;

        // P(theta) = 1 / (1 + exp(-a * (theta - b)))
        const p = this.probability(theta, a, b);
        const q = 1 - p;

        // First derivative of log-likelihood
        firstDerivative += a * (score - p);

        // Second derivative of log-likelihood
        secondDerivative -= a * a * p * q;
      }

      // Newton-Raphson update
      if (Math.abs(secondDerivative) < 0.0001) break;

      const delta = -firstDerivative / secondDerivative;
      theta += delta;

      // Clamp to valid range
      theta = Math.max(this.THETA_MIN, Math.min(this.THETA_MAX, theta));

      if (Math.abs(delta) < convergenceThreshold) break;
    }

    return theta;
  }

  /**
   * Calculate probability of success given theta and question parameters
   * 2-PL model
   */
  static probability(theta: number, a: number, b: number): number {
    return 1 / (1 + Math.exp(-a * (theta - b)));
  }

  /**
   * Calculate standard error of theta estimate
   */
  private static calculateStandardError(
    performanceHistory: PerformanceRecord[],
    theta: number
  ): number {
    let information = 0;

    for (const record of performanceHistory) {
      const a = record.discrimination || this.DEFAULT_DISCRIMINATION;
      const b = record.difficulty;
      const p = this.probability(theta, a, b);
      const q = 1 - p;

      // Fisher information for 2-PL model
      information += a * a * p * q;
    }

    // SE = 1 / sqrt(information)
    return information > 0 ? 1 / Math.sqrt(information) : 1.5;
  }

  /**
   * Calculate reliability of ability estimate
   */
  private static calculateReliability(
    performanceHistory: PerformanceRecord[],
    theta: number
  ): number {
    if (performanceHistory.length < 2) return 0.3;

    // Calculate consistency of performance relative to predicted
    let sumSquaredResiduals = 0;

    for (const record of performanceHistory) {
      const a = record.discrimination || this.DEFAULT_DISCRIMINATION;
      const b = record.difficulty;
      const predicted = this.probability(theta, a, b);
      const actual = record.score;

      sumSquaredResiduals += Math.pow(actual - predicted, 2);
    }

    // Higher reliability when predictions match actual performance
    const consistency = 1 - (sumSquaredResiduals / performanceHistory.length);

    // Adjust for number of questions
    const nFactor = Math.min(1, performanceHistory.length / 5);

    return Math.max(0, Math.min(1, consistency * 0.7 + nFactor * 0.3));
  }

  /**
   * Calculate optimal difficulty for next question
   * Targets difficulty where candidate has ~70% success probability
   */
  static calculateTargetDifficulty(
    abilityEstimate: CandidateAbilityEstimate,
    questionNumber: number,
    _maxQuestions: number = 5
  ): DifficultyTargeting {
    const theta = abilityEstimate.theta;

    // Optimal targeting: question at theta + offset gives max information
    // But adjust based on where we are in the assessment
    let targetOffset: number;

    // Early questions (Q1-Q2): Be more conservative, target near theta
    if (questionNumber <= 2) {
      targetOffset = 0.1 + (questionNumber - 1) * 0.1;
    }
    // Middle questions (Q3): Standard offset
    else if (questionNumber === 3) {
      targetOffset = this.OPTIMAL_OFFSET;
    }
    // Later questions (Q4-Q5): Push higher if performing well
    else {
      targetOffset = theta > 0 ? 0.5 : 0.3;
    }

    const targetDifficulty = theta + targetOffset;

    // Calculate target range (±0.5 from target)
    const range = {
      min: Math.max(this.THETA_MIN, targetDifficulty - 0.5),
      max: Math.min(this.THETA_MAX, targetDifficulty + 0.5),
    };

    // Calculate expected information gain at target difficulty
    const informationGain = this.calculateInformationGain(
      theta,
      targetDifficulty,
      this.DEFAULT_DISCRIMINATION
    );

    // Generate reasoning
    const abilityLevel = this.abilityToLabel(theta);
    const targetLevel = this.abilityToLabel(targetDifficulty);

    return {
      targetDifficulty: Math.max(this.THETA_MIN, Math.min(this.THETA_MAX, targetDifficulty)),
      targetRange: range,
      reasoning: `Candidate demonstrates ${abilityLevel} ability (θ=${theta.toFixed(2)}). ` +
        `Targeting ${targetLevel} difficulty (θ=${targetDifficulty.toFixed(2)}) for Q${questionNumber} ` +
        `to maximize measurement precision. Expected ~${Math.round(this.probability(theta, 1.0, targetDifficulty) * 100)}% success rate.`,
      informationGain,
    };
  }

  /**
   * Calculate Fisher Information at a specific difficulty level
   */
  private static calculateInformationGain(
    theta: number,
    difficulty: number,
    discrimination: number
  ): number {
    const p = this.probability(theta, discrimination, difficulty);
    return discrimination * discrimination * p * (1 - p);
  }

  /**
   * Convert IRT theta to categorical difficulty
   */
  static thetaToCategoricalDifficulty(theta: number): 'EASY' | 'MEDIUM' | 'HARD' {
    if (theta < -0.5) return 'EASY';
    if (theta < 0.75) return 'MEDIUM';
    return 'HARD';
  }

  /**
   * Convert categorical difficulty to IRT theta
   */
  static categoricalDifficultyToTheta(difficulty: string): number {
    return this.DIFFICULTY_TO_THETA[difficulty.toUpperCase()] ?? this.DEFAULT_DIFFICULTY;
  }

  /**
   * Convert theta to human-readable ability label
   */
  private static abilityToLabel(theta: number): string {
    if (theta < -1.5) return 'foundational';
    if (theta < -0.5) return 'beginner';
    if (theta < 0.5) return 'intermediate';
    if (theta < 1.5) return 'advanced';
    return 'expert';
  }

  /**
   * Calculate difficulty-calibrated score
   * Adjusts raw score based on question difficulty relative to candidate ability
   */
  static calculateCalibratedScore(
    rawScore: number,
    questionDifficulty: number,
    candidateTheta: number,
    discrimination: number = 1.0
  ): number {
    // Expected probability of success
    const expectedP = this.probability(candidateTheta, discrimination, questionDifficulty);

    // If question was harder than expected (lower expectedP), boost score
    // If question was easier than expected (higher expectedP), penalize slightly
    const difficultyFactor = 1 + (0.5 - expectedP) * 0.4;

    const calibratedScore = rawScore * difficultyFactor;

    // Clamp to 0-1
    return Math.max(0, Math.min(1, calibratedScore));
  }

  /**
   * Determine if assessment should continue based on IRT information
   */
  static shouldContinueAssessment(
    abilityEstimate: CandidateAbilityEstimate,
    questionsCompleted: number,
    minQuestions: number = 2,
    maxQuestions: number = 5,
    targetSE: number = 0.4 // Stop when SE < 0.4
  ): { continue: boolean; reason: string } {
    // Must complete minimum questions
    if (questionsCompleted < minQuestions) {
      return {
        continue: true,
        reason: `Minimum ${minQuestions} questions required (completed: ${questionsCompleted})`,
      };
    }

    // Check if we've hit maximum
    if (questionsCompleted >= maxQuestions) {
      return {
        continue: false,
        reason: `Maximum ${maxQuestions} questions reached`,
      };
    }

    // Check if we have sufficient precision
    if (abilityEstimate.standardError <= targetSE && abilityEstimate.reliability >= 0.7) {
      return {
        continue: false,
        reason: `Sufficient measurement precision achieved (SE=${abilityEstimate.standardError.toFixed(2)}, reliability=${abilityEstimate.reliability.toFixed(2)})`,
      };
    }

    // Continue for more precision
    return {
      continue: true,
      reason: `Need more questions for precision (SE=${abilityEstimate.standardError.toFixed(2)}, target=${targetSE})`,
    };
  }

  /**
   * Convert performance history from question data to IRT format
   */
  static convertPerformanceToIRT(
    questions: Array<{
      id: string;
      difficulty: string;
      score: number | null;
      startedAt: Date | null;
      completedAt: Date | null;
      estimatedTime: number;
    }>
  ): PerformanceRecord[] {
    return questions
      .filter(q => q.score !== null)
      .map(q => ({
        questionId: q.id,
        score: q.score!,
        difficulty: this.categoricalDifficultyToTheta(q.difficulty),
        discrimination: this.DEFAULT_DISCRIMINATION,
        timeSpent: q.startedAt && q.completedAt
          ? (q.completedAt.getTime() - q.startedAt.getTime()) / (1000 * 60)
          : q.estimatedTime,
        expectedTime: q.estimatedTime,
      }));
  }

  /**
   * Generate difficulty visibility info for candidates
   */
  static generateDifficultyVisibility(
    questionNumber: number,
    targetDifficulty: number,
    abilityEstimate: CandidateAbilityEstimate
  ): {
    level: string;
    description: string;
    progressIndicator: string;
    encouragement: string;
  } {
    const level = this.abilityToLabel(targetDifficulty);

    // Calculate expected success probability
    const successProb = this.probability(
      abilityEstimate.theta,
      this.DEFAULT_DISCRIMINATION,
      targetDifficulty
    );

    // Generate progress bar (5 segments)
    const filledSegments = Math.round((targetDifficulty + 3) / 6 * 5);
    const progressIndicator = '█'.repeat(filledSegments) + '░'.repeat(5 - filledSegments);

    // Generate encouraging description
    let description: string;
    let encouragement: string;

    if (successProb > 0.7) {
      description = `Question ${questionNumber} is well-suited to your demonstrated skills.`;
      encouragement = 'You\'ve shown strong fundamentals. This builds on what you know.';
    } else if (successProb > 0.5) {
      description = `Question ${questionNumber} presents a moderate challenge.`;
      encouragement = 'This is designed to help you demonstrate your depth of knowledge.';
    } else {
      description = `Question ${questionNumber} is a challenging extension.`;
      encouragement = 'This tests advanced concepts. Show your problem-solving approach!';
    }

    return {
      level: level.charAt(0).toUpperCase() + level.slice(1),
      description,
      progressIndicator,
      encouragement,
    };
  }
}

// Export singleton instance
export const irtEngine = IRTDifficultyEngine;
