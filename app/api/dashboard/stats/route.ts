import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics for the user's organization
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's organization
    const userOrg = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "User not associated with any organization" },
        { status: 400 }
      );
    }

    const orgId = userOrg.organizationId;

    // Get current month start
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Parallel queries for better performance
    const [
      activeAssessments,
      totalCandidates,
      pendingReviewCandidates,
      completedThisMonth,
      allCandidates,
      recentCandidates,
    ] = await Promise.all([
      // Active assessments count
      prisma.assessment.count({
        where: {
          organizationId: orgId,
          status: "PUBLISHED",
        },
      }),

      // Total candidates
      prisma.candidate.count({
        where: { organizationId: orgId },
      }),

      // Pending review (completed but not evaluated)
      prisma.candidate.count({
        where: {
          organizationId: orgId,
          status: "COMPLETED",
        },
      }),

      // Completed this month
      prisma.candidate.count({
        where: {
          organizationId: orgId,
          completedAt: {
            gte: monthStart,
          },
        },
      }),

      // All candidates with scores for aggregation
      prisma.candidate.findMany({
        where: {
          organizationId: orgId,
          overallScore: { not: null },
        },
        select: {
          id: true,
          status: true,
          overallScore: true,
          codingScore: true,
          communicationScore: true,
          problemSolvingScore: true,
          invitedAt: true,
          startedAt: true,
          completedAt: true,
        },
      }),

      // Recent candidates
      prisma.candidate.findMany({
        where: { organizationId: orgId },
        include: {
          assessment: {
            select: {
              title: true,
              role: true,
              seniority: true,
            },
          },
          sessionRecording: {
            select: {
              duration: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Calculate average scores
    const avgOverallScore = allCandidates.length > 0
      ? allCandidates.reduce((sum, c) => sum + (c.overallScore || 0), 0) /
        allCandidates.length
      : 0;

    // Calculate completion rate
    const startedCandidates = allCandidates.filter((c) => c.startedAt !== null);
    const completedCandidates = allCandidates.filter(
      (c) => c.status === "COMPLETED" || c.status === "EVALUATED"
    );
    const completionRate = startedCandidates.length > 0
      ? completedCandidates.length / startedCandidates.length
      : 0;

    return NextResponse.json({
      stats: {
        activeAssessments,
        totalCandidates,
        pendingReview: pendingReviewCandidates,
        completedThisMonth,
        completionRate,
        avgScore: Math.round(avgOverallScore),
      },
      recentCandidates: recentCandidates.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        appliedRole: c.assessment.role,
        targetSeniority: c.assessment.seniority,
        status: c.status,
        assessmentCompleted: c.status === "COMPLETED" || c.status === "EVALUATED",
        overallScore: c.overallScore,
        codingScore: c.codingScore,
        communicationScore: c.communicationScore,
        problemSolvingScore: c.problemSolvingScore,
        invitedAt: c.invitedAt.toISOString(),
        lastActivityAt: (c.completedAt || c.startedAt || c.invitedAt).toISOString(),
        sessionDuration: c.sessionRecording?.duration,
      })),
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
