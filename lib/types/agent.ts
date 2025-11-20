/**
 * Agent Types
 *
 * Type definitions for the three specialized agents in InterviewLM:
 * - Coding Agent: Helps candidates with coding tasks
 * - Interview Agent: Observes and adapts interview difficulty
 * - Evaluation Agent: Scores completed interviews
 */

/**
 * Claude model identifiers
 */
export type ClaudeModel =
  | 'claude-sonnet-4-5-20250929'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-1-20250805';

/**
 * Agent tool names
 * Tools available to different agents
 */
export type AgentTool =
  // File operations (Coding Agent)
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Grep'
  | 'Glob'
  | 'Bash'
  | 'run_tests'

  // Monitoring tools (Interview Agent)
  | 'ObserveProgress'
  | 'TrackMetrics'
  | 'AdjustDifficulty'
  | 'GenerateQuestion'

  // Analysis tools (Evaluation Agent)
  | 'AnalyzeCode'
  | 'ScorePromptQuality'
  | 'DetectPatterns'
  | 'CalculateMetrics'
  | 'DetectBias'
  | 'GenerateReport';

/**
 * Helpfulness levels for Coding Agent
 * Controls which tools are available to the agent
 */
export type HelpfulnessLevel = 'consultant' | 'pair-programming' | 'full-copilot';

/**
 * Helpfulness level configurations
 */
export interface HelpfulnessConfig {
  level: HelpfulnessLevel;
  allowedTools: AgentTool[];
  description: string;
  useCase: string;
}

/**
 * Predefined helpfulness configurations
 */
export const HELPFULNESS_CONFIGS: Record<HelpfulnessLevel, HelpfulnessConfig> = {
  consultant: {
    level: 'consultant',
    allowedTools: ['Read', 'Grep', 'Glob', 'run_tests'],
    description: 'Read-only assistance, suggestions only',
    useCase: 'Senior roles - evaluate independence',
  },

  'pair-programming': {
    level: 'pair-programming',
    allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'run_tests'],
    description: 'Full coding assistance with limited bash',
    useCase: 'Default - realistic AI collaboration',
  },

  'full-copilot': {
    level: 'full-copilot',
    allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'run_tests'],
    description: 'Maximum autonomy',
    useCase: 'Junior roles - evaluate delegation skills',
  },
};

/**
 * Permission configuration for agents
 */
export interface PermissionConfig {
  mode?: 'auto' | 'ask' | 'deny';
  allowedTools?: AgentTool[];
  disallowedTools?: AgentTool[];
  canUseTool?: (toolName: string, toolInput: unknown) => Promise<boolean> | boolean;
}

/**
 * Agent configuration
 * Common configuration interface for all agents
 */
export interface AgentConfig {
  model: ClaudeModel;
  tools: AgentTool[];
  permissions: PermissionConfig;
  sessionId: string;
  systemPrompt?: string;
}

/**
 * Coding Agent specific configuration
 */
export interface CodingAgentConfig extends AgentConfig {
  helpfulnessLevel: HelpfulnessLevel;
  workspaceRoot: string;
  problemStatement?: string;
  candidateId?: string; // Required for test execution
}

/**
 * Interview Agent specific configuration
 */
export interface InterviewAgentConfig extends AgentConfig {
  questionSeed: string;
  currentDifficulty: number;
  irtTheta: number; // Item Response Theory ability estimate
}

/**
 * Evaluation Agent specific configuration
 */
export interface EvaluationAgentConfig extends AgentConfig {
  sessionRecording: SessionRecording;
  scoringWeights?: ScoringWeights;
}

/**
 * Session recording data structure
 * Complete data from an interview session
 */
export interface SessionRecording {
  sessionId: string;
  candidateId: string;
  questionId: string;
  startTime: Date;
  endTime: Date;
  duration: number; // seconds

  // Code snapshots with timestamps
  codeSnapshots: CodeSnapshot[];

  // AI interactions
  claudeInteractions: AIInteraction[];

  // Test execution results
  testResults: TestResult[];

  // Terminal commands
  terminalCommands: TerminalCommand[];

  // Question metadata
  questionDifficulty: number;
  questionTopic: string;
}

/**
 * Code snapshot at a specific point in time
 */
export interface CodeSnapshot {
  timestamp: Date;
  files: Record<string, string>; // filename -> content
  trigger: 'manual' | 'test-run' | 'ai-interaction' | 'periodic';
}

/**
 * AI interaction (candidate <-> Coding Agent)
 */
export interface AIInteraction {
  timestamp: Date;
  candidateMessage: string;
  aiResponse: string;
  toolsUsed: AgentTool[];
  filesModified: string[];
  promptQuality?: number; // 0-100, set by Evaluation Agent
}

/**
 * Test execution result
 */
export interface TestResult {
  timestamp: Date;
  passed: number;
  failed: number;
  total: number;
  coverage?: number; // percentage
  output: string;
}

/**
 * Terminal command execution
 */
export interface TerminalCommand {
  timestamp: Date;
  command: string;
  output: string;
  exitCode: number;
}

/**
 * Scoring weights for evaluation
 */
export interface ScoringWeights {
  codeQuality: number; // Default: 0.4
  problemSolving: number; // Default: 0.25
  aiCollaboration: number; // Default: 0.2
  communication: number; // Default: 0.15
}

/**
 * Default scoring weights (must sum to 1.0)
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  codeQuality: 0.4,
  problemSolving: 0.25,
  aiCollaboration: 0.2,
  communication: 0.15,
};

/**
 * Agent response
 * Generic response structure from any agent
 */
export interface AgentResponse {
  text: string;
  toolsUsed?: AgentTool[];
  filesModified?: string[];
  metadata?: Record<string, unknown>;
}
