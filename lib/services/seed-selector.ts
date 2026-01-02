/**
 * Seed Selector Service
 *
 * Handles the selection of default problem seeds based on:
 * - Role (backend, frontend, fullstack)
 * - Seniority (junior, mid, senior, staff, principal)
 * - Assessment Type (REAL_WORLD, SYSTEM_DESIGN)
 *
 * Implements a fallback strategy when exact matches are not found.
 */

import prisma from '@/lib/prisma';
import type { ProblemSeed, AssessmentType } from '@prisma/client';

export interface SeedSelectionCriteria {
  role: string;
  seniority: string;
  assessmentType: AssessmentType;
  organizationId: string;
  preferCustomSeed?: boolean;
}

export interface SeedSelectionResult {
  seed: ProblemSeed;
  isCustom: boolean;
  isDefault: boolean;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

/**
 * Order of seniorities for fallback logic
 * When exact match not found, we try adjacent seniorities
 */
const SENIORITY_ORDER = ['junior', 'mid', 'senior', 'staff', 'principal'];

/**
 * SeedSelector class handles intelligent seed selection with fallback
 */
export class SeedSelector {
  /**
   * Select the most appropriate seed for the given criteria
   *
   * Priority:
   * 1. Organization's custom seed (if preferCustomSeed)
   * 2. Exact match default seed
   * 3. Fallback: adjacent seniority
   * 4. Final fallback: any seed of same type
   */
  async selectSeed(criteria: SeedSelectionCriteria): Promise<SeedSelectionResult> {
    // 1. Try organization's custom seed first (if preferCustomSeed)
    if (criteria.preferCustomSeed) {
      const customSeed = await this.findOrgCustomSeed(criteria);
      if (customSeed) {
        return {
          seed: customSeed,
          isCustom: true,
          isDefault: false,
          fallbackUsed: false,
        };
      }
    }

    // 2. Look for exact match default seed
    const exactMatch = await this.findDefaultSeed(criteria);
    if (exactMatch) {
      return {
        seed: exactMatch,
        isCustom: false,
        isDefault: true,
        fallbackUsed: false,
      };
    }

    // 3. Fallback: adjacent seniority
    const fallbackResult = await this.findFallbackSeed(criteria);
    if (fallbackResult.seed) {
      return {
        seed: fallbackResult.seed,
        isCustom: false,
        isDefault: true,
        fallbackUsed: true,
        fallbackReason: fallbackResult.reason,
      };
    }

    // 4. Final fallback: any seed of same type
    const anySeed = await this.findAnySeedOfType(criteria);
    if (anySeed) {
      return {
        seed: anySeed,
        isCustom: false,
        isDefault: false,
        fallbackUsed: true,
        fallbackReason: `No exact match found, using ${anySeed.targetSeniority || 'generic'} seed`,
      };
    }

    throw new Error(
      `No seed found for role=${criteria.role}, seniority=${criteria.seniority}, type=${criteria.assessmentType}`
    );
  }

  /**
   * Find organization's custom seed for this combination
   */
  private async findOrgCustomSeed(
    criteria: SeedSelectionCriteria
  ): Promise<ProblemSeed | null> {
    return prisma.problemSeed.findFirst({
      where: {
        organizationId: criteria.organizationId,
        targetRole: criteria.role,
        targetSeniority: criteria.seniority,
        assessmentType: criteria.assessmentType,
        isSystemSeed: false,
        isDefaultSeed: false,
        status: 'active',
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  /**
   * Find exact match default seed (system seed)
   */
  private async findDefaultSeed(
    criteria: SeedSelectionCriteria
  ): Promise<ProblemSeed | null> {
    return prisma.problemSeed.findFirst({
      where: {
        targetRole: criteria.role,
        targetSeniority: criteria.seniority,
        assessmentType: criteria.assessmentType,
        isDefaultSeed: true,
        isSystemSeed: true,
        status: 'active',
      },
    });
  }

  /**
   * Find fallback seed from adjacent seniority levels
   * Prefers lower seniority (safer for candidate experience)
   */
  private async findFallbackSeed(
    criteria: SeedSelectionCriteria
  ): Promise<{ seed: ProblemSeed | null; reason: string }> {
    const currentIndex = SENIORITY_ORDER.indexOf(criteria.seniority.toLowerCase());

    if (currentIndex === -1) {
      return { seed: null, reason: '' };
    }

    // Try adjacent seniorities (prefer lower for safety)
    const adjacentSeniorities: string[] = [];

    // Try one level lower first (safer)
    if (currentIndex > 0) {
      adjacentSeniorities.push(SENIORITY_ORDER[currentIndex - 1]);
    }
    // Then try one level higher
    if (currentIndex < SENIORITY_ORDER.length - 1) {
      adjacentSeniorities.push(SENIORITY_ORDER[currentIndex + 1]);
    }

    for (const seniority of adjacentSeniorities) {
      const seed = await prisma.problemSeed.findFirst({
        where: {
          targetRole: criteria.role,
          targetSeniority: seniority,
          assessmentType: criteria.assessmentType,
          isDefaultSeed: true,
          isSystemSeed: true,
          status: 'active',
        },
      });

      if (seed) {
        return {
          seed,
          reason: `Using ${seniority} seed as fallback for ${criteria.seniority}`,
        };
      }
    }

    return { seed: null, reason: '' };
  }

  /**
   * Final fallback: any seed of the same assessment type
   */
  private async findAnySeedOfType(
    criteria: SeedSelectionCriteria
  ): Promise<ProblemSeed | null> {
    return prisma.problemSeed.findFirst({
      where: {
        assessmentType: criteria.assessmentType,
        status: 'active',
        OR: [
          { isSystemSeed: true },
          { organizationId: criteria.organizationId },
        ],
      },
      orderBy: [
        { isDefaultSeed: 'desc' },
        { usageCount: 'desc' },
      ],
    });
  }

  /**
   * Get all available seeds for a given criteria
   * Useful for seed selection UI
   */
  async getAvailableSeeds(criteria: Partial<SeedSelectionCriteria>): Promise<ProblemSeed[]> {
    return prisma.problemSeed.findMany({
      where: {
        targetRole: criteria.role || undefined,
        targetSeniority: criteria.seniority || undefined,
        assessmentType: criteria.assessmentType || undefined,
        status: 'active',
        OR: criteria.organizationId
          ? [
              { isSystemSeed: true },
              { organizationId: criteria.organizationId },
            ]
          : [{ isSystemSeed: true }],
      },
      orderBy: [
        { isDefaultSeed: 'desc' },
        { isSystemSeed: 'desc' },
        { usageCount: 'desc' },
      ],
    });
  }

  /**
   * Get the default seed for a specific combination
   * Returns null if no default exists
   */
  async getDefaultSeed(
    role: string,
    seniority: string,
    assessmentType: AssessmentType
  ): Promise<ProblemSeed | null> {
    return prisma.problemSeed.findFirst({
      where: {
        targetRole: role,
        targetSeniority: seniority,
        assessmentType: assessmentType,
        isDefaultSeed: true,
        isSystemSeed: true,
        status: 'active',
      },
    });
  }

  /**
   * Check if a default seed exists for a combination
   */
  async hasDefaultSeed(
    role: string,
    seniority: string,
    assessmentType: AssessmentType
  ): Promise<boolean> {
    const count = await prisma.problemSeed.count({
      where: {
        targetRole: role,
        targetSeniority: seniority,
        assessmentType: assessmentType,
        isDefaultSeed: true,
        isSystemSeed: true,
        status: 'active',
      },
    });
    return count > 0;
  }

  /**
   * Get coverage report for default seeds
   * Shows which role/seniority/type combinations have default seeds
   */
  async getDefaultSeedCoverage(): Promise<{
    coverage: Array<{
      role: string;
      seniority: string;
      assessmentType: string;
      hasDefault: boolean;
    }>;
    totalCombinations: number;
    coveredCombinations: number;
    coveragePercentage: number;
  }> {
    const roles = ['backend', 'frontend', 'fullstack'];
    const assessmentTypes: AssessmentType[] = ['REAL_WORLD', 'SYSTEM_DESIGN'];
    const coverage: Array<{
      role: string;
      seniority: string;
      assessmentType: string;
      hasDefault: boolean;
    }> = [];

    for (const role of roles) {
      for (const seniority of SENIORITY_ORDER) {
        for (const type of assessmentTypes) {
          const hasDefault = await this.hasDefaultSeed(role, seniority, type);
          coverage.push({
            role,
            seniority,
            assessmentType: type,
            hasDefault,
          });
        }
      }
    }

    const totalCombinations = coverage.length;
    const coveredCombinations = coverage.filter((c) => c.hasDefault).length;

    return {
      coverage,
      totalCombinations,
      coveredCombinations,
      coveragePercentage: Math.round((coveredCombinations / totalCombinations) * 100),
    };
  }
}

// Export singleton instance
export const seedSelector = new SeedSelector();
