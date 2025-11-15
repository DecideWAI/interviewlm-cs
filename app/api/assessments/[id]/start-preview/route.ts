import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

/**
 * POST /api/assessments/[id]/start-preview
 * Start a preview session for an assessment
 *
 * Creates a temporary "preview" candidate and redirects to the interview session.
 * Limits: 3 preview sessions per assessment.
 */
export async function POST(
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

    const { id: assessmentId } = await params;

    // Get assessment with preview usage info
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: {
          include: {
            problemSeed: true,
          },
          orderBy: { order: "asc" },
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

    // Check preview limit
    if (assessment.previewSessionsUsed >= assessment.previewLimit) {
      return NextResponse.json(
        {
          error: "Preview limit reached",
          message: `You have used all ${assessment.previewLimit} preview sessions for this assessment.`,
          previewSessionsUsed: assessment.previewSessionsUsed,
          previewLimit: assessment.previewLimit,
        },
        { status: 403 }
      );
    }

    // Create preview candidate
    const previewCandidate = await prisma.candidate.create({
      data: {
        organizationId: assessment.organizationId,
        assessmentId: assessment.id,
        createdById: session.user.id,
        name: `Preview Session #${assessment.previewSessionsUsed + 1}`,
        email: `preview-${assessmentId}-${Date.now()}@interviewlm.test`,
        isPreview: true,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    // Increment preview sessions counter
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        previewSessionsUsed: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      candidateId: previewCandidate.id,
      previewSessionsUsed: assessment.previewSessionsUsed + 1,
      previewLimit: assessment.previewLimit,
      remainingPreviews: assessment.previewLimit - (assessment.previewSessionsUsed + 1),
    });
  } catch (error) {
    console.error("Error starting preview session:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
