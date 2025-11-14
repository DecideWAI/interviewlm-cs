import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

/**
 * GET /api/user/settings
 * Get current user's settings and organization data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user with full organization data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        organizationMembers: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const primaryOrg = user.organizationMembers?.[0];
    const organizationId = primaryOrg?.organizationId;

    // Get team members if in an organization
    let teamMembers = [];
    if (organizationId) {
      const members = await prisma.organizationMember.findMany({
        where: { organizationId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      teamMembers = members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        status: "Active",
      }));
    }

    // Get current tier info from organization or default
    const currentTier = primaryOrg?.organization?.tier || "small";

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        firstName: user.name?.split(" ")[0] || "",
        lastName: user.name?.split(" ").slice(1).join(" ") || "",
      },
      organization: primaryOrg
        ? {
            id: primaryOrg.organization.id,
            name: primaryOrg.organization.name,
            tier: currentTier,
            createdAt: primaryOrg.organization.createdAt,
          }
        : null,
      teamMembers,
      settings: {
        // These would be stored in a settings table in a real app
        notifications: {
          assessmentCompleted: true,
          strongCandidate: true,
          pendingReview: true,
          creditsLow: true,
          weeklyDigest: true,
        },
        defaults: {
          durationJunior: 40,
          durationMid: 60,
          durationSenior: 75,
          durationStaff: 90,
          enableAI: true,
          enableAIMonitoring: true,
          autoSave: true,
        },
        scoring: {
          technicalWeight: 40,
          aiCollaborationWeight: 20,
          codeQualityWeight: 25,
          problemSolvingWeight: 15,
          passingScore: 70,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/settings
 * Update user settings
 */
const updateSettingsSchema = z.object({
  notifications: z
    .object({
      assessmentCompleted: z.boolean().optional(),
      strongCandidate: z.boolean().optional(),
      pendingReview: z.boolean().optional(),
      creditsLow: z.boolean().optional(),
      weeklyDigest: z.boolean().optional(),
    })
    .optional(),
  defaults: z
    .object({
      durationJunior: z.number().min(20).max(240).optional(),
      durationMid: z.number().min(20).max(240).optional(),
      durationSenior: z.number().min(20).max(240).optional(),
      durationStaff: z.number().min(20).max(240).optional(),
      enableAI: z.boolean().optional(),
      enableAIMonitoring: z.boolean().optional(),
      autoSave: z.boolean().optional(),
    })
    .optional(),
  scoring: z
    .object({
      technicalWeight: z.number().min(0).max(100).optional(),
      aiCollaborationWeight: z.number().min(0).max(100).optional(),
      codeQualityWeight: z.number().min(0).max(100).optional(),
      problemSolvingWeight: z.number().min(0).max(100).optional(),
      passingScore: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = updateSettingsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    // In a real app, you would save these settings to a UserSettings table
    // For now, we just acknowledge the update

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
      settings: validationResult.data,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
