/**
 * Analytics Calculation Service
 *
 * Calculates real-time analytics from database for organization dashboards.
 * Replaces mock data with production-ready calculations.
 */

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface DateRangeConfig {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

/**
 * Parse date range preset into actual dates
 */
export function parseDateRange(preset: string): DateRangeConfig {
  const now = new Date();
  const end = now;
  let start: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (preset) {
    case 'last_7_days':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(start.getTime());
      previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last_30_days':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(start.getTime());
      previousStart = new Date(previousEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'last_90_days':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(start.getTime());
      previousStart = new Date(previousEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'this_quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
      previousEnd = new Date(start.getTime());
      previousStart = new Date(now.getFullYear(), quarter * 3 - 3, 1);
      break;
    default:
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(start.getTime());
      previousStart = new Date(previousEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { start, end, previousStart, previousEnd };
}

/**
 * Calculate dashboard KPIs for an organization
 */
export async function calculateDashboardKPIs(
  organizationId: string,
  dateRange: DateRangeConfig
) {
  // Fetch candidates in current and previous periods
  const [currentCandidates, previousCandidates] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        isPreview: false,
      },
      include: {
        sessionRecording: {
          include: {
            claudeInteractions: true,
            testResults: true,
          },
        },
      },
    }),
    prisma.candidate.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: dateRange.previousStart,
          lte: dateRange.previousEnd,
        },
        isPreview: false,
      },
      include: {
        sessionRecording: {
          include: {
            claudeInteractions: true,
            testResults: true,
          },
        },
      },
    }),
  ]);

  // Current period metrics
  const completed = currentCandidates.filter((c) => c.completedAt !== null);
  const passed = currentCandidates.filter(
    (c) => c.overallScore !== null && c.overallScore >= 70
  );
  const started = currentCandidates.filter((c) => c.startedAt !== null);

  // Previous period metrics
  const previousCompleted = previousCandidates.filter(
    (c) => c.completedAt !== null
  );
  const previousPassed = previousCandidates.filter(
    (c) => c.overallScore !== null && c.overallScore >= 70
  );
  const previousStarted = previousCandidates.filter((c) => c.startedAt !== null);

  // Calculate completion rate
  const completionRate = started.length > 0 ? completed.length / started.length : 0;
  const previousCompletionRate =
    previousStarted.length > 0
      ? previousCompleted.length / previousStarted.length
      : 0;

  // Calculate pass rate
  const passRate = completed.length > 0 ? passed.length / completed.length : 0;
  const previousPassRate =
    previousCompleted.length > 0
      ? previousPassed.length / previousCompleted.length
      : 0;

  // Calculate average AI proficiency
  const candidatesWithScores = completed.filter((c) => c.overallScore !== null);
  const avgAIProficiency =
    candidatesWithScores.length > 0
      ? candidatesWithScores.reduce((sum, c) => sum + (c.overallScore || 0), 0) /
        candidatesWithScores.length
      : 0;

  const previousCandidatesWithScores = previousCompleted.filter(
    (c) => c.overallScore !== null
  );
  const previousAvgAIProficiency =
    previousCandidatesWithScores.length > 0
      ? previousCandidatesWithScores.reduce(
          (sum, c) => sum + (c.overallScore || 0),
          0
        ) / previousCandidatesWithScores.length
      : 0;

  // Calculate trends
  const completionRateTrend = calculateTrend(
    completionRate,
    previousCompletionRate
  );
  const passRateTrend = calculateTrend(passRate, previousPassRate);
  const avgAIProficiencyTrend = calculateTrend(
    avgAIProficiency,
    previousAvgAIProficiency
  );
  const completedTrend = calculateTrend(
    completed.length,
    previousCompleted.length
  );

  return {
    completedThisMonth: {
      value: completed.length,
      label: 'Assessments Completed',
      trend: {
        direction: completedTrend.direction,
        percentage: completedTrend.percentage,
        comparison: 'vs previous period',
      },
      status: completed.length > 0 ? 'good' : 'warning',
    },
    completionRate: {
      value: `${Math.round(completionRate * 100)}%`,
      label: 'Completion Rate',
      trend: {
        direction: completionRateTrend.direction,
        percentage: completionRateTrend.percentage,
        comparison: 'vs previous period',
      },
      status: completionRate >= 0.7 ? 'good' : completionRate >= 0.5 ? 'warning' : 'critical',
    },
    passRate: {
      value: `${Math.round(passRate * 100)}%`,
      label: 'Pass Rate',
      trend: {
        direction: passRateTrend.direction,
        percentage: passRateTrend.percentage,
        comparison: 'vs previous period',
      },
      status: passRate >= 0.3 ? 'good' : passRate >= 0.15 ? 'warning' : 'critical',
    },
    avgAIProficiency: {
      value: `${Math.round(avgAIProficiency)}/100`,
      label: 'Avg Score',
      trend: {
        direction: avgAIProficiencyTrend.direction,
        percentage: avgAIProficiencyTrend.percentage,
        comparison: 'vs previous period',
      },
      status: avgAIProficiency >= 70 ? 'good' : avgAIProficiency >= 50 ? 'warning' : 'critical',
    },
  };
}

/**
 * Calculate percentage change and direction
 */
function calculateTrend(
  current: number,
  previous: number
): { direction: 'up' | 'down' | 'neutral'; percentage: number } {
  if (previous === 0 && current === 0) {
    return { direction: 'neutral', percentage: 0 };
  }

  if (previous === 0) {
    return { direction: 'up', percentage: 100 };
  }

  const change = ((current - previous) / previous) * 100;
  const percentage = Math.abs(Math.round(change));

  if (Math.abs(change) < 1) {
    return { direction: 'neutral', percentage: 0 };
  }

  return {
    direction: change > 0 ? 'up' : 'down',
    percentage,
  };
}

/**
 * Calculate trend data (assessments over time)
 */
export async function calculateTrendData(
  organizationId: string,
  dateRange: DateRangeConfig
) {
  const candidates = await prisma.candidate.findMany({
    where: {
      organizationId,
      completedAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      isPreview: false,
    },
    select: {
      completedAt: true,
    },
  });

  // Group by day
  const days = Math.ceil(
    (dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000)
  );

  const trendData = [];
  for (let i = 0; i < Math.min(days, 30); i++) {
    const dayStart = new Date(
      dateRange.start.getTime() + i * 24 * 60 * 60 * 1000
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const count = candidates.filter((c) => {
      const completedAt = c.completedAt!;
      return completedAt >= dayStart && completedAt < dayEnd;
    }).length;

    trendData.push({
      date: dayStart.toISOString().split('T')[0],
      assessments: count,
    });
  }

  return trendData;
}

/**
 * Calculate performance by role
 */
export async function calculatePerformanceByRole(
  organizationId: string,
  dateRange: DateRangeConfig
) {
  const candidates = await prisma.candidate.findMany({
    where: {
      organizationId,
      completedAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      isPreview: false,
    },
    include: {
      assessment: {
        select: {
          role: true,
        },
      },
    },
  });

  // Group by role
  const roleMap = new Map<
    string,
    {
      candidates: number;
      totalScore: number;
      passed: number;
      completed: number;
    }
  >();

  candidates.forEach((candidate) => {
    const role = candidate.assessment.role || 'Unknown';
    const existing = roleMap.get(role) || {
      candidates: 0,
      totalScore: 0,
      passed: 0,
      completed: 0,
    };

    existing.candidates += 1;
    if (candidate.overallScore !== null) {
      existing.completed += 1;
      existing.totalScore += candidate.overallScore;
      if (candidate.overallScore >= 70) {
        existing.passed += 1;
      }
    }

    roleMap.set(role, existing);
  });

  const performanceByRole = Array.from(roleMap.entries())
    .map(([role, data]) => ({
      role: formatRole(role),
      candidates: data.candidates,
      avgScore: data.completed > 0 ? Math.round(data.totalScore / data.completed) : 0,
      passRate: data.completed > 0 ? data.passed / data.completed : 0,
    }))
    .sort((a, b) => b.candidates - a.candidates);

  return performanceByRole;
}

/**
 * Format role name for display
 */
function formatRole(role: string): string {
  const roleMap: Record<string, string> = {
    backend: 'Backend',
    frontend: 'Frontend',
    fullstack: 'Full Stack',
    ml: 'ML/AI',
    devops: 'DevOps',
    mobile: 'Mobile',
    data: 'Data',
  };

  return roleMap[role.toLowerCase()] || role;
}

/**
 * Get comprehensive analytics overview
 */
export async function getAnalyticsOverview(
  organizationId: string,
  dateRangePreset: string = 'last_30_days'
) {
  const dateRange = parseDateRange(dateRangePreset);

  const [kpis, trendData, performanceByRole] = await Promise.all([
    calculateDashboardKPIs(organizationId, dateRange),
    calculateTrendData(organizationId, dateRange),
    calculatePerformanceByRole(organizationId, dateRange),
  ]);

  return {
    kpis,
    trendData,
    performanceByRole,
    dateRange: {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    },
  };
}

/**
 * Calculate candidate list with analytics data
 */
export async function getCandidateAnalytics(
  organizationId: string,
  filters?: {
    assessmentId?: string;
    status?: string;
    dateRange?: DateRangeConfig;
  }
) {
  const where: Prisma.CandidateWhereInput = {
    organizationId,
    isPreview: false,
  };

  if (filters?.assessmentId) {
    where.assessmentId = filters.assessmentId;
  }

  if (filters?.status) {
    where.status = filters.status as any;
  }

  if (filters?.dateRange) {
    where.createdAt = {
      gte: filters.dateRange.start,
      lte: filters.dateRange.end,
    };
  }

  const candidates = await prisma.candidate.findMany({
    where,
    include: {
      assessment: {
        select: {
          title: true,
          role: true,
          seniority: true,
        },
      },
      sessionRecording: {
        include: {
          claudeInteractions: true,
          testResults: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return candidates.map((candidate) => {
    const sessionRecording = candidate.sessionRecording;
    const claudeInteractions = sessionRecording?.claudeInteractions || [];
    const testResults = sessionRecording?.testResults || [];

    const totalTests = testResults.reduce((sum, t) => sum + (t.total || 0), 0);
    const passedTests = testResults.reduce((sum, t) => sum + (t.passed || 0), 0);

    return {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      role: candidate.assessment.role,
      seniority: candidate.assessment.seniority,
      status: candidate.status,
      assessmentTitle: candidate.assessment.title,

      // Scores
      overallScore: candidate.overallScore,
      codingScore: candidate.codingScore,
      problemSolvingScore: candidate.problemSolvingScore,

      // Performance
      completedAt: candidate.completedAt?.toISOString(),
      startedAt: candidate.startedAt?.toISOString(),
      invitedAt: candidate.invitedAt.toISOString(),

      // AI Usage
      claudeInteractions: claudeInteractions.length,
      testsPassed: passedTests,
      testsTotal: totalTests,

      // Timestamps
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    };
  });
}

/**
 * Calculate pipeline funnel metrics
 */
export async function calculatePipelineFunnel(
  organizationId: string,
  dateRange: DateRangeConfig
) {
  const candidates = await prisma.candidate.findMany({
    where: {
      organizationId,
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      isPreview: false,
    },
  });

  const total = candidates.length;
  const started = candidates.filter((c) => c.startedAt !== null).length;
  const completed = candidates.filter((c) => c.completedAt !== null).length;
  const passed = candidates.filter(
    (c) => c.overallScore !== null && c.overallScore >= 70
  ).length;

  const stages = [
    {
      name: 'Invited',
      count: total,
      percentage: 100,
      conversionToNext: total > 0 ? started / total : 0,
      avgDaysInStage: 1,
    },
    {
      name: 'Started',
      count: started,
      percentage: total > 0 ? (started / total) * 100 : 0,
      conversionToNext: started > 0 ? completed / started : 0,
      avgDaysInStage: 0,
    },
    {
      name: 'Completed',
      count: completed,
      percentage: total > 0 ? (completed / total) * 100 : 0,
      conversionToNext: completed > 0 ? passed / completed : 0,
      avgDaysInStage: 1,
    },
    {
      name: 'Passed',
      count: passed,
      percentage: total > 0 ? (passed / total) * 100 : 0,
      avgDaysInStage: 0,
    },
  ];

  return {
    stages,
    overallConversion: total > 0 ? passed / total : 0,
  };
}
