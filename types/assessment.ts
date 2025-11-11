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
  techStack?: string[]; // Technologies/languages

  /** Timing */
  duration: number; // in minutes
  createdAt: string;
  updatedAt: string;

  /** Question configuration */
  useTemplate: boolean;
  templateId?: string;
  customQuestionSeeds?: QuestionSeed[];

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
