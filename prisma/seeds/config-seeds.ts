/**
 * Config Seeds
 *
 * Seeds all configuration data from hardcoded TypeScript files to database.
 * This includes security configs, model configs, sandbox configs, roles, and seniorities.
 */

import { PrismaClient } from "@prisma/client";

// Import hardcoded configs
import {
  BLOCKED_BASH_PATTERNS,
  ALLOWED_BASH_COMMANDS,
  RATE_LIMITS,
  SESSION_TIMEOUTS,
  WORKSPACE_PATH_RESTRICTIONS,
} from "../../lib/constants/security";
import {
  CLAUDE_MODELS,
  AGENT_MODEL_RECOMMENDATIONS,
} from "../../lib/constants/models";
import {
  ROLES,
  SENIORITY_LEVELS,
  TIER_LIMITS,
  TIER_INFO,
  ASSESSMENT_TEMPLATES,
} from "../../lib/assessment-config";
import { SCORING_WEIGHTS } from "../../lib/scoring";

const prisma = new PrismaClient();

// =============================================================================
// SECURITY CONFIGS
// =============================================================================

export async function seedSecurityConfigs() {
  console.log("  Seeding security configs...");

  // Blocked bash patterns (convert RegExp to string)
  await prisma.securityConfig.upsert({
    where: { configType: "blocked_patterns" },
    update: {
      value: BLOCKED_BASH_PATTERNS.map((p) => p.source),
      description: "Regex patterns for blocked bash commands",
    },
    create: {
      configType: "blocked_patterns",
      value: BLOCKED_BASH_PATTERNS.map((p) => p.source),
      description: "Regex patterns for blocked bash commands",
    },
  });

  // Allowed commands
  await prisma.securityConfig.upsert({
    where: { configType: "allowed_commands" },
    update: {
      value: ALLOWED_BASH_COMMANDS,
      description: "Allowed base bash commands",
    },
    create: {
      configType: "allowed_commands",
      value: ALLOWED_BASH_COMMANDS,
      description: "Allowed base bash commands",
    },
  });

  // Rate limits
  await prisma.securityConfig.upsert({
    where: { configType: "rate_limits" },
    update: {
      value: RATE_LIMITS,
      description: "Rate limiting configuration",
    },
    create: {
      configType: "rate_limits",
      value: RATE_LIMITS,
      description: "Rate limiting configuration",
    },
  });

  // Session timeouts
  await prisma.securityConfig.upsert({
    where: { configType: "session_timeouts" },
    update: {
      value: SESSION_TIMEOUTS,
      description: "Session timeout configuration",
    },
    create: {
      configType: "session_timeouts",
      value: SESSION_TIMEOUTS,
      description: "Session timeout configuration",
    },
  });

  // Workspace path restrictions
  await prisma.securityConfig.upsert({
    where: { configType: "workspace_restrictions" },
    update: {
      value: WORKSPACE_PATH_RESTRICTIONS,
      description: "File path restrictions for workspace",
    },
    create: {
      configType: "workspace_restrictions",
      value: WORKSPACE_PATH_RESTRICTIONS,
      description: "File path restrictions for workspace",
    },
  });

  console.log("  ✅ Security configs seeded");
}

// =============================================================================
// MODEL CONFIGS
// =============================================================================

export async function seedModelConfigs() {
  console.log("  Seeding model configs...");

  for (const [modelId, config] of Object.entries(CLAUDE_MODELS)) {
    // Find which agents recommend this model
    const recommendedFor = Object.entries(AGENT_MODEL_RECOMMENDATIONS)
      .filter(([, model]) => model === modelId)
      .map(([agent]) => agent);

    await prisma.modelConfig.upsert({
      where: { modelId },
      update: {
        name: config.name,
        inputPricePerMToken: config.inputPricePerMToken,
        outputPricePerMToken: config.outputPricePerMToken,
        maxTokens: config.maxTokens,
        contextWindow: config.contextWindow,
        description: config.description,
        useCase: config.useCase,
        recommendedFor,
      },
      create: {
        modelId,
        name: config.name,
        inputPricePerMToken: config.inputPricePerMToken,
        outputPricePerMToken: config.outputPricePerMToken,
        maxTokens: config.maxTokens,
        contextWindow: config.contextWindow,
        description: config.description,
        useCase: config.useCase,
        recommendedFor,
      },
    });
  }

  console.log(`  ✅ Model configs seeded (${Object.keys(CLAUDE_MODELS).length} models)`);
}

// =============================================================================
// SANDBOX CONFIGS
// =============================================================================

export async function seedSandboxConfigs() {
  console.log("  Seeding sandbox configs...");

  const sandboxes = [
    { language: "python", dockerImage: "python:3.11-slim-bookworm" },
    { language: "javascript", dockerImage: "node:20-bookworm-slim" },
    { language: "typescript", dockerImage: "node:20-bookworm-slim" },
    { language: "go", dockerImage: "golang:1.21-bookworm" },
    { language: "java", dockerImage: "eclipse-temurin:21-jdk-jammy" },
    { language: "rust", dockerImage: "rust:1.75-slim-bookworm" },
    { language: "default", dockerImage: "node:20-bookworm-slim" },
  ];

  for (const sb of sandboxes) {
    await prisma.sandboxConfig.upsert({
      where: { language: sb.language },
      update: { dockerImage: sb.dockerImage },
      create: {
        language: sb.language,
        dockerImage: sb.dockerImage,
        cpu: 2.0,
        memoryMb: 2048,
        timeoutSeconds: 3600,
        maxCpu: 4.0,
        maxMemoryMb: 4096,
        maxTimeoutSeconds: 7200,
      },
    });
  }

  console.log(`  ✅ Sandbox configs seeded (${sandboxes.length} languages)`);
}

// =============================================================================
// ROLE CONFIGS
// =============================================================================

export async function seedRoleConfigs() {
  console.log("  Seeding role configs...");

  for (const [roleId, role] of Object.entries(ROLES)) {
    // Find existing system role
    const existing = await prisma.roleConfig.findFirst({
      where: { roleId, isSystem: true },
    });

    if (existing) {
      // Update existing
      await prisma.roleConfig.update({
        where: { id: existing.id },
        data: {
          name: role.name,
          description: role.description,
          icon: role.icon,
          defaultDuration: role.defaultDuration,
          availableInTiers: role.availableInTiers,
          status: role.status,
        },
      });
    } else {
      // Create new
      await prisma.roleConfig.create({
        data: {
          roleId,
          name: role.name,
          description: role.description,
          icon: role.icon,
          defaultDuration: role.defaultDuration,
          availableInTiers: role.availableInTiers,
          status: role.status,
          isSystem: true,
          organizationId: null,
        },
      });
    }
  }

  console.log(`  ✅ Role configs seeded (${Object.keys(ROLES).length} roles)`);
}

// =============================================================================
// SENIORITY CONFIGS
// =============================================================================

export async function seedSeniorityConfigs() {
  console.log("  Seeding seniority configs...");

  for (const [seniorityId, seniority] of Object.entries(SENIORITY_LEVELS)) {
    // Get scoring weights for this seniority
    const scoringWeights =
      SCORING_WEIGHTS[seniorityId as keyof typeof SCORING_WEIGHTS];

    // Find existing system seniority config
    const existing = await prisma.seniorityConfig.findFirst({
      where: { seniorityId, isSystem: true },
    });

    if (existing) {
      // Update existing
      await prisma.seniorityConfig.update({
        where: { id: existing.id },
        data: {
          name: seniority.name,
          description: seniority.description,
          experienceYears: seniority.experienceYears,
          defaultDuration: seniority.defaultDuration,
          difficultyMix: seniority.difficultyMix,
          scoringWeights,
        },
      });
    } else {
      // Create new
      await prisma.seniorityConfig.create({
        data: {
          seniorityId,
          name: seniority.name,
          description: seniority.description,
          experienceYears: seniority.experienceYears,
          defaultDuration: seniority.defaultDuration,
          difficultyMix: seniority.difficultyMix,
          scoringWeights,
          isSystem: true,
          organizationId: null,
        },
      });
    }
  }

  console.log(
    `  ✅ Seniority configs seeded (${Object.keys(SENIORITY_LEVELS).length} levels)`
  );
}

// =============================================================================
// TIER CONFIGS
// =============================================================================

export async function seedTierConfigs() {
  console.log("  Seeding tier configs...");

  for (const [tierId, limits] of Object.entries(TIER_LIMITS)) {
    const info = TIER_INFO[tierId as keyof typeof TIER_INFO];

    await prisma.tierConfig.upsert({
      where: { tierId },
      update: {
        name: info.name,
        price: info.price,
        description: info.description,
        maxCustomQuestions:
          limits.maxCustomQuestions === "unlimited"
            ? null
            : limits.maxCustomQuestions,
        maxTeamMembers:
          limits.maxTeamMembers === "unlimited" ? null : limits.maxTeamMembers,
        customRolesAllowed: limits.customRolesAllowed,
        customInstructionsAllowed: limits.customInstructionsAllowed,
        advancedAnalytics: limits.advancedAnalytics,
        previewTestRuns:
          limits.previewTestRuns === "unlimited" ? null : limits.previewTestRuns,
      },
      create: {
        tierId,
        name: info.name,
        price: info.price,
        description: info.description,
        maxCustomQuestions:
          limits.maxCustomQuestions === "unlimited"
            ? null
            : limits.maxCustomQuestions,
        maxTeamMembers:
          limits.maxTeamMembers === "unlimited" ? null : limits.maxTeamMembers,
        customRolesAllowed: limits.customRolesAllowed,
        customInstructionsAllowed: limits.customInstructionsAllowed,
        advancedAnalytics: limits.advancedAnalytics,
        previewTestRuns:
          limits.previewTestRuns === "unlimited" ? null : limits.previewTestRuns,
      },
    });
  }

  console.log(`  ✅ Tier configs seeded (${Object.keys(TIER_LIMITS).length} tiers)`);
}

// =============================================================================
// ASSESSMENT TEMPLATE CONFIGS
// =============================================================================

export async function seedAssessmentTemplates() {
  console.log("  Seeding assessment templates...");

  for (const template of ASSESSMENT_TEMPLATES) {
    await prisma.assessmentTemplateConfig.upsert({
      where: { templateId: template.id },
      update: {
        name: template.name,
        role: template.role,
        seniority: template.seniority,
        description: template.description,
        estimatedDuration: template.estimatedDuration,
        problemCount: template.problemCount,
        minTier: template.minTier,
        questionSeeds: template.questionSeeds as unknown as object,
      },
      create: {
        templateId: template.id,
        name: template.name,
        role: template.role,
        seniority: template.seniority,
        description: template.description,
        estimatedDuration: template.estimatedDuration,
        problemCount: template.problemCount,
        minTier: template.minTier,
        questionSeeds: template.questionSeeds as unknown as object,
        isSystem: true,
        organizationId: null,
      },
    });
  }

  console.log(`  ✅ Assessment templates seeded (${ASSESSMENT_TEMPLATES.length} templates)`);
}

// =============================================================================
// MAIN SEEDER
// =============================================================================

export async function seedAllConfigs() {
  console.log("\n🔧 Seeding configuration data...");

  await seedSecurityConfigs();
  await seedModelConfigs();
  await seedSandboxConfigs();
  await seedRoleConfigs();
  await seedSeniorityConfigs();
  await seedTierConfigs();
  await seedAssessmentTemplates();

  console.log("✅ All configuration data seeded!\n");
}

// Run if executed directly
if (require.main === module) {
  seedAllConfigs()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
