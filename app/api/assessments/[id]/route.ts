import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

// Validation schema for assessment updates
const updateAssessmentSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().optional(),
  role: z.string().optional(),
  seniority: z.enum(["JUNIOR", "MID", "SENIOR", "LEAD", "PRINCIPAL"]).optional(),
  techStack: z.array(z.string()).optional(),
  duration: z.number().min(30).max(240).optional(),
  enableCoding: z.boolean().optional(),
  enableTerminal: z.boolean().optional(),
  enableAI: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

/**
 * GET /api/assessments/[id]
 * Get assessment details with candidates and statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Get assessment with all related data
    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        candidates: {
          include: {
            sessionRecording: {
              select: {
                duration: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            candidates: true,
          },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    // Verify user has access (same organization)
    const userOrg = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: assessment.organizationId,
      },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Calculate comprehensive statistics
    const totalCandidates = assessment.candidates.length;
    const invitedCount = assessment.candidates.filter((c: any) => c.status === "INVITED").length;
    const inProgressCount = assessment.candidates.filter((c: any) => c.status === "IN_PROGRESS").length;
    const completedCount = assessment.candidates.filter(
      (c: any) => c.status === "COMPLETED" || c.status === "EVALUATED"
    ).length;

    const candidatesWithScores = assessment.candidates.filter(
      (c: any) => c.overallScore !== null
    );

    const avgScore = candidatesWithScores.length > 0
      ? candidatesWithScores.reduce((sum: number, c: any) => sum + (c.overallScore || 0), 0) /
        candidatesWithScores.length
      : null;

    const passThreshold = 70;
    const passedCount = candidatesWithScores.filter(
      (c: any) => (c.overallScore || 0) >= passThreshold
    ).length;
    const passRate = candidatesWithScores.length > 0
      ? passedCount / candidatesWithScores.length
      : 0;

    const topPerformers = assessment.candidates
      .filter((c: any) => c.overallScore !== null)
      .sort((a: any, b: any) => (b.overallScore || 0) - (a.overallScore || 0))
      .slice(0, 5)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        overallScore: c.overallScore,
        codingScore: c.codingScore,
        communicationScore: c.communicationScore,
        problemSolvingScore: c.problemSolvingScore,
        status: c.status,
        completedAt: c.completedAt,
      }));

    return NextResponse.json({
      assessment: {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        role: assessment.role,
        seniority: assessment.seniority,
        duration: assessment.duration,
        techStack: assessment.techStack,
        status: assessment.status,
        enableCoding: assessment.enableCoding,
        enableTerminal: assessment.enableTerminal,
        enableAI: assessment.enableAI,
        organization: assessment.organization,
        createdBy: assessment.createdBy,
        createdAt: assessment.createdAt,
        publishedAt: assessment.publishedAt,
        updatedAt: assessment.updatedAt,
      },
      candidates: assessment.candidates.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: c.status,
        overallScore: c.overallScore,
        codingScore: c.codingScore,
        communicationScore: c.communicationScore,
        problemSolvingScore: c.problemSolvingScore,
        invitedAt: c.invitedAt,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
        sessionDuration: c.sessionRecording?.duration,
      })),
      statistics: {
        totalCandidates,
        invitedCount,
        inProgressCount,
        completedCount,
        completionRate: totalCandidates > 0 ? completedCount / totalCandidates : 0,
        avgScore: avgScore ? parseFloat(avgScore.toFixed(1)) : null,
        passRate: parseFloat((passRate * 100).toFixed(1)),
        topPerformers,
      },
    });
  } catch (error) {
    console.error("Error fetching assessment:", error);
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
 * PATCH /api/assessments/[id]
 * Update an assessment
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateAssessmentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const updates = validationResult.data;

    // Get existing assessment
    const existingAssessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        candidates: {
          where: {
            status: { in: ["IN_PROGRESS", "COMPLETED"] },
          },
        },
      },
    });

    if (!existingAssessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const userOrg = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: existingAssessment.organizationId,
      },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Validation: Cannot edit certain fields if candidates have started
    if (existingAssessment.candidates.length > 0) {
      if (updates.duration && updates.duration < existingAssessment.duration) {
        return NextResponse.json(
          { error: "Cannot shorten duration when candidates have started" },
          { status: 400 }
        );
      }

      if (updates.techStack || updates.role || updates.seniority) {
        return NextResponse.json(
          {
            error:
              "Cannot change role, seniority, or tech stack when candidates have started",
          },
          { status: 400 }
        );
      }
    }

    // If status is being changed to PUBLISHED, set publishedAt
    const additionalUpdates: any = {};
    if (updates.status === "PUBLISHED" && existingAssessment.status !== "PUBLISHED") {
      additionalUpdates.publishedAt = new Date();
    }

    // Update assessment
    const assessment = await prisma.assessment.update({
      where: { id },
      data: {
        ...updates,
        ...additionalUpdates,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        role: assessment.role,
        seniority: assessment.seniority,
        duration: assessment.duration,
        techStack: assessment.techStack,
        status: assessment.status,
        enableCoding: assessment.enableCoding,
        enableTerminal: assessment.enableTerminal,
        enableAI: assessment.enableAI,
        createdBy: assessment.createdBy,
        createdAt: assessment.createdAt,
        publishedAt: assessment.publishedAt,
        updatedAt: assessment.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating assessment:", error);
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
 * DELETE /api/assessments/[id]
 * Delete an assessment (soft delete by archiving)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Get assessment
    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        candidates: true,
      },
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const userOrg = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: assessment.organizationId,
      },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Soft delete: Archive instead of hard delete if there are candidates
    if (assessment.candidates.length > 0) {
      await prisma.assessment.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });

      return NextResponse.json({
        success: true,
        message: "Assessment archived (has candidates)",
      });
    } else {
      // Hard delete if no candidates
      await prisma.assessment.delete({
        where: { id },
      });

      return NextResponse.json({
        success: true,
        message: "Assessment deleted",
      });
    }
  } catch (error) {
    console.error("Error deleting assessment:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
