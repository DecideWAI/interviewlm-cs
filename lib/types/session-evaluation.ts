/**
 * Session Evaluation Types
 *
 * Types for the Session Evaluation Agent that evaluates completed interview
 * sessions across 4 dimensions with evidence-based scoring.
 */

/**
 * Evidence supporting a score
 */
export interface Evidence {
  type: "code_snippet" | "test_result" | "ai_interaction" | "metric";
  description: string;
  timestamp?: string;
  codeSnippet?: string;
  filePath?: string;
  lineNumber?: number;
  value?: string | number;
}

/**
 * Score for a single evaluation dimension
 */
export interface DimensionScore {
  score: number; // 0-100
  confidence: number; // 0-1
  evidence: Evidence[];
  breakdown: Record<string, number> | null;
}

/**
 * Scoring weights for each dimension
 */
export const SCORING_WEIGHTS = {
  codeQuality: 0.4, // 40%
  problemSolving: 0.25, // 25%
  aiCollaboration: 0.2, // 20%
  communication: 0.15, // 15%
} as const;

/**
 * Complete evaluation result for a session
 */
export interface SessionEvaluationResult {
  sessionId: string;
  candidateId: string;

  // 4-dimension scores
  codeQuality: DimensionScore;
  problemSolving: DimensionScore;
  aiCollaboration: DimensionScore;
  communication: DimensionScore;

  // Overall score (weighted average)
  overallScore: number;
  overallConfidence: number;

  // Metadata
  evaluatedAt: string;
  model: string;
  biasFlags: string[];
}

/**
 * Code snapshot with timestamp and file contents
 */
export interface CodeSnapshot {
  timestamp: string;
  files: Record<string, string>;
}

/**
 * Test result from a test run
 */
export interface TestResult {
  timestamp?: string;
  passed: number;
  failed: number;
  total: number;
  coverage?: number;
  output?: string;
}

/**
 * AI chat interaction
 */
export interface AIInteraction {
  candidateMessage: string;
  assistantMessage?: string;
  timestamp?: string;
  toolsUsed?: string[];
}

/**
 * Terminal command execution
 */
export interface TerminalCommand {
  command: string;
  output?: string;
  exitCode?: number;
  timestamp?: string;
}

/**
 * Session data for evaluation
 */
export interface SessionData {
  sessionId: string;
  candidateId: string;
  codeSnapshots: CodeSnapshot[];
  testResults: TestResult[];
  claudeInteractions: AIInteraction[];
  terminalCommands?: TerminalCommand[];
  interviewMetrics?: {
    aiDependencyScore?: number;
    irtTheta?: number;
    strugglingIndicators?: import("@/lib/types/interview-agent").StrugglingIndicator[];
  };
}

/**
 * Configuration for the Session Evaluation Agent
 */
export interface SessionEvaluationConfig {
  sessionId: string;
  candidateId: string;
  scoringWeights?: typeof SCORING_WEIGHTS;
}

/**
 * API request for session evaluation
 */
export interface SessionEvaluationRequest {
  sessionId: string;
  candidateId: string;
  codeSnapshots?: CodeSnapshot[];
  testResults?: TestResult[];
  claudeInteractions?: AIInteraction[];
  terminalCommands?: TerminalCommand[];
}

/**
 * API response for session evaluation
 */
export interface SessionEvaluationResponse {
  success: boolean;
  result: SessionEvaluationResult;
}

/**
 * Creates a default empty dimension score
 */
export function createEmptyDimensionScore(): DimensionScore {
  return {
    score: 0,
    confidence: 0,
    evidence: [],
    breakdown: null,
  };
}

/**
 * Creates a default evaluation result
 */
export function createDefaultEvaluationResult(
  sessionId: string,
  candidateId: string
): SessionEvaluationResult {
  return {
    sessionId,
    candidateId,
    codeQuality: createEmptyDimensionScore(),
    problemSolving: createEmptyDimensionScore(),
    aiCollaboration: createEmptyDimensionScore(),
    communication: createEmptyDimensionScore(),
    overallScore: 0,
    overallConfidence: 0,
    evaluatedAt: new Date().toISOString(),
    model: "claude-sonnet-4-20250514",
    biasFlags: [],
  };
}
