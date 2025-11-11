import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics for the user's organization
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

    // Calculate pass rate (score >= 70)
    const passThreshold = 70;
    const passedCandidates = allCandidates.filter(
      (c) => (c.overallScore || 0) >= passThreshold
    );
    const passRate = allCandidates.length > 0
      ? passedCandidates.length / allCandidates.length
      : 0;

    // AI proficiency (using communication score as proxy)
    const candidatesWithCommScore = allCandidates.filter(
      (c) => c.communicationScore !== null
    );
    const avgAIProficiency = candidatesWithCommScore.length > 0
      ? candidatesWithCommScore.reduce(
          (sum, c) => sum + (c.communicationScore || 0),
          0
        ) / candidatesWithCommScore.length
      : 0;

    // Candidates using AI (assuming all with communication score used AI)
    const candidatesUsingAI = candidatesWithCommScore.length;
    const aiUsageRate = totalCandidates > 0
      ? candidatesUsingAI / totalCandidates
      : 0;

    // Pipeline funnel
    const invited = totalCandidates;
    const started = startedCandidates.length;
    const completed = completedCandidates.length;
    const passed = passedCandidates.length;

    // Calculate trends (last 30 days vs previous 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [recentCompletions, previousCompletions] = await Promise.all([
      prisma.candidate.count({
        where: {
          organizationId: orgId,
          completedAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.candidate.count({
        where: {
          organizationId: orgId,
          completedAt: {
            gte: sixtyDaysAgo,
            lt: thirtyDaysAgo,
          },
        },
      }),
    ]);

    const completionTrend = previousCompletions > 0
      ? ((recentCompletions - previousCompletions) / previousCompletions) * 100
      : 0;

    return NextResponse.json({
      kpis: {
        activeAssessments: {
          label: "Active Assessments",
          value: activeAssessments,
          change: 0, // TODO: Calculate trend
          changeType: "neutral" as const,
        },
        pendingReview: {
          label: "Pending Review",
          value: pendingReviewCandidates,
          change: 0,
          changeType: "neutral" as const,
        },
        completedThisMonth: {
          label: "Completed This Month",
          value: completedThisMonth,
          change: Math.round(completionTrend),
          changeType: (completionTrend > 0 ? "positive" : completionTrend < 0 ? "negative" : "neutral") as const,
        },
        averageScore: {
          label: "Average Score",
          value: Math.round(avgOverallScore),
          suffix: "/100",
          change: 0, // TODO: Calculate trend
          changeType: "neutral" as const,
        },
        completionRate: {
          label: "Completion Rate",
          value: Math.round(completionRate * 100),
          suffix: "%",
          change: 0,
          changeType: "neutral" as const,
        },
        passRate: {
          label: "Pass Rate",
          value: Math.round(passRate * 100),
          suffix: "%",
          change: 0,
          changeType: "neutral" as const,
        },
        avgAIProficiency: {
          label: "Avg AI Proficiency",
          value: Math.round(avgAIProficiency),
          suffix: "/100",
          change: 0,
          changeType: "neutral" as const,
        },
        candidatesUsingAI: {
          label: "Candidates Using AI",
          value: Math.round(aiUsageRate * 100),
          suffix: "%",
          change: 0,
          changeType: "neutral" as const,
        },
      },
      pipeline: {
        stages: [
          { name: "Invited", count: invited },
          { name: "Started", count: started },
          { name: "Completed", count: completed },
          { name: "Passed", count: passed },
        ],
        overallConversion: invited > 0 ? passed / invited : 0,
      },
      candidates: recentCandidates.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        appliedRole: c.assessment.role,
        targetSeniority: c.assessment.seniority,
        status: c.status.toLowerCase().replace(/_/g, "_") as any,
        assessmentCompleted: c.status === "COMPLETED" || c.status === "EVALUATED",
        overallScore: c.overallScore,
        codingScore: c.codingScore,
        communicationScore: c.communicationScore,
        problemSolvingScore: c.problemSolvingScore,
        invitedAt: c.invitedAt.toISOString(),
        lastActivityAt: (c.completedAt || c.startedAt || c.invitedAt).toISOString(),
        sessionDuration: c.sessionRecording?.duration,
        redFlags: [], // TODO: Populate from session data
        greenFlags: [], // TODO: Populate from session data
      })),
      summary: {
        totalCandidates,
        activeAssessments,
        pendingReview: pendingReviewCandidates,
        avgScore: Math.round(avgOverallScore),
        completionRate: Math.round(completionRate * 100),
        passRate: Math.round(passRate * 100),
      },
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
