/**
 * Fast Evaluation Types
 *
 * Types for the FastProgressionAgent that provides quick pass/fail
 * decisions during live interviews. Optimized for speed with limited
 * tool iterations and no test execution.
 */

import type { AssessmentType } from '@/types/seed';

/**
 * Input for fast evaluation - all data passed directly, no discovery needed
 */
export interface FastEvaluationInput {
  sessionId: string;
  candidateId: string;
  questionId: string;
  assessmentType: AssessmentType;

  // Question context (passed directly)
  questionTitle: string;
  questionDescription: string;
  questionDifficulty: string;
  questionRequirements: string[];

  // Test results from UI (trusted, not re-run)
  testResults: {
    passed: number;
    failed: number;
    total: number;
    output?: string;
  };

  // Hints for faster code discovery
  language: string;
  fileName?: string; // Primary solution file hint

  // Threshold
  passingThreshold?: number; // Default 70
}

/**
 * Fast criterion score - minimal feedback for speed
 */
export interface FastCriterionScore {
  score: number;
  maxScore: number;
  met: boolean; // Quick pass/fail for this criterion
  feedback: string; // Brief 1-sentence feedback
}

/**
 * Real World assessment criteria for fast evaluation
 */
export interface FastRealWorldCriteria {
  problemCompletion: FastCriterionScore; // 30 pts
  codeQuality: FastCriterionScore; // 25 pts
  testing: FastCriterionScore; // 20 pts
  errorHandling: FastCriterionScore; // 15 pts
  efficiency: FastCriterionScore; // 10 pts
}

/**
 * System Design assessment criteria for fast evaluation
 */
export interface FastSystemDesignCriteria {
  designClarity: FastCriterionScore; // 30 pts
  tradeoffAnalysis: FastCriterionScore; // 25 pts
  apiDesign: FastCriterionScore; // 20 pts
  implementation: FastCriterionScore; // 15 pts
  communication: FastCriterionScore; // 10 pts
}

/**
 * Union type for fast evaluation criteria
 */
export type FastEvaluationCriteria =
  | FastRealWorldCriteria
  | FastSystemDesignCriteria;

/**
 * Fast evaluation result - minimal but sufficient for progression decision
 */
export interface FastEvaluationResult {
  passed: boolean;
  overallScore: number;
  assessmentType: AssessmentType;

  // Criteria scores (varies by assessment type)
  criteria: FastEvaluationCriteria;

  // Quick feedback for candidate (2-3 sentences max)
  feedback: string;

  // Blocking reason if failed
  blockingReason?: string;

  // Key strengths (max 3)
  strengths: string[];

  // Key improvements (max 3)
  improvements: string[];

  // Metadata
  metadata: {
    model: string;
    evaluationTimeMs: number;
    toolCallCount: number;
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Configuration for the FastProgressionAgent
 */
export interface FastProgressionAgentConfig {
  model?: string;
  maxIterations?: number;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Default configuration values
 */
export const FAST_AGENT_DEFAULTS = {
  MODEL: 'claude-haiku-4-5-20251001',
  MAX_ITERATIONS: 3,
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.2,
  PASSING_THRESHOLD: 70,
} as const;

/**
 * Criteria weights for Real World assessments
 */
export const REAL_WORLD_CRITERIA_WEIGHTS = {
  problemCompletion: { maxScore: 30, weight: 0.30 },
  codeQuality: { maxScore: 25, weight: 0.25 },
  testing: { maxScore: 20, weight: 0.20 },
  errorHandling: { maxScore: 15, weight: 0.15 },
  efficiency: { maxScore: 10, weight: 0.10 },
} as const;

/**
 * Criteria weights for System Design assessments
 */
export const SYSTEM_DESIGN_CRITERIA_WEIGHTS = {
  designClarity: { maxScore: 30, weight: 0.30 },
  tradeoffAnalysis: { maxScore: 25, weight: 0.25 },
  apiDesign: { maxScore: 20, weight: 0.20 },
  implementation: { maxScore: 15, weight: 0.15 },
  communication: { maxScore: 10, weight: 0.10 },
} as const;

/**
 * Creates default empty fast evaluation result
 */
export function createDefaultFastResult(
  sessionId: string,
  assessmentType: AssessmentType
): Omit<FastEvaluationResult, 'metadata'> {
  const emptyCriterion: FastCriterionScore = {
    score: 0,
    maxScore: 0,
    met: false,
    feedback: '',
  };

  const criteria: FastEvaluationCriteria =
    assessmentType === 'SYSTEM_DESIGN'
      ? {
          designClarity: { ...emptyCriterion, maxScore: 30 },
          tradeoffAnalysis: { ...emptyCriterion, maxScore: 25 },
          apiDesign: { ...emptyCriterion, maxScore: 20 },
          implementation: { ...emptyCriterion, maxScore: 15 },
          communication: { ...emptyCriterion, maxScore: 10 },
        }
      : {
          problemCompletion: { ...emptyCriterion, maxScore: 30 },
          codeQuality: { ...emptyCriterion, maxScore: 25 },
          testing: { ...emptyCriterion, maxScore: 20 },
          errorHandling: { ...emptyCriterion, maxScore: 15 },
          efficiency: { ...emptyCriterion, maxScore: 10 },
        };

  return {
    passed: false,
    overallScore: 0,
    assessmentType,
    criteria,
    feedback: '',
    strengths: [],
    improvements: [],
  };
}

/**
 * Type guard for Real World criteria
 */
export function isRealWorldCriteria(
  criteria: FastEvaluationCriteria
): criteria is FastRealWorldCriteria {
  return 'problemCompletion' in criteria;
}

/**
 * Type guard for System Design criteria
 */
export function isSystemDesignCriteria(
  criteria: FastEvaluationCriteria
): criteria is FastSystemDesignCriteria {
  return 'designClarity' in criteria;
}
