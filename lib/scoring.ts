/**
 * Scoring and evaluation logic for candidate assessments
 */

import {
  CandidateProfile,
  Flag,
  ScoringRubric,
  AICollaborationScore,
  HiringRecommendation,
} from "@/types/analytics";
import { SeniorityLevel } from "@/types/assessment";

/**
 * Scoring weights by seniority level
 */
export const SCORING_WEIGHTS: Record<
  SeniorityLevel,
  {
    technical: number;
    aiCollaboration: number;
    codeQuality: number;
    problemSolving: number;
  }
> = {
  junior: {
    technical: 0.35,
    aiCollaboration: 0.30, // Higher for juniors
    codeQuality: 0.20,
    problemSolving: 0.15,
  },
  mid: {
    technical: 0.40,
    aiCollaboration: 0.25,
    codeQuality: 0.20,
    problemSolving: 0.15,
  },
  senior: {
    technical: 0.35,
    aiCollaboration: 0.20,
    codeQuality: 0.20,
    problemSolving: 0.25,
  },
  staff: {
    technical: 0.30,
    aiCollaboration: 0.15,
    codeQuality: 0.25,
    problemSolving: 0.30,
  },
  principal: {
    technical: 0.25,
    aiCollaboration: 0.10,
    codeQuality: 0.25,
    problemSolving: 0.40,
  },
};

/**
 * Calculate overall assessment score
 */
export function calculateOverallScore(
  candidate: CandidateProfile,
  seniority: SeniorityLevel
): ScoringRubric {
  const weights = SCORING_WEIGHTS[seniority];

  const technical = candidate.technicalScore || 0;
  const aiCollaboration = candidate.aiCollaborationScore || 0;
  const codeQuality = candidate.codeQualityScore || 0;
  const problemSolving = candidate.problemSolvingScore || 0;

  const overall =
    technical * weights.technical +
    aiCollaboration * weights.aiCollaboration +
    codeQuality * weights.codeQuality +
    problemSolving * weights.problemSolving;

  return {
    overall: Math.round(overall),
    breakdown: {
      technical,
      aiCollaboration,
      codeQuality,
      problemSolving,
    },
    weights,
    interpretation: interpretOverallScore(overall),
  };
}

function interpretOverallScore(score: number): string {
  if (score >= 90) return "Exceptional - Top 10% of candidates";
  if (score >= 80) return "Strong - Recommended for hire";
  if (score >= 70) return "Good - Proceed to next round";
  if (score >= 60) return "Adequate - Conditional proceed";
  if (score >= 50) return "Below expectations";
  return "Not recommended";
}

/**
 * Calculate AI Collaboration Score
 */
export function calculateAICollaborationScore(
  candidate: CandidateProfile
): AICollaborationScore {
  const promptQuality = ((candidate.avgPromptQuality || 0) / 5.0) * 100;

  // Ideal: 8-15 interactions for 60-min assessment
  const timeAllocated = candidate.timeAllocated || 60;
  const idealInteractions = (timeAllocated / 60) * 10;
  const interactions = candidate.claudeInteractions || 0;
  const usageRatio = Math.min(interactions / idealInteractions, 2.0);
  const appropriateUsage = Math.max(0, 100 - Math.abs(100 - usageRatio * 100));

  // Sweet spot: 60-80% acceptance
  const acceptanceRate = (candidate.aiAcceptanceRate || 0) * 100;
  let utilization = 0;
  if (acceptanceRate >= 60 && acceptanceRate <= 80) {
    utilization = 100;
  } else if (acceptanceRate >= 40 && acceptanceRate <= 90) {
    utilization = 75;
  } else {
    utilization = 50;
  }

  // Independence: decreasing trend is better
  const independence = 75; // TODO: Calculate from session data

  const overall =
    promptQuality * 0.25 +
    appropriateUsage * 0.25 +
    utilization * 0.25 +
    independence * 0.25;

  return {
    overall: Math.round(overall),
    components: {
      promptQuality: Math.round(promptQuality),
      appropriateUsage: Math.round(appropriateUsage),
      suggestionUtilization: Math.round(utilization),
      independence: Math.round(independence),
    },
    interpretation: interpretAIScore(overall),
    pattern: candidate.aiUsagePattern || "trial-and-error",
  };
}

function interpretAIScore(score: number): string {
  if (score >= 90) return "Exceptional - Strategic AI collaborator";
  if (score >= 80) return "Strong - Effective AI usage";
  if (score >= 70) return "Good - Competent with AI tools";
  if (score >= 60) return "Adequate - Basic AI collaboration";
  if (score >= 50) return "Developing - Needs AI skills improvement";
  return "Poor - Struggles with AI tools";
}

/**
 * Detect red flags in candidate performance
 */
export function detectRedFlags(candidate: CandidateProfile): Flag[] {
  const flags: Flag[] = [];

  // Technical red flags
  if (
    candidate.testsPassed === 0 &&
    (candidate.testsFailed || 0) > 0
  ) {
    flags.push({
      type: "code_quality",
      severity: "high",
      description: "No tests written or all tests failing",
    });
  }

  if ((candidate.completionRate || 0) < 0.5) {
    flags.push({
      type: "technical",
      severity: "high",
      description: "Incomplete solution - Less than 50% completed",
    });
  }

  if (
    candidate.timeUsed &&
    candidate.timeAllocated &&
    candidate.timeUsed / candidate.timeAllocated > 1.2
  ) {
    flags.push({
      type: "behavioral",
      severity: "medium",
      description: "Unusually slow progress - Used >120% of allocated time",
    });
  }

  // AI usage red flags
  if ((candidate.claudeInteractions || 0) > 30) {
    flags.push({
      type: "ai_usage",
      severity: "medium",
      description: "Excessive AI interactions - May indicate over-reliance",
    });
  }

  if ((candidate.avgPromptQuality || 5) < 2.0) {
    flags.push({
      type: "ai_usage",
      severity: "medium",
      description: "Poor prompt quality - Vague or unclear AI requests",
    });
  }

  if (
    (candidate.aiAcceptanceRate || 0) === 1.0 &&
    (candidate.claudeInteractions || 0) > 5
  ) {
    flags.push({
      type: "ai_usage",
      severity: "medium",
      description:
        "Accepted all AI suggestions without modification - Lacks critical thinking",
    });
  }

  if (
    (candidate.claudeInteractions || 0) < 3 &&
    (candidate.timeUsed || 0) > 30 &&
    (candidate.overallScore || 100) < 70
  ) {
    flags.push({
      type: "ai_usage",
      severity: "low",
      description: "Struggled but didn't use available AI assistance",
    });
  }

  return flags;
}

/**
 * Detect green flags (positive indicators)
 */
export function detectGreenFlags(candidate: CandidateProfile): Flag[] {
  const flags: Flag[] = [];

  // Code quality green flags
  const testPassRate =
    (candidate.testsPassed || 0) /
    ((candidate.testsPassed || 0) + (candidate.testsFailed || 0) || 1);
  if (testPassRate > 0.9) {
    flags.push({
      type: "code_quality",
      description: "Comprehensive test coverage with high pass rate",
    });
  }

  // Performance green flags
  if (
    candidate.timeUsed &&
    candidate.timeAllocated &&
    candidate.timeUsed / candidate.timeAllocated < 0.7 &&
    (candidate.completionRate || 0) > 0.9
  ) {
    flags.push({
      type: "behavioral",
      description: "Fast completion with high quality - Efficient problem solver",
    });
  }

  // AI collaboration green flags
  if ((candidate.avgPromptQuality || 0) > 4.0) {
    flags.push({
      type: "ai_usage",
      description: "Excellent prompt engineering skills - Clear, specific requests",
    });
  }

  const interactions = candidate.claudeInteractions || 0;
  if (interactions >= 8 && interactions <= 15) {
    flags.push({
      type: "ai_usage",
      description: "Balanced AI usage - Strategic consultation without over-reliance",
    });
  }

  const acceptanceRate = candidate.aiAcceptanceRate || 0;
  if (acceptanceRate >= 0.6 && acceptanceRate <= 0.8) {
    flags.push({
      type: "ai_usage",
      description:
        "Thoughtful AI collaboration - Validates and refines suggestions",
    });
  }

  // Overall performance green flags
  if ((candidate.overallScore || 0) > 85) {
    flags.push({
      type: "technical",
      description: "Top-tier performance - Exceeds expectations",
    });
  }

  return flags;
}

/**
 * Generate hiring recommendation
 */
export function generateHiringRecommendation(
  candidate: CandidateProfile,
  seniority: SeniorityLevel,
  teamAvgScore: number = 70,
  percentileRank: number = 50
): HiringRecommendation {
  const score = candidate.overallScore || 0;
  const redFlags = candidate.redFlags?.length ?? 0;
  const greenFlags = candidate.greenFlags?.length ?? 0;

  // Determine decision
  let decision: HiringRecommendation["decision"];
  let confidence = 0;

  if (score >= 85 && redFlags === 0 && greenFlags >= 3) {
    decision = "strong_yes";
    confidence = 95;
  } else if (score >= 75 && redFlags <= 1) {
    decision = "yes";
    confidence = 80;
  } else if (score >= 65 && redFlags <= 2) {
    decision = "maybe";
    confidence = 60;
  } else if (score >= 50) {
    decision = "no";
    confidence = 70;
  } else {
    decision = "strong_no";
    confidence = 90;
  }

  // Build reasoning
  const reasoning: string[] = [];

  if (score > teamAvgScore + 10) {
    reasoning.push(
      `Significantly above team average (${score} vs ${teamAvgScore})`
    );
  } else if (score > teamAvgScore) {
    reasoning.push(`Above team average (${score} vs ${teamAvgScore})`);
  } else if (score < teamAvgScore - 10) {
    reasoning.push(
      `Significantly below team average (${score} vs ${teamAvgScore})`
    );
  }

  if (greenFlags > 0) {
    reasoning.push(`${greenFlags} positive indicators identified`);
  }

  if (redFlags > 0) {
    reasoning.push(`${redFlags} areas of concern identified`);
  }

  if ((candidate.aiCollaborationScore || 0) > 80) {
    reasoning.push("Strong AI collaboration skills - ready for modern development");
  }

  // Comparisons
  const vsTeamAverage =
    score > teamAvgScore
      ? `+${score - teamAvgScore} points above team average`
      : `${teamAvgScore - score} points below team average`;

  const vsSimilarCandidates =
    percentileRank >= 75
      ? "Top quartile among similar candidates"
      : percentileRank >= 50
      ? "Above median among similar candidates"
      : percentileRank >= 25
      ? "Below median among similar candidates"
      : "Bottom quartile among similar candidates";

  // Next steps
  const nextSteps: string[] = [];
  if (decision === "strong_yes" || decision === "yes") {
    nextSteps.push("Schedule technical interview immediately");
    nextSteps.push("Prepare offer discussion materials");
    nextSteps.push("Check references");
  } else if (decision === "maybe") {
    nextSteps.push("Conduct deeper code review");
    nextSteps.push("Schedule phone screen to address concerns");
    nextSteps.push("Compare against other candidates");
  } else {
    nextSteps.push("Send polite rejection email");
    nextSteps.push("Offer feedback if requested");
  }

  // Interview topics based on weak areas
  const interviewTopics: string[] = [];
  if ((candidate.codeQualityScore || 100) < 70) {
    interviewTopics.push(
      "Testing practices and code quality standards"
    );
  }
  if ((candidate.problemSolvingScore || 100) < 70) {
    interviewTopics.push("Approach to system design and architecture");
  }
  if ((candidate.aiCollaborationScore || 100) < 70) {
    interviewTopics.push("Experience with AI tools in development workflow");
  }
  if (candidate.redFlags.some((f) => f.type === "behavioral")) {
    interviewTopics.push("Work pace and time management strategies");
  }

  return {
    decision,
    confidence,
    reasoning,
    comparisons: {
      vsTeamAverage,
      vsSimilarCandidates,
      percentileRank,
    },
    nextSteps,
    interviewTopics,
  };
}

/**
 * Calculate percentile rank
 */
export function calculatePercentileRank(
  score: number,
  allScores: number[]
): number {
  if (allScores.length === 0) return 50;

  const lowerScores = allScores.filter((s) => s < score).length;
  return Math.round((lowerScores / allScores.length) * 100);
}

/**
 * Prompt quality interpretation
 */
export const PROMPT_QUALITY_RUBRIC = {
  1: {
    label: "Poor",
    description: "Vague, no context, unclear intent",
    examples: ["fix this", "help", "what's wrong?"],
    interpretation: "Struggles with basic communication",
  },
  2: {
    label: "Below Average",
    description: "Basic request, minimal context",
    examples: [
      "How do I make this API call?",
      "This doesn't work, can you help?",
    ],
    interpretation: "Needs improvement in AI collaboration",
  },
  3: {
    label: "Acceptable",
    description: "Clear request with some context",
    examples: [
      "I'm trying to implement user authentication. How should I hash passwords securely in Node.js?",
    ],
    interpretation: "Adequate AI usage for basic tasks",
  },
  4: {
    label: "Good",
    description: "Specific request with relevant context and constraints",
    examples: [
      "I'm building a REST API with Express. I need to implement rate limiting for the /api/users endpoint. Should handle 100 req/min per IP. What's the best approach?",
    ],
    interpretation: "Strong AI collaboration skills",
  },
  5: {
    label: "Excellent",
    description: "Comprehensive context, shows prior research",
    examples: [
      "I'm implementing a distributed cache using Redis. Current architecture: [details]. Need to handle failover. I've considered Redis Sentinel vs Cluster. Given our scale (10k users), which would you recommend and why?",
    ],
    interpretation: "Exceptional AI collaboration",
  },
};
