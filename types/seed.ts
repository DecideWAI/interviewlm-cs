/**
 * Problem Seed Types
 *
 * Type definitions for problem seeds used in the question library.
 */

import { Role, SeniorityLevel } from './assessment';

export type SeedStatus = 'active' | 'draft' | 'archived';

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
