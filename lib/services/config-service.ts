/**
 * Config Service
 *
 * Centralized configuration service that reads from database with
 * support for organization-level overrides and caching.
 *
 * Supports three override policies:
 * - SYSTEM_ONLY: No org overrides allowed (security configs)
 * - BOUNDED: Org overrides within min/max constraints (rate limits)
 * - FULLY_CUSTOMIZABLE: Full org control (roles, tech catalog)
 */

import prisma from "@/lib/prisma";
import { cache } from "react";
import type { Prisma, ModelConfig, SandboxConfig, RoleConfig, SeniorityConfig, TierConfig, AssessmentTemplateConfig, Technology } from "@prisma/client";

// =============================================================================
// SECURITY CONFIG (SYSTEM_ONLY)
// =============================================================================

/**
 * Get security configuration (no org overrides).
 */
export const getSecurityConfig = cache(async <T = unknown>(
  configType: string
): Promise<T | null> => {
  try {
    const config = await prisma.securityConfig.findUnique({
      where: { configType },
    });
    return config?.value as T ?? null;
  } catch (error) {
    console.error(`Failed to get security config '${configType}':`, error);
    return null;
  }
});

/**
 * Get blocked bash command patterns.
 */
export const getBlockedPatterns = cache(async (): Promise<string[]> => {
  const patterns = await getSecurityConfig<string[]>("blocked_patterns");
  return patterns ?? [];
});

/**
 * Get allowed bash commands.
 */
export const getAllowedCommands = cache(async (): Promise<string[]> => {
  const commands = await getSecurityConfig<string[]>("allowed_commands");
  return commands ?? [];
});

/**
 * Get rate limit configuration.
 */
export const getRateLimits = cache(async (): Promise<Record<string, number>> => {
  const limits = await getSecurityConfig<Record<string, number>>("rate_limits");
  return limits ?? {};
});

/**
 * Get session timeout configuration.
 */
export const getSessionTimeouts = cache(async (): Promise<Record<string, number>> => {
  const timeouts = await getSecurityConfig<Record<string, number>>("session_timeouts");
  return timeouts ?? {};
});

// =============================================================================
// MODEL CONFIG
// =============================================================================

export interface ModelConfigData {
  modelId: string;
  name: string;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
  maxTokens: number;
  contextWindow: number;
  description?: string | null;
  useCase?: string | null;
  recommendedFor: string[];
}

/**
 * Get AI model configuration by ID.
 */
export const getModelConfig = cache(async (
  modelId: string
): Promise<ModelConfigData | null> => {
  try {
    const config = await prisma.modelConfig.findUnique({
      where: { modelId, isActive: true },
    });

    if (!config) return null;

    return {
      modelId: config.modelId,
      name: config.name,
      inputPricePerMToken: config.inputPricePerMToken,
      outputPricePerMToken: config.outputPricePerMToken,
      maxTokens: config.maxTokens,
      contextWindow: config.contextWindow,
      description: config.description,
      useCase: config.useCase,
      recommendedFor: config.recommendedFor,
    };
  } catch (error) {
    console.error(`Failed to get model config '${modelId}':`, error);
    return null;
  }
});

/**
 * Get all active model configurations.
 */
export const getAllModelConfigs = cache(async (): Promise<ModelConfigData[]> => {
  try {
    const configs = await prisma.modelConfig.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return configs.map((c: ModelConfig) => ({
      modelId: c.modelId,
      name: c.name,
      inputPricePerMToken: c.inputPricePerMToken,
      outputPricePerMToken: c.outputPricePerMToken,
      maxTokens: c.maxTokens,
      contextWindow: c.contextWindow,
      description: c.description,
      useCase: c.useCase,
      recommendedFor: c.recommendedFor,
    }));
  } catch (error) {
    console.error("Failed to get all model configs:", error);
    return [];
  }
});

/**
 * Get recommended model for an agent type.
 */
export const getRecommendedModel = cache(async (
  agentType: string
): Promise<ModelConfigData | null> => {
  try {
    const config = await prisma.modelConfig.findFirst({
      where: {
        isActive: true,
        recommendedFor: { has: agentType },
      },
    });

    if (!config) return null;

    return {
      modelId: config.modelId,
      name: config.name,
      inputPricePerMToken: config.inputPricePerMToken,
      outputPricePerMToken: config.outputPricePerMToken,
      maxTokens: config.maxTokens,
      contextWindow: config.contextWindow,
      description: config.description,
      useCase: config.useCase,
      recommendedFor: config.recommendedFor,
    };
  } catch (error) {
    console.error(`Failed to get recommended model for '${agentType}':`, error);
    return null;
  }
});

// =============================================================================
// SANDBOX CONFIG
// =============================================================================

export interface SandboxConfigData {
  language: string;
  dockerImage: string;
  cpu: number;
  memoryMb: number;
  timeoutSeconds: number;
}

/**
 * Get sandbox configuration for a language.
 * Falls back to 'default' if language-specific config not found.
 */
export const getSandboxConfig = cache(async (
  language: string
): Promise<SandboxConfigData | null> => {
  try {
    // Try language-specific first
    let config = await prisma.sandboxConfig.findUnique({
      where: { language, isActive: true },
    });

    // Fall back to default
    if (!config) {
      config = await prisma.sandboxConfig.findUnique({
        where: { language: "default", isActive: true },
      });
    }

    if (!config) return null;

    return {
      language: config.language,
      dockerImage: config.dockerImage,
      cpu: config.cpu,
      memoryMb: config.memoryMb,
      timeoutSeconds: config.timeoutSeconds,
    };
  } catch (error) {
    console.error(`Failed to get sandbox config for '${language}':`, error);
    return null;
  }
});

/**
 * Get language to Docker image mapping.
 */
export const getImageMap = cache(async (): Promise<Record<string, string>> => {
  try {
    const configs = await prisma.sandboxConfig.findMany({
      where: { isActive: true },
    });

    return Object.fromEntries(configs.map((c: SandboxConfig) => [c.language, c.dockerImage]));
  } catch (error) {
    console.error("Failed to get image map:", error);
    return {};
  }
});

// =============================================================================
// ROLE CONFIG (FULLY_CUSTOMIZABLE)
// =============================================================================

export interface RoleConfigData {
  roleId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  defaultDuration: number;
  availableInTiers: string[];
  status: string;
}

/**
 * Get role configurations.
 * Includes system roles + org-specific roles if organizationId provided.
 */
export const getRoleConfigs = cache(async (
  organizationId?: string
): Promise<RoleConfigData[]> => {
  try {
    const configs = await prisma.roleConfig.findMany({
      where: {
        OR: [
          { isSystem: true },
          ...(organizationId ? [{ organizationId }] : []),
        ],
      },
      orderBy: { name: "asc" },
    });

    return configs.map((c: RoleConfig) => ({
      roleId: c.roleId,
      name: c.name,
      description: c.description,
      icon: c.icon,
      defaultDuration: c.defaultDuration,
      availableInTiers: c.availableInTiers,
      status: c.status,
    }));
  } catch (error) {
    console.error("Failed to get role configs:", error);
    return [];
  }
});

/**
 * Get a specific role configuration.
 * Tries org-specific first, then falls back to system.
 */
export const getRoleConfig = cache(async (
  roleId: string,
  organizationId?: string
): Promise<RoleConfigData | null> => {
  try {
    // Try org-specific first
    if (organizationId) {
      const orgConfig = await prisma.roleConfig.findFirst({
        where: { roleId, organizationId },
      });
      if (orgConfig) {
        return {
          roleId: orgConfig.roleId,
          name: orgConfig.name,
          description: orgConfig.description,
          icon: orgConfig.icon,
          defaultDuration: orgConfig.defaultDuration,
          availableInTiers: orgConfig.availableInTiers,
          status: orgConfig.status,
        };
      }
    }

    // Fall back to system
    const systemConfig = await prisma.roleConfig.findFirst({
      where: { roleId, isSystem: true },
    });

    if (!systemConfig) return null;

    return {
      roleId: systemConfig.roleId,
      name: systemConfig.name,
      description: systemConfig.description,
      icon: systemConfig.icon,
      defaultDuration: systemConfig.defaultDuration,
      availableInTiers: systemConfig.availableInTiers,
      status: systemConfig.status,
    };
  } catch (error) {
    console.error(`Failed to get role config '${roleId}':`, error);
    return null;
  }
});

// =============================================================================
// SENIORITY CONFIG (FULLY_CUSTOMIZABLE)
// =============================================================================

export interface SeniorityConfigData {
  seniorityId: string;
  name: string;
  description?: string | null;
  experienceYears?: string | null;
  defaultDuration: number;
  difficultyMix: Record<string, number>;
  scoringWeights?: Record<string, number> | null;
}

/**
 * Get seniority configuration.
 * Tries org-specific first, then falls back to system.
 */
export const getSeniorityConfig = cache(async (
  seniorityId: string,
  organizationId?: string
): Promise<SeniorityConfigData | null> => {
  try {
    // Try org-specific first
    if (organizationId) {
      const orgConfig = await prisma.seniorityConfig.findFirst({
        where: { seniorityId, organizationId },
      });
      if (orgConfig) {
        return {
          seniorityId: orgConfig.seniorityId,
          name: orgConfig.name,
          description: orgConfig.description,
          experienceYears: orgConfig.experienceYears,
          defaultDuration: orgConfig.defaultDuration,
          difficultyMix: orgConfig.difficultyMix as Record<string, number>,
          scoringWeights: orgConfig.scoringWeights as Record<string, number> | null,
        };
      }
    }

    // Fall back to system
    const systemConfig = await prisma.seniorityConfig.findFirst({
      where: { seniorityId, isSystem: true },
    });

    if (!systemConfig) return null;

    return {
      seniorityId: systemConfig.seniorityId,
      name: systemConfig.name,
      description: systemConfig.description,
      experienceYears: systemConfig.experienceYears,
      defaultDuration: systemConfig.defaultDuration,
      difficultyMix: systemConfig.difficultyMix as Record<string, number>,
      scoringWeights: systemConfig.scoringWeights as Record<string, number> | null,
    };
  } catch (error) {
    console.error(`Failed to get seniority config '${seniorityId}':`, error);
    return null;
  }
});

/**
 * Get all seniority configurations.
 */
export const getAllSeniorityConfigs = cache(async (
  organizationId?: string
): Promise<SeniorityConfigData[]> => {
  try {
    const configs = await prisma.seniorityConfig.findMany({
      where: {
        OR: [
          { isSystem: true },
          ...(organizationId ? [{ organizationId }] : []),
        ],
      },
      orderBy: { seniorityId: "asc" },
    });

    return configs.map((c: SeniorityConfig) => ({
      seniorityId: c.seniorityId,
      name: c.name,
      description: c.description,
      experienceYears: c.experienceYears,
      defaultDuration: c.defaultDuration,
      difficultyMix: c.difficultyMix as Record<string, number>,
      scoringWeights: c.scoringWeights as Record<string, number> | null,
    }));
  } catch (error) {
    console.error("Failed to get seniority configs:", error);
    return [];
  }
});

/**
 * Get scoring weights for a seniority level.
 */
export const getScoringWeights = cache(async (
  seniorityId: string,
  organizationId?: string
): Promise<Record<string, number>> => {
  const config = await getSeniorityConfig(seniorityId, organizationId);
  return config?.scoringWeights ?? {};
});

// =============================================================================
// TECHNOLOGY (FULLY_CUSTOMIZABLE)
// =============================================================================

export interface TechnologyData {
  id: string;
  slug: string;
  name: string;
  category: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  fileExtensions: string[];
  importPatterns: string[];
  pairedWithIds: string[];
}

/**
 * Get technologies.
 * Includes system technologies + org-specific ones if organizationId provided.
 */
export const getTechnologies = cache(async (options: {
  category?: string;
  organizationId?: string;
} = {}): Promise<TechnologyData[]> => {
  try {
    const { category, organizationId } = options;

    const where: Prisma.TechnologyWhereInput = {
      isActive: true,
      ...(category && { category }),
      OR: [
        { isSystem: true },
        ...(organizationId ? [{ organizationId }] : []),
      ],
    };

    const technologies = await prisma.technology.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return technologies.map((t: Technology) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      category: t.category,
      description: t.description,
      color: t.color,
      icon: t.icon,
      fileExtensions: t.fileExtensions,
      importPatterns: t.importPatterns,
      pairedWithIds: t.pairedWithIds,
    }));
  } catch (error) {
    console.error("Failed to get technologies:", error);
    return [];
  }
});

/**
 * Get a specific technology by slug.
 */
export const getTechnology = cache(async (
  slug: string,
  organizationId?: string
): Promise<TechnologyData | null> => {
  try {
    // Try org-specific first
    if (organizationId) {
      const orgTech = await prisma.technology.findFirst({
        where: { slug, organizationId, isActive: true },
      });
      if (orgTech) {
        return {
          id: orgTech.id,
          slug: orgTech.slug,
          name: orgTech.name,
          category: orgTech.category,
          description: orgTech.description,
          color: orgTech.color,
          icon: orgTech.icon,
          fileExtensions: orgTech.fileExtensions,
          importPatterns: orgTech.importPatterns,
          pairedWithIds: orgTech.pairedWithIds,
        };
      }
    }

    // Fall back to system
    const systemTech = await prisma.technology.findFirst({
      where: { slug, isSystem: true, isActive: true },
    });

    if (!systemTech) return null;

    return {
      id: systemTech.id,
      slug: systemTech.slug,
      name: systemTech.name,
      category: systemTech.category,
      description: systemTech.description,
      color: systemTech.color,
      icon: systemTech.icon,
      fileExtensions: systemTech.fileExtensions,
      importPatterns: systemTech.importPatterns,
      pairedWithIds: systemTech.pairedWithIds,
    };
  } catch (error) {
    console.error(`Failed to get technology '${slug}':`, error);
    return null;
  }
});

// =============================================================================
// TIER CONFIG
// =============================================================================

export interface TierConfigData {
  tierId: string;
  name: string;
  price: number;
  description?: string | null;
  maxCustomQuestions: number | null; // null = unlimited
  maxTeamMembers: number | null; // null = unlimited
  customRolesAllowed: boolean;
  customInstructionsAllowed: boolean;
  advancedAnalytics: boolean;
  previewTestRuns: number | null; // null = unlimited
}

/**
 * Get tier configuration by ID.
 */
export const getTierConfig = cache(async (
  tierId: string
): Promise<TierConfigData | null> => {
  try {
    const config = await prisma.tierConfig.findUnique({
      where: { tierId, isActive: true },
    });

    if (!config) return null;

    return {
      tierId: config.tierId,
      name: config.name,
      price: config.price,
      description: config.description,
      maxCustomQuestions: config.maxCustomQuestions,
      maxTeamMembers: config.maxTeamMembers,
      customRolesAllowed: config.customRolesAllowed,
      customInstructionsAllowed: config.customInstructionsAllowed,
      advancedAnalytics: config.advancedAnalytics,
      previewTestRuns: config.previewTestRuns,
    };
  } catch (error) {
    console.error(`Failed to get tier config '${tierId}':`, error);
    return null;
  }
});

/**
 * Get all tier configurations.
 */
export const getAllTierConfigs = cache(async (): Promise<TierConfigData[]> => {
  try {
    const configs = await prisma.tierConfig.findMany({
      where: { isActive: true },
      orderBy: { price: "desc" },
    });

    return configs.map((c: TierConfig) => ({
      tierId: c.tierId,
      name: c.name,
      price: c.price,
      description: c.description,
      maxCustomQuestions: c.maxCustomQuestions,
      maxTeamMembers: c.maxTeamMembers,
      customRolesAllowed: c.customRolesAllowed,
      customInstructionsAllowed: c.customInstructionsAllowed,
      advancedAnalytics: c.advancedAnalytics,
      previewTestRuns: c.previewTestRuns,
    }));
  } catch (error) {
    console.error("Failed to get all tier configs:", error);
    return [];
  }
});

/**
 * Check if a role is available for a tier.
 */
export const isRoleAvailableForTier = cache(async (
  roleId: string,
  tierId: string
): Promise<boolean> => {
  const role = await getRoleConfig(roleId);
  return role?.availableInTiers.includes(tierId) ?? false;
});

// =============================================================================
// ASSESSMENT TEMPLATE CONFIG
// =============================================================================

export interface QuestionSeedData {
  instructions: string;
  topics: string[];
  difficultyDistribution: Record<string, number>;
}

export interface AssessmentTemplateData {
  templateId: string;
  name: string;
  role: string;
  seniority: string;
  description?: string | null;
  estimatedDuration: number;
  problemCount: number;
  minTier: string;
  questionSeeds: QuestionSeedData[];
}

/**
 * Get assessment template by ID.
 */
export const getAssessmentTemplate = cache(async (
  templateId: string,
  organizationId?: string
): Promise<AssessmentTemplateData | null> => {
  try {
    // Try org-specific first
    if (organizationId) {
      const orgTemplate = await prisma.assessmentTemplateConfig.findFirst({
        where: { templateId, organizationId, isActive: true },
      });
      if (orgTemplate) {
        return {
          templateId: orgTemplate.templateId,
          name: orgTemplate.name,
          role: orgTemplate.role,
          seniority: orgTemplate.seniority,
          description: orgTemplate.description,
          estimatedDuration: orgTemplate.estimatedDuration,
          problemCount: orgTemplate.problemCount,
          minTier: orgTemplate.minTier,
          questionSeeds: orgTemplate.questionSeeds as unknown as QuestionSeedData[],
        };
      }
    }

    // Fall back to system
    const systemTemplate = await prisma.assessmentTemplateConfig.findUnique({
      where: { templateId, isActive: true },
    });

    if (!systemTemplate) return null;

    return {
      templateId: systemTemplate.templateId,
      name: systemTemplate.name,
      role: systemTemplate.role,
      seniority: systemTemplate.seniority,
      description: systemTemplate.description,
      estimatedDuration: systemTemplate.estimatedDuration,
      problemCount: systemTemplate.problemCount,
      minTier: systemTemplate.minTier,
      questionSeeds: systemTemplate.questionSeeds as unknown as QuestionSeedData[],
    };
  } catch (error) {
    console.error(`Failed to get assessment template '${templateId}':`, error);
    return null;
  }
});

/**
 * Get all assessment templates.
 */
export const getAllAssessmentTemplates = cache(async (options: {
  role?: string;
  seniority?: string;
  organizationId?: string;
} = {}): Promise<AssessmentTemplateData[]> => {
  try {
    const { role, seniority, organizationId } = options;

    const where: {
      isActive: boolean;
      role?: string;
      seniority?: string;
      OR: Array<{ isSystem: boolean } | { organizationId: string }>;
    } = {
      isActive: true,
      OR: [
        { isSystem: true },
        ...(organizationId ? [{ organizationId }] : []),
      ],
    };

    if (role) where.role = role;
    if (seniority) where.seniority = seniority;

    const templates = await prisma.assessmentTemplateConfig.findMany({
      where,
      orderBy: [{ role: "asc" }, { seniority: "asc" }],
    });

    return templates.map((t: AssessmentTemplateConfig) => ({
      templateId: t.templateId,
      name: t.name,
      role: t.role,
      seniority: t.seniority,
      description: t.description,
      estimatedDuration: t.estimatedDuration,
      problemCount: t.problemCount,
      minTier: t.minTier,
      questionSeeds: t.questionSeeds as unknown as QuestionSeedData[],
    }));
  } catch (error) {
    console.error("Failed to get assessment templates:", error);
    return [];
  }
});

/**
 * Get recommended duration for a role and seniority combination.
 */
export const getRecommendedDuration = cache(async (
  roleId: string,
  seniorityId: string,
  organizationId?: string
): Promise<number> => {
  const [role, seniority] = await Promise.all([
    getRoleConfig(roleId, organizationId),
    getSeniorityConfig(seniorityId, organizationId),
  ]);

  const roleDuration = role?.defaultDuration ?? 60;
  const seniorityDuration = seniority?.defaultDuration ?? 60;

  return Math.round((roleDuration + seniorityDuration) / 2);
});

// =============================================================================
// GENERIC CONFIG (with override support)
// =============================================================================

/**
 * Get a generic config value with layered resolution.
 *
 * Resolution order:
 * 1. Organization override (if exists and allowed by policy)
 * 2. System default from ConfigItem
 * 3. null if not found
 */
export const getConfig = cache(async <T = unknown>(
  category: string,
  key: string,
  organizationId?: string
): Promise<T | null> => {
  try {
    // Get config item with category
    const configItem = await prisma.configItem.findFirst({
      where: {
        category: { name: category },
        key,
        isActive: true,
      },
      include: {
        category: true,
        overrides: organizationId
          ? { where: { organizationId } }
          : false,
      },
    });

    if (!configItem) return null;

    // Check if org override exists and is allowed
    const overridePolicy = configItem.category.overridePolicy;

    if (organizationId && overridePolicy !== "SYSTEM_ONLY") {
      const override = Array.isArray(configItem.overrides)
        ? configItem.overrides[0]
        : null;

      if (override) {
        let value = override.value as T;

        // Apply bounds for BOUNDED configs
        if (overridePolicy === "BOUNDED" && typeof value === "number") {
          const numValue = value as unknown as number;
          if (configItem.minValue !== null && numValue < configItem.minValue) {
            value = configItem.minValue as unknown as T;
          }
          if (configItem.maxValue !== null && numValue > configItem.maxValue) {
            value = configItem.maxValue as unknown as T;
          }
        }

        return value;
      }
    }

    return configItem.value as T;
  } catch (error) {
    console.error(`Failed to get config '${category}.${key}':`, error);
    return null;
  }
});

// =============================================================================
// BATCH LOADER
// =============================================================================

export interface AllConfigsData {
  security: {
    blockedPatterns: string[];
    allowedCommands: string[];
    rateLimits: Record<string, number>;
    sessionTimeouts: Record<string, number>;
  };
  models: ModelConfigData[];
  roles: RoleConfigData[];
  seniorities: SeniorityConfigData[];
  imageMap: Record<string, string>;
}

/**
 * Load all configs in a single batch.
 * Useful for initial page load to reduce DB round trips.
 */
export const getAllConfigs = cache(async (
  organizationId?: string
): Promise<AllConfigsData> => {
  const [
    blockedPatterns,
    allowedCommands,
    rateLimits,
    sessionTimeouts,
    models,
    roles,
    seniorities,
    imageMap,
  ] = await Promise.all([
    getBlockedPatterns(),
    getAllowedCommands(),
    getRateLimits(),
    getSessionTimeouts(),
    getAllModelConfigs(),
    getRoleConfigs(organizationId),
    getAllSeniorityConfigs(organizationId),
    getImageMap(),
  ]);

  return {
    security: {
      blockedPatterns,
      allowedCommands,
      rateLimits,
      sessionTimeouts,
    },
    models,
    roles,
    seniorities,
    imageMap,
  };
});
