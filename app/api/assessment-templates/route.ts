import { NextRequest } from "next/server";
import { success, serverError } from "@/lib/utils/api-response";
import prisma from "@/lib/prisma";

/**
 * GET /api/assessment-templates
 *
 * Fetch assessment templates from the database.
 * Optionally filter by role and/or seniority.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const seniority = searchParams.get("seniority");

    // Build filter conditions
    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (role) {
      where.role = role;
    }

    if (seniority) {
      where.seniority = seniority;
    }

    const templates = await prisma.assessmentTemplateConfig.findMany({
      where,
      orderBy: [
        { role: "asc" },
        { seniority: "asc" },
      ],
    });

    // Transform to match the expected format
    const formattedTemplates = templates.map((template) => ({
      id: template.templateId,
      name: template.name,
      role: template.role,
      seniority: template.seniority,
      description: template.description,
      estimatedDuration: template.estimatedDuration,
      problemCount: template.problemCount,
      minTier: template.minTier,
      questionSeeds: template.questionSeeds,
    }));

    return success(formattedTemplates);
  } catch (error) {
    console.error("Error fetching assessment templates:", error);
    return serverError("Failed to fetch assessment templates");
  }
}
