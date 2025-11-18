/**
 * Problem Seed Types
 *
 * Type definitions for problem seeds used in the question library.
 */

import { Role, SeniorityLevel } from './assessment';

export type SeedStatus = 'active' | 'draft' | 'archived';
export type SeedType = 'legacy' | 'incremental';

/**
 * Required technology stack for incremental assessments
 */
export interface RequiredTechStack {
  languages: string[]; // e.g., ["python", "typescript"]
  frameworks: string[]; // e.g., ["fastapi", "react"]
  databases: string[]; // e.g., ["mongodb", "redis", "postgresql"]
  tools?: string[]; // e.g., ["docker", "pytest"]
}

/**
 * Base problem that starts the incremental assessment
 */
export interface BaseProblem {
  title: string;
  description: string;
  starterCode: string;
  estimatedTime: number; // minutes
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
