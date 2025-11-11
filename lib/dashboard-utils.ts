/**
 * Dashboard Utilities
 *
 * Calculates pipeline funnel and priority actions from real candidate data
 * Replaces mock data with actual database queries
 */

import { PipelineFunnel, PriorityAction } from "@/types/analytics";

interface CandidateForFunnel {
  id: string;
  status: string;
  invitedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * Calculate pipeline funnel from candidate data
 */
export function calculatePipelineFunnel(
  candidates: CandidateForFunnel[]
): PipelineFunnel {
  const totalInvited = candidates.length;

  // Count candidates by stage
  const started = candidates.filter((c) => c.startedAt !== null).length;
  const completed = candidates.filter((c) => c.completedAt !== null).length;
  const evaluated = candidates.filter((c) => c.status === "EVALUATED").length;
  const hired = candidates.filter((c) => c.status === "HIRED").length;

  // Calculate conversion rates
  const startedConversion = totalInvited > 0 ? started / totalInvited : 0;
  const completedConversion = started > 0 ? completed / started : 0;
  const evaluatedConversion = completed > 0 ? evaluated / completed : 0;
  const hiredConversion = evaluated > 0 ? hired / evaluated : 0;

  // Calculate average days in stage
  const now = Date.now();
  const avgDaysInvitedToStarted =
    started > 0
      ? candidates
          .filter((c) => c.startedAt)
          .reduce((acc, c) => {
            const days =
              (c.startedAt!.getTime() - c.invitedAt.getTime()) /
              (1000 * 60 * 60 * 24);
            return acc + days;
          }, 0) / started
      : 1;

  const avgDaysStartedToCompleted =
    completed > 0
      ? candidates
          .filter((c) => c.completedAt && c.startedAt)
          .reduce((acc, c) => {
            const days =
              (c.completedAt!.getTime() - c.startedAt!.getTime()) /
              (1000 * 60 * 60 * 24);
            return acc + days;
          }, 0) / completed
      : 0;

  return {
    stages: [
      {
        name: "Invited",
        count: totalInvited,
        percentage: 100,
        conversionToNext: startedConversion,
        avgDaysInStage: Math.round(avgDaysInvitedToStarted * 10) / 10,
      },
      {
        name: "Started",
        count: started,
        percentage: Math.round((started / totalInvited) * 100 * 10) / 10,
        conversionToNext: completedConversion,
        avgDaysInStage: Math.round(avgDaysStartedToCompleted * 10) / 10,
      },
      {
        name: "Completed",
        count: completed,
        percentage: Math.round((completed / totalInvited) * 100 * 10) / 10,
        conversionToNext: evaluatedConversion,
        avgDaysInStage: 1, // Typically reviewed within a day
      },
      {
        name: "Evaluated",
        count: evaluated,
        percentage: Math.round((evaluated / totalInvited) * 100 * 10) / 10,
        conversionToNext: hiredConversion,
        avgDaysInStage: 2, // Typically 2 days for hiring decision
      },
      {
        name: "Hired",
        count: hired,
        percentage: Math.round((hired / totalInvited) * 100 * 10) / 10,
        conversionToNext: 1,
        avgDaysInStage: 0,
      },
    ],
    overallConversion: totalInvited > 0 ? hired / totalInvited : 0,
    avgTimeToHire: Math.round(avgDaysInvitedToStarted + avgDaysStartedToCompleted + 3), // +3 for eval + decision
  };
}

/**
 * Generate priority actions from candidate data
 */
export function generatePriorityActions(
  candidates: Array<{
    id: string;
    status: string;
    completedAt: Date | null;
    startedAt: Date | null;
    invitedAt: Date;
  }>
): PriorityAction[] {
  const actions: PriorityAction[] = [];

  // 1. Candidates needing review (completed but not evaluated)
  const needsReview = candidates.filter(
    (c) => c.status === "COMPLETED" && c.completedAt !== null
  );

  if (needsReview.length > 0) {
    actions.push({
      id: "action-review",
      type: "review_needed",
      severity: "high",
      title: "Assessments Awaiting Review",
      description: `${needsReview.length} candidate${
        needsReview.length > 1 ? "s" : ""
      } completed assessments and need review`,
      count: needsReview.length,
      actionLabel: "Review Now",
      actionUrl: "/candidates?status=COMPLETED",
    });
  }

  // 2. Candidates stuck in progress (started >48 hours ago, not completed)
  const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
  const stuckInProgress = candidates.filter(
    (c) =>
      c.status === "IN_PROGRESS" &&
      c.startedAt &&
      c.startedAt.getTime() < twoDaysAgo
  );

  if (stuckInProgress.length > 0) {
    actions.push({
      id: "action-stuck",
      type: "stuck_in_stage",
      severity: "medium",
      title: "Candidates Stuck in Assessment",
      description: `${stuckInProgress.length} candidate${
        stuckInProgress.length > 1 ? "s" : ""
      } have been in assessment for >48 hours`,
      count: stuckInProgress.length,
      actionLabel: "Send Reminder",
      actionUrl: "/candidates?status=IN_PROGRESS&stuck=true",
    });
  }

  // 3. Candidates invited but not started (>72 hours)
  const threeDaysAgo = Date.now() - 72 * 60 * 60 * 1000;
  const invitedNotStarted = candidates.filter(
    (c) =>
      c.status === "INVITED" &&
      !c.startedAt &&
      c.invitedAt.getTime() < threeDaysAgo
  );

  if (invitedNotStarted.length > 0) {
    actions.push({
      id: "action-not-started",
      type: "follow_up",
      severity: "low",
      title: "Invitations Not Started",
      description: `${invitedNotStarted.length} candidate${
        invitedNotStarted.length > 1 ? "s" : ""
      } invited >72 hours ago haven't started`,
      count: invitedNotStarted.length,
      actionLabel: "Send Reminder",
      actionUrl: "/candidates?status=INVITED&not_started=true",
    });
  }

  // 4. Recently hired candidates (within last 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentlyHired = candidates.filter(
    (c) =>
      c.status === "HIRED" &&
      c.completedAt &&
      c.completedAt.getTime() > sevenDaysAgo
  );

  if (recentlyHired.length > 0) {
    actions.push({
      id: "action-hired",
      type: "offer_response",
      severity: "low",
      title: "Recently Hired Candidates",
      description: `${recentlyHired.length} candidate${
        recentlyHired.length > 1 ? "s were" : " was"
      } hired this week - schedule onboarding`,
      count: recentlyHired.length,
      actionLabel: "View Details",
      actionUrl: "/candidates?status=HIRED&recent=true",
    });
  }

  // Sort by severity (high > medium > low)
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return actions.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

/**
 * Calculate overall pipeline health score (0-100)
 */
export function calculatePipelineHealth(funnel: PipelineFunnel): number {
  const weights = {
    startConversion: 0.3, // 30% weight
    completeConversion: 0.3, // 30% weight
    evaluatedConversion: 0.2, // 20% weight
    hiredConversion: 0.2, // 20% weight
  };

  const startConversion = funnel.stages[0].conversionToNext;
  const completeConversion = funnel.stages[1].conversionToNext;
  const evaluatedConversion = funnel.stages[2].conversionToNext;
  const hiredConversion = funnel.stages[3].conversionToNext;

  const score =
    startConversion * weights.startConversion * 100 +
    completeConversion * weights.completeConversion * 100 +
    evaluatedConversion * weights.evaluatedConversion * 100 +
    hiredConversion * weights.hiredConversion * 100;

  return Math.round(score);
}
