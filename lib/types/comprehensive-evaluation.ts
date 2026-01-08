/**
 * Comprehensive Evaluation Types
 *
 * Types for the ComprehensiveEvaluationAgent that provides full session
 * evaluation for hiring managers. Runs in background, re-evaluates from
 * scratch, and generates detailed actionable reports.
 */

import type { SeniorityLevel, AssessmentType } from '@/types/assessment';
import type { ProgressiveScoreResult } from '@/lib/services/progressive-scoring';
import type { ConfidenceMetrics, BiasDetectionResult } from '@/lib/evaluation/confidence-and-bias';
import type { ActionableReport } from '@/lib/services/actionable-report';

/**
 * Evidence supporting a score
 */
export interface ComprehensiveEvidence {
  type: 'code_snippet' | 'test_result' | 'ai_interaction' | 'metric' | 'terminal_command';
  description: string;
  timestamp?: Date;
  codeSnippet?: string;
  filePath?: string;
  lineNumber?: number;
  value?: string | number;

  // Event linking for Sentry-like replay (click to jump to moment)
  eventId?: string;           // SessionEventLog.id
  sequenceNumber?: number;    // For timeline positioning
  importance?: 'critical' | 'important' | 'normal';
}

/**
 * Score for a single evaluation dimension with full evidence
 */
export interface ComprehensiveDimensionScore {
  score: number; // 0-100
  confidence: number; // 0-1
  evidence: ComprehensiveEvidence[];
  breakdown: Record<string, number> | null; // Sub-scores
}

/**
 * Question data for comprehensive evaluation
 */
export interface ComprehensiveQuestionData {
  questionId: string;
  title: string;
  description: string;
  difficulty: string;
  requirements: string[];
  assessmentType: AssessmentType;
}

/**
 * Input for comprehensive evaluation
 */
export interface ComprehensiveEvaluationInput {
  sessionId: string;
  candidateId: string;
  role: string;
  seniority: SeniorityLevel;
  questions: ComprehensiveQuestionData[];
}

/**
 * Session data extracted from event store
 */
export interface ComprehensiveSessionData {
  sessionId: string;
  candidateId: string;

  // Code snapshots with timestamps and event links
  codeSnapshots: Array<{
    timestamp: Date;
    files: Record<string, string>;
    questionId?: string;
    origin: 'USER' | 'AI';
    // Event linking for replay
    eventId?: string;
    sequenceNumber?: number;
  }>;

  // Test results with event links
  testResults: Array<{
    timestamp: Date;
    passed: number;
    failed: number;
    total: number;
    output?: string;
    questionId?: string;
    // Event linking for replay
    eventId?: string;
    sequenceNumber?: number;
  }>;

  // AI interactions with event links
  aiInteractions: Array<{
    timestamp: Date;
    candidateMessage: string;
    assistantMessage?: string;
    toolsUsed?: string[];
    questionId?: string;
    // Event linking for replay
    userEventId?: string;
    assistantEventId?: string;
    userSequenceNumber?: number;
    assistantSequenceNumber?: number;
  }>;

  // Terminal commands with event links
  terminalCommands: Array<{
    timestamp: Date;
    command: string;
    output?: string;
    exitCode?: number;
    questionId?: string;
    // Event linking for replay
    eventId?: string;
    sequenceNumber?: number;
  }>;

  // Interview metrics
  metrics?: {
    aiDependencyScore?: number;
    irtTheta?: number;
    strugglingIndicators?: Array<{
      type: string;
      severity: string;
      timestamp: Date;
    }>;
  };
}

/**
 * Hiring recommendation with full reasoning
 */
export interface ComprehensiveHiringRecommendation {
  decision: 'strong-hire' | 'hire' | 'no-hire' | 'strong-no-hire';
  confidence: number; // 0-1
  reasoning: string[];
  conditions?: string[]; // Conditions for hire if applicable
  aiFactorInfluence: 'positive' | 'neutral' | 'negative';
  riskFactors?: string[];
  comparativeRank?: {
    percentile: number;
    sampleSize: number;
  };
}

/**
 * Complete comprehensive evaluation result
 */
export interface ComprehensiveEvaluationResult {
  sessionId: string;
  candidateId: string;

  // 4-dimension scores with evidence
  codeQuality: ComprehensiveDimensionScore;
  problemSolving: ComprehensiveDimensionScore;
  aiCollaboration: ComprehensiveDimensionScore;
  communication: ComprehensiveDimensionScore;

  // Overall scores
  overallScore: number;
  overallConfidence: number;

  // Progressive scoring (multi-question assessments)
  progressiveResult?: ProgressiveScoreResult;
  expertiseLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  expertiseGrowth?: number;
  expertiseGrowthTrend?: 'improving' | 'declining' | 'stable';

  // Full actionable report
  actionableReport: ActionableReport;

  // Hiring recommendation
  hiringRecommendation: ComprehensiveHiringRecommendation;

  // Confidence & bias detection
  confidenceMetrics: ConfidenceMetrics;
  biasDetection?: BiasDetectionResult;
  biasFlags: string[];
  fairnessReport?: string;

  // Per-question evaluations
  questionEvaluations?: Array<{
    questionId: string;
    score: number;
    criteria: Record<string, number>;
    feedback: string;
  }>;

  // Metadata
  evaluatedAt: Date;
  model: string;
  evaluationTimeMs: number;
  toolCallCount: number;
}

/**
 * Configuration for the ComprehensiveEvaluationAgent
 */
export interface ComprehensiveEvaluationAgentConfig {
  model?: string;
  maxIterations?: number;
  maxTokens?: number;
  temperature?: number;
  enableToolUse?: boolean;
}

/**
 * Default configuration values
 */
export const COMPREHENSIVE_AGENT_DEFAULTS = {
  MODEL: 'claude-sonnet-4-5-20250929',
  MAX_ITERATIONS: 10,
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.3,
} as const;

/**
 * Scoring weights for 4-dimension evaluation
 */
export const DIMENSION_WEIGHTS = {
  codeQuality: 0.40, // 40%
  problemSolving: 0.25, // 25%
  aiCollaboration: 0.20, // 20%
  communication: 0.15, // 15%
} as const;

/**
 * Queue job data for background processing
 */
export interface ComprehensiveEvaluationJobData {
  sessionId: string;
  candidateId: string;
  triggeredAt: string;
  priority?: 'high' | 'normal' | 'low';
  retryCount?: number;
  // Backend assignment for A/B testing
  backend?: 'claude-sdk' | 'langgraph';
  experimentId?: string;
}

/**
 * Queue names for evaluation processing
 */
export const COMPREHENSIVE_EVALUATION_QUEUE = 'comprehensive-evaluation' as const;

/**
 * Creates default empty comprehensive evaluation result
 */
export function createDefaultComprehensiveResult(
  sessionId: string,
  candidateId: string
): Omit<ComprehensiveEvaluationResult, 'metadata' | 'actionableReport'> {
  const emptyDimension: ComprehensiveDimensionScore = {
    score: 0,
    confidence: 0,
    evidence: [],
    breakdown: null,
  };

  return {
    sessionId,
    candidateId,
    codeQuality: { ...emptyDimension },
    problemSolving: { ...emptyDimension },
    aiCollaboration: { ...emptyDimension },
    communication: { ...emptyDimension },
    overallScore: 0,
    overallConfidence: 0,
    hiringRecommendation: {
      decision: 'no-hire',
      confidence: 0,
      reasoning: [],
      aiFactorInfluence: 'neutral',
    },
    confidenceMetrics: {
      overall: 0,
      dataQuality: 0,
      sampleSize: 0,
      consistency: 0,
      explanation: '',
      warnings: [],
    },
    biasFlags: [],
    evaluatedAt: new Date(),
    model: COMPREHENSIVE_AGENT_DEFAULTS.MODEL,
    evaluationTimeMs: 0,
    toolCallCount: 0,
  };
}

/**
 * Calculate overall score from dimension scores
 */
export function calculateOverallScore(
  dimensions: {
    codeQuality: ComprehensiveDimensionScore;
    problemSolving: ComprehensiveDimensionScore;
    aiCollaboration: ComprehensiveDimensionScore;
    communication: ComprehensiveDimensionScore;
  }
): number {
  return (
    dimensions.codeQuality.score * DIMENSION_WEIGHTS.codeQuality +
    dimensions.problemSolving.score * DIMENSION_WEIGHTS.problemSolving +
    dimensions.aiCollaboration.score * DIMENSION_WEIGHTS.aiCollaboration +
    dimensions.communication.score * DIMENSION_WEIGHTS.communication
  );
}

/**
 * Calculate overall confidence from dimension confidences
 */
export function calculateOverallConfidence(
  dimensions: {
    codeQuality: ComprehensiveDimensionScore;
    problemSolving: ComprehensiveDimensionScore;
    aiCollaboration: ComprehensiveDimensionScore;
    communication: ComprehensiveDimensionScore;
  }
): number {
  return (
    dimensions.codeQuality.confidence * DIMENSION_WEIGHTS.codeQuality +
    dimensions.problemSolving.confidence * DIMENSION_WEIGHTS.problemSolving +
    dimensions.aiCollaboration.confidence * DIMENSION_WEIGHTS.aiCollaboration +
    dimensions.communication.confidence * DIMENSION_WEIGHTS.communication
  );
}

// =====================================================
// EVIDENCE MARKER TYPES
// For Sentry-like session replay with clickable evidence
// =====================================================

/**
 * Evaluation dimension names
 */
export type EvaluationDimension = 'codeQuality' | 'problemSolving' | 'aiCollaboration' | 'communication';

/**
 * Evidence marker for timeline display
 * Represents a link between evaluation evidence and a timeline event
 */
export interface EvidenceMarker {
  id: string;               // EvidenceEventLink.id
  eventId: string;          // SessionEventLog.id
  sequenceNumber: number;   // For timeline positioning
  timestamp: Date;          // Event timestamp
  dimension: EvaluationDimension;
  evidenceIndex: number;    // Index in the evidence array
  evidenceType: ComprehensiveEvidence['type'];
  description: string;
  importance: 'critical' | 'important' | 'normal';
}

/**
 * Session summary with key moments
 * For AI-generated session activity summary
 */
export interface SessionSummary {
  overview: string;         // 2-3 sentence summary
  keyMoments: Array<{
    eventId: string;
    timestamp: Date;
    description: string;
    category: 'success' | 'struggle' | 'breakthrough' | 'error';
  }>;
  generatedAt: Date;
}
