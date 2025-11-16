import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

const querySchema = z.object({
  dateRange: z.enum(["last_7_days", "last_30_days", "last_90_days", "this_quarter"]).default("last_30_days"),
});

/**
 * GET /api/analytics/overview
 * Get analytics overview data for the current organization
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
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "User not associated with any organization" },
        { status: 400 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryResult = querySchema.safeParse({
      dateRange: searchParams.get("dateRange") || "last_30_days",
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: queryResult.error.errors },
        { status: 400 }
      );
    }

    const { dateRange } = queryResult.data;

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (dateRange) {
      case "last_7_days":
        startDate.setDate(now.getDate() - 7);
        break;
      case "last_30_days":
        startDate.setDate(now.getDate() - 30);
        break;
      case "last_90_days":
        startDate.setDate(now.getDate() - 90);
        break;
      case "this_quarter":
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
    }

    // Get previous period for comparison
    const periodDays = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const previousStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Fetch analytics data
    const [
      completedThisMonth,
      completedPrevMonth,
      totalCandidates,
      totalPrevCandidates,
      candidatesThisPeriod,
      candidatesPrevPeriod,
    ] = await Promise.all([
      // Completed assessments this period
      prisma.candidate.count({
        where: {
          organizationId: userOrg.organizationId,
          completedAt: { gte: startDate, lte: now },
        },
      }),
      // Completed assessments previous period
      prisma.candidate.count({
        where: {
          organizationId: userOrg.organizationId,
          completedAt: { gte: previousStartDate, lt: startDate },
        },
      }),
      // Total candidates this period
      prisma.candidate.count({
        where: {
          organizationId: userOrg.organizationId,
          invitedAt: { gte: startDate, lte: now },
        },
      }),
      // Total candidates previous period
      prisma.candidate.count({
        where: {
          organizationId: userOrg.organizationId,
          invitedAt: { gte: previousStartDate, lt: startDate },
        },
      }),
      // Candidates with sessions this period
      prisma.candidate.findMany({
        where: {
          organizationId: userOrg.organizationId,
          createdAt: { gte: startDate, lte: now },
        },
      }),
      // Candidates with sessions previous period
      prisma.candidate.findMany({
        where: {
          organizationId: userOrg.organizationId,
          createdAt: { gte: previousStartDate, lt: startDate },
        },
      }),
    ]);

    // Calculate metrics
    const completionRate = totalCandidates > 0 ? (completedThisMonth / totalCandidates) * 100 : 0;
    const prevCompletionRate = totalPrevCandidates > 0 ? (completedPrevMonth / totalPrevCandidates) * 100 : 0;
    const completionRateTrend = prevCompletionRate > 0
      ? ((completionRate - prevCompletionRate) / prevCompletionRate) * 100
      : 0;

    // Calculate pass rate (candidates with overallScore >= 70)
    const passedCandidates = candidatesThisPeriod.filter(c => c.overallScore && c.overallScore >= 70).length;
    const passRate = completedThisMonth > 0 ? (passedCandidates / completedThisMonth) * 100 : 0;

    const prevPassedCandidates = candidatesPrevPeriod.filter(c => c.overallScore && c.overallScore >= 70).length;
    const prevPassRate = completedPrevMonth > 0 ? (prevPassedCandidates / completedPrevMonth) * 100 : 0;
    const passRateTrend = prevPassRate > 0 ? ((passRate - prevPassRate) / prevPassRate) * 100 : 0;

    // Calculate average score as AI proficiency proxy
    const candidatesWithScore = candidatesThisPeriod.filter(c => c.overallScore);
    const avgAIProficiency = candidatesWithScore.length > 0
      ? candidatesWithScore.reduce((sum, c) => sum + (c.overallScore || 0), 0) / candidatesWithScore.length
      : 0;

    const prevCandidatesWithScore = candidatesPrevPeriod.filter(c => c.overallScore);
    const prevAvgAIProficiency = prevCandidatesWithScore.length > 0
      ? prevCandidatesWithScore.reduce((sum, c) => sum + (c.overallScore || 0), 0) / prevCandidatesWithScore.length
      : 0;
    const aiProficiencyTrend = prevAvgAIProficiency > 0
      ? ((avgAIProficiency - prevAvgAIProficiency) / prevAvgAIProficiency) * 100
      : 0;

    // Completed assessments trend
    const completedTrend = completedPrevMonth > 0
      ? ((completedThisMonth - completedPrevMonth) / completedPrevMonth) * 100
      : 0;

    // Build KPIs object
    const kpis = {
      completedThisMonth: {
        value: completedThisMonth,
        trend: {
          percentage: Math.round(completedTrend),
          direction: completedTrend >= 0 ? "up" : "down",
        },
      },
      completionRate: {
        value: `${Math.round(completionRate)}%`,
        trend: {
          percentage: Math.round(completionRateTrend),
          direction: completionRateTrend >= 0 ? "up" : "down",
        },
      },
      passRate: {
        value: `${Math.round(passRate)}%`,
        trend: {
          percentage: Math.round(passRateTrend),
          direction: passRateTrend >= 0 ? "up" : "down",
        },
      },
      avgAIProficiency: {
        value: `${Math.round(avgAIProficiency)}/100`,
        trend: {
          percentage: Math.round(aiProficiencyTrend),
          direction: aiProficiencyTrend >= 0 ? "up" : "down",
        },
      },
    };

    // Get trend data (assessments per day)
    const trendData = [];
    for (let i = periodDays - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      const count = await prisma.candidate.count({
        where: {
          organizationId: userOrg.organizationId,
          completedAt: { gte: date, lt: nextDate },
        },
      });

      trendData.push({
        date: date.toISOString().split('T')[0],
        assessments: count,
      });
    }

    // Get performance by role
    const candidates = await prisma.candidate.findMany({
      where: {
        organizationId: userOrg.organizationId,
        completedAt: { gte: startDate, lte: now },
      },
      include: {
        assessment: true,
      },
    });

    const roleStats = candidates.reduce((acc: any, candidate) => {
      const role = candidate.assessment.role || "Unknown";
      if (!acc[role]) {
        acc[role] = {
          role,
          candidates: 0,
          totalScore: 0,
          passed: 0,
        };
      }
      acc[role].candidates++;
      if (candidate.overallScore) {
        acc[role].totalScore += candidate.overallScore;
      }
      if (candidate.overallScore && candidate.overallScore >= 70) {
        acc[role].passed++;
      }
      return acc;
    }, {});

    const performanceByRole = Object.values(roleStats).map((stat: any) => ({
      role: stat.role,
      candidates: stat.candidates,
      avgScore: stat.candidates > 0 ? Math.round(stat.totalScore / stat.candidates) : 0,
      passRate: stat.candidates > 0 ? stat.passed / stat.candidates : 0,
    }));

    return NextResponse.json({
      kpis,
      trendData,
      performanceByRole,
      dateRange,
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
