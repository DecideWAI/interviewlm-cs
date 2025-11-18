/**
 * Problem Seed Types
 *
 * Type definitions for problem seeds used in the question library.
 */

import { Role, SeniorityLevel } from './assessment';

export type SeedStatus = 'active' | 'draft' | 'archived';
export type SeedType = 'legacy' | 'incremental';

/**
 * Tech priority levels for enforcement
 * - critical: MUST use or assessment fails
 * - required: Should use, flagged in evaluation but not blocking
 * - recommended: Optional, bonus points if used
 */
export type TechPriority = 'critical' | 'required' | 'recommended';

/**
 * Technology specification with priority
 */
export interface TechSpec {
  name: string;
  priority: TechPriority;
  version?: string; // e.g., ">=3.10", "^18.0.0"
}

/**
 * Required technology stack for incremental assessments
 */
export interface RequiredTechStack {
  languages: TechSpec[]; // e.g., [{ name: "python", priority: "critical", version: ">=3.10" }]
  frameworks: TechSpec[]; // e.g., [{ name: "fastapi", priority: "critical" }]
  databases: TechSpec[]; // e.g., [{ name: "mongodb", priority: "required" }]
  tools?: TechSpec[]; // e.g., [{ name: "docker", priority: "recommended" }]
}

/**
 * Question count configuration for progressive difficulty
 */
export interface QuestionCountConfig {
  minQuestions: number; // Minimum questions (default: 2)
  maxQuestions: number; // Maximum questions (default: 5)
  targetAverage: number; // Target average (default: 3)
}

/**
 * Base problem that starts the incremental assessment
 * Should be substantial (20-30 minutes)
 */
export interface BaseProblem {
  title: string;
  description: string;
  starterCode: string;
  estimatedTime: number; // minutes (recommended: 20-30 for substantial problems)
}

/**
 * Progressive scoring configuration
 * Later questions weighted more heavily to reward expertise growth
 */
export interface ProgressiveScoringConfig {
  questionWeights: number[]; // e.g., [1.0, 1.2, 1.5, 2.0, 2.5] - multipliers per question
  expertiseThreshold: number; // Score needed to advance (0-1, default: 0.7)
}

/**
 * LLM-generated difficulty assessment metadata
 * Ensures consistent scoring across dynamically generated questions
 */
export interface DifficultyAssessment {
  difficultyScore: number; // 1-10 scale (1=trivial, 10=extremely complex)
  complexityFactors: {
    linesOfCodeExpected: number; // Estimated lines of code
    conceptsRequired: string[]; // Key concepts tested
    techStackComplexity: number; // 1-5, based on number and complexity of tech
    timeEstimate: number; // Minutes expected
    prerequisiteKnowledge: string[]; // What candidate should know
  };
  justification: string; // LLM explains why this difficulty rating
  relativeToBaseline: number; // Comparison to Q1 baseline (0.5=half as hard, 2.0=twice as hard)
}

/**
 * Enhanced question generation response with difficulty metadata
 */
export interface QuestionGenerationResponse {
  title: string;
  description: string;
  requirements: string[];
  estimatedTime: number;
  starterCode: Array<{
    fileName: string;
    content: string;
    language: string;
  }>;
  testCases: Array<{
    name: string;
    input: any;
    expectedOutput: any;
    hidden: boolean;
    description: string;
  }>;
  difficultyAssessment: DifficultyAssessment;
}

/**
 * Progression strategy for adaptive question generation
 */
export interface ProgressionHints {
  extensionTopics: string[]; // Topics to explore if candidate does well
  simplificationTopics: string[]; // Topics to fall back to if struggling
}

/**
 * Seniority-specific expectations
 */
export interface SeniorityExpectations {
  junior?: string[];
  mid?: string[];
  senior?: string[];
  staff?: string[];
  principal?: string[];
}

/**
 * Enhanced Problem Seed with usage metadata
 * Extends the database ProblemSeed model with computed fields
 */
export interface EnhancedProblemSeed {
  id: string;
  title: string;
  description: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  category: string;
  tags: string[];
  topics: string[];
  starterCode: string | null;
  testCode: string | null;
  language: string;
  instructions: string | null;
  estimatedTime: number;
  status: SeedStatus;

  // Usage analytics
  usageCount: number;
  avgCandidateScore: number | null;

  // Metadata
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;

  // Seed cloning
  parentSeedId: string | null;
  isSystemSeed: boolean;

  // NEW: Incremental assessment fields
  seedType: SeedType;
  domain?: string | null;
  requiredTech?: RequiredTechStack | null;
  baseProblem?: BaseProblem | null;
  progressionHints?: ProgressionHints | null;
  seniorityExpectations?: SeniorityExpectations | null;

  // Additional computed fields
  role?: Role | 'any';
  seniority?: SeniorityLevel | 'any';
}

/**
 * Seed filters for the problem library
 */
export interface SeedFilters {
  role?: Role | 'any';
  seniority?: SeniorityLevel | 'any';
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'any';
  category?: string;
  status?: SeedStatus;
  tags?: string[];
  searchQuery?: string;
  isSystemSeed?: boolean;
}

/**
 * Seed creation/update payload
 */
export interface SeedFormData {
  title: string;
  description: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  category: string;
  tags: string[];
  topics: string[];
  starterCode?: string;
  testCode?: string;
  language: string;
  instructions?: string;
  estimatedTime: number;
  status?: SeedStatus;
}

/**
 * Seed statistics
 */
export interface SeedStatistics {
  totalUsage: number;
  avgScore: number | null;
  successRate: number | null;
  lastUsed: string | null;
  popularityRank: number;
}
