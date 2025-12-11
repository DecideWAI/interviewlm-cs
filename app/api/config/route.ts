import { NextRequest } from "next/server";
import { success, serverError, badRequest } from "@/lib/utils/api-response";
import prisma from "@/lib/prisma";

/**
 * GET /api/config
 *
 * Fetch configuration data from the database.
 * Query params:
 * - type: "roles" | "seniority" | "tiers" | "all"
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const configType = searchParams.get("type") || "all";

    const result: Record<string, unknown> = {};

    // Fetch roles
    if (configType === "roles" || configType === "all") {
      const roles = await prisma.roleConfig.findMany({
        where: { status: "active" },
        orderBy: { name: "asc" },
      });

      // Transform to Record<Role, RoleMetadata> format
      const rolesRecord: Record<string, unknown> = {};
      for (const role of roles) {
        rolesRecord[role.roleId] = {
          id: role.roleId,
          name: role.name,
          description: role.description,
          icon: role.icon,
          defaultDuration: role.defaultDuration,
          availableInTiers: role.availableInTiers,
          status: role.status,
        };
      }
      result.roles = rolesRecord;
    }

    // Fetch seniority levels
    if (configType === "seniority" || configType === "all") {
      const seniorityLevels = await prisma.seniorityConfig.findMany({
        where: { isSystem: true },
        orderBy: { name: "asc" },
      });

      // Transform to Record<SeniorityLevel, SeniorityMetadata> format
      const seniorityRecord: Record<string, unknown> = {};
      for (const level of seniorityLevels) {
        seniorityRecord[level.seniorityId] = {
          id: level.seniorityId,
          name: level.name,
          description: level.description,
          experienceYears: level.experienceYears,
          defaultDuration: level.defaultDuration,
          difficultyMix: level.difficultyMix,
        };
      }
      result.seniorityLevels = seniorityRecord;
    }

    // Fetch tier configs
    if (configType === "tiers" || configType === "all") {
      const tiers = await prisma.tierConfig.findMany({
        where: { isActive: true },
        orderBy: { price: "asc" },
      });

      // Transform to Record<PricingTier, TierLimits> format
      const tiersRecord: Record<string, unknown> = {};
      const tierInfoRecord: Record<string, unknown> = {};

      for (const tier of tiers) {
        tiersRecord[tier.tierId] = {
          tier: tier.tierId,
          maxCustomQuestions: tier.maxCustomQuestions,
          maxTeamMembers: tier.maxTeamMembers,
          customRolesAllowed: tier.customRolesAllowed,
          customInstructionsAllowed: tier.customInstructionsAllowed,
          advancedAnalytics: tier.advancedAnalytics,
          previewTestRuns: tier.previewTestRuns,
        };

        tierInfoRecord[tier.tierId] = {
          name: tier.name,
          price: tier.price,
          description: tier.description,
        };
      }
      result.tierLimits = tiersRecord;
      result.tierInfo = tierInfoRecord;
    }

    return success(result);
  } catch (error) {
    console.error("Error fetching config:", error);
    return serverError("Failed to fetch configuration");
  }
}
