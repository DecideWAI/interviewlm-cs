import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 400 }
      );
    }

    // Find candidate by invitation token
    const candidate = await prisma.candidate.findFirst({
      where: {
        invitationToken: token,
      },
      include: {
        assessment: {
          include: {
            organization: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Invalid invitation link" },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    const now = new Date();
    const isExpired = candidate.invitationExpiresAt && candidate.invitationExpiresAt < now;

    // Check if already completed
    const isCompleted = candidate.status === "COMPLETED" || candidate.status === "SUBMITTED";

    // Check if already in progress
    const isInProgress = candidate.status === "IN_PROGRESS";

    // Can start if: not expired, not completed, and either INVITED or IN_PROGRESS
    const canStart = !isExpired && !isCompleted;

    return NextResponse.json({
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        status: candidate.status,
        invitedAt: candidate.invitedAt,
        invitationExpiresAt: candidate.invitationExpiresAt,
        deadlineAt: candidate.deadlineAt,
      },
      assessment: {
        id: candidate.assessment.id,
        title: candidate.assessment.title,
        description: candidate.assessment.description,
        role: candidate.assessment.role,
        seniority: candidate.assessment.seniority,
        duration: candidate.assessment.duration,
        techStack: candidate.assessment.techStack,
      },
      organization: {
        name: candidate.assessment.organization.name,
        slug: candidate.assessment.organization.slug,
      },
      isValid: true,
      isExpired,
      isCompleted,
      isInProgress,
      canStart,
      sessionId: candidate.sessionId || undefined,
    });
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate invitation" },
      { status: 500 }
    );
  }
}
