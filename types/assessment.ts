/**
 * Assessment Configuration Types
 * Defines the data models for HR/HM assessment configuration
 */

export type Role =
  | "backend"
  | "frontend"
  | "fullstack"
  | "database"
  | "security"
  | "ml"
  | "custom";

export type SeniorityLevel =
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal";

export type AssessmentStatus =
  | "draft"
  | "active"
  | "completed"
  | "archived";

export type DifficultyLevel =
  | "easy"
  | "medium"
  | "hard";

export type PricingTier =
  | "payg"
  | "small"
  | "medium"
  | "large"
  | "enterprise";

/**
 * Question configuration for LLM-generated assessments
 */
export interface QuestionSeed {
  /** LLM instructions to customize question generation */
  instructions: string;
  /** Specific topics to focus on */
  topics?: string[];
  /** Difficulty distribution */
  difficultyDistribution?: {
    easy: number;
    medium: number;
    hard: number;
  };
  /** Example problems or context */
  examples?: string[];
}

/**
 * Assessment template configuration
 */
export interface AssessmentTemplate {
  id: string;
  name: string;
  role: Role;
  seniority: SeniorityLevel;
  description: string;
  /** Estimated completion time in minutes */
  estimatedDuration: number;
  /** Number of problems in template */
  problemCount: number;
  /** Pre-configured question seeds */
  questionSeeds: QuestionSeed[];
  /** Minimum tier required */
  minTier: PricingTier;
}

/**
 * Complete assessment configuration
 */
export interface AssessmentConfig {
  /** Basic information */
  id: string;
  title: string;
  description: string;

  /** Role and seniority */
  role: Role;
  customRoleName?: string; // For custom roles (Large Pack+)
  seniority: SeniorityLevel;

  /** Technology stack requirements with priority levels */
  techStackRequirements?: TechStackRequirements;

  /** Timing */
  duration: number; // in minutes
  createdAt: string;
  updatedAt: string;

  /** Question configuration */
  useTemplate: boolean;
  templateId?: string;
  customQuestionSeeds?: QuestionSeed[];

  /** Incremental/Adaptive assessment configuration */
  useIncremental?: boolean;
  incrementalConfig?: {
    domain: string;
    requiredTech: {
      languages: Array<{ name: string; priority: TechPriority; version?: string }>;
      frameworks: Array<{ name: string; priority: TechPriority; version?: string }>;
      databases: Array<{ name: string; priority: TechPriority; version?: string }>;
      tools?: Array<{ name: string; priority: TechPriority; version?: string }>;
    };
    baseProblem: {
      title: string;
      description: string;
      starterCode: string;
      estimatedTime: number;
    };
    progressionHints: {
      extensionTopics: string[];
      simplificationTopics: string[];
    };
  };

  /** AI configuration */
  aiAssistanceEnabled: boolean;
  aiMonitoringEnabled: boolean;

  /** Status and metadata */
  status: AssessmentStatus;
  createdBy: string;

  /** Tier-based features */
  tier: PricingTier;

  /** Statistics */
  candidates?: {
    total: number;
    completed: number;
  };
  completionRate?: number;
}

/**
 * Assessment wizard state
 */
export interface AssessmentWizardState {
  step: number;
  config: Partial<AssessmentConfig>;
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Role metadata
 */
export interface RoleMetadata {
  id: Role;
  name: string;
  description: string;
  icon: string;
  defaultDuration: number;
  availableInTiers: PricingTier[];
}

/**
 * Seniority level metadata
 */
export interface SeniorityMetadata {
  id: SeniorityLevel;
  name: string;
  description: string;
  experienceYears: string;
  defaultDuration: number;
  difficultyMix: {
    easy: number;
    medium: number;
    hard: number;
  };
}

/**
 * Tier-based feature limits
 */
export interface TierLimits {
  tier: PricingTier;
  maxCustomQuestions: number | "unlimited";
  maxTeamMembers: number | "unlimited";
  customRolesAllowed: boolean;
  customInstructionsAllowed: boolean;
  advancedAnalytics: boolean;
  previewTestRuns: number | "unlimited";
}

/**
 * Technology Stack Priority System
 */

/** Technology priority levels */
export type TechPriority = "critical" | "required" | "recommended" | "optional";

/** Technology category */
export type TechCategory = "language" | "framework" | "database" | "tool" | "testing";

/** Individual technology specification */
export interface Technology {
  id: string;
  name: string;
  category: TechCategory;

  /** Display metadata */
  icon?: string;
  description?: string;
  color?: string; // For badge display

  /** Version requirement (optional) */
  version?: string; // e.g., ">=3.10", "^0.104.0"

  /** Detection patterns for validation */
  detectionPatterns?: {
    fileExtensions?: string[]; // [".py", ".pyi"]
    importPatterns?: string[]; // ["from fastapi import", "import fastapi"]
    contentPatterns?: RegExp[]; // Content regex patterns
  };

  /** Common pairings (for smart suggestions) */
  commonlyPairedWith?: string[]; // Other tech IDs
}

/** Technology stack requirements organized by priority */
export interface TechStackRequirements {
  /** Critical technologies (must use, immediate block if violated) */
  critical: Technology[];

  /** Required technologies (must be present in final solution) */
  required: Technology[];

  /** Recommended technologies (soft warning if missing) */
  recommended: Technology[];

  /** Optional technologies (tracked for bonus points) */
  optional: Technology[];
}

/** Real-time tech detection result */
export interface DetectedTech {
  tech: Technology;
  priority: TechPriority;
  confidence: number; // 0-1
  locations: CodeLocation[];
}

/** Code location reference */
export interface CodeLocation {
  filePath: string;
  line?: number;
  snippet?: string;
}

/** Technology violation */
export interface TechViolation {
  tech: Technology;
  priority: TechPriority;
  message: string;
  blocking: boolean; // If true, prevents continuation/submission
  suggestions?: string[];
  detectedAlternative?: Technology; // What was detected instead
}

/** Complete tech stack validation result */
export interface TechValidationResult {
  /** Can continue/submit? */
  valid: boolean;

  /** All detected technologies */
  detected: DetectedTech[];

  /** Missing or incorrect technologies */
  violations: TechViolation[];

  /** Technologies correctly used */
  satisfied: Technology[];

  /** Actionable suggestions */
  suggestions: string[];

  /** Timestamp of validation */
  timestamp: string;
}

/**
 * Evaluation with Technology Breakdown
 */

/** Technology-specific score */
export interface TechnologyScore {
  /** Technology ID */
  technologyId: string;

  /** Technology name */
  technologyName: string;

  /** Category */
  category: TechCategory;

  /** Priority level */
  priority: TechPriority;

  /** Overall score for this technology (0-100) */
  score: number;

  /** Letter grade */
  grade: "A" | "B" | "C" | "D" | "F";

  /** Breakdown of scoring components */
  breakdown: {
    codeQuality?: number;        // Idiomatic usage, best practices
    apiUsage?: number;           // Correct API/framework usage
    testCoverage?: number;       // Tests related to this tech
    performance?: number;        // Performance considerations
    security?: number;           // Security best practices
    aiInteraction?: number;      // Quality of AI prompts about this tech
  };

  /** Identified strengths */
  strengths: string[];

  /** Areas for improvement */
  weaknesses: string[];

  /** Code examples (for detailed review) */
  examples?: {
    type: "strength" | "weakness";
    description: string;
    location: CodeLocation;
  }[];
}

/** AI interaction analysis per technology */
export interface AITechInteraction {
  /** Technology ID */
  technologyId: string;

  /** Number of prompts related to this tech */
  promptCount: number;

  /** Average prompt quality (0-10) */
  avgPromptQuality: number;

  /** Average iterations to solve tech-specific issues */
  avgIterations: number;

  /** Common prompt patterns/topics */
  promptPatterns: string[];

  /** Example prompts */
  examplePrompts?: {
    prompt: string;
    quality: number;
    timestamp: string;
  }[];
}

/** Complete candidate evaluation */
export interface CandidateEvaluation {
  /** Candidate info */
  candidateId: string;
  assessmentId: string;

  /** Overall score */
  overallScore: number;
  overallGrade: "A" | "B" | "C" | "D" | "F";

  /** Technology-specific scores */
  technologyScores: TechnologyScore[];

  /** AI interaction analysis per technology */
  aiInteractionByTech: Record<string, AITechInteraction>;

  /** Weighted score breakdown */
  scoreBreakdown: {
    criticalWeight: number;    // e.g., 0.40
    criticalScore: number;     // Weighted score from critical tech
    requiredWeight: number;    // e.g., 0.35
    requiredScore: number;     // Weighted score from required tech
    recommendedWeight: number; // e.g., 0.20
    recommendedScore: number;  // Weighted score from recommended tech
    optionalWeight: number;    // e.g., 0.05
    optionalScore: number;     // Weighted score from optional tech (bonus)
    penalties: number;         // Penalties for missing tech
  };

  /** Summary and recommendations */
  summary: string;
  strengths: string[];
  areasForImprovement: string[];

  /** Timestamps */
  evaluatedAt: string;
}
