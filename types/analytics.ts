/**
 * Analytics and Metrics Types for HR/HM Dashboard
 */

import { Role, SeniorityLevel, AssessmentConfig } from "./assessment";

/**
 * Candidate status throughout the hiring pipeline
 */
export type CandidateStatus =
  | "invited"
  | "assessment_sent"
  | "assessment_started"
  | "assessment_in_progress"
  | "assessment_completed"
  | "under_review"
  | "phone_screen_scheduled"
  | "phone_screen_completed"
  | "technical_interview_scheduled"
  | "technical_interview_completed"
  | "final_round"
  | "offer_sent"
  | "offer_accepted"
  | "hired"
  | "rejected"
  | "withdrawn";

export type PipelineStage =
  | "sourcing"
  | "screening"
  | "assessment"
  | "interview"
  | "decision"
  | "offer"
  | "closed";

/**
 * Complete candidate profile with assessment results
 */
export interface CandidateProfile {
  // Basic Info
  id: string;
  name: string;
  email: string;
  appliedRole: Role;
  targetSeniority: SeniorityLevel;

  // Pipeline Tracking
  status: CandidateStatus;
  stage: PipelineStage;
  assignedRecruiter?: string;
  assignedHM?: string;

  // Assessment Results
  assessmentId?: string;
  sessionId?: string;
  assessmentCompleted: boolean;

  // Scores
  overallScore?: number; // 0-100
  technicalScore?: number;
  aiCollaborationScore?: number;
  codeQualityScore?: number;
  problemSolvingScore?: number;

  // Quick Insights
  topStrengths: string[];
  areasForImprovement: string[];
  redFlags: Flag[];
  greenFlags: Flag[];

  // Performance
  timeUsed?: number; // minutes
  timeAllocated?: number;
  completionRate?: number; // 0-1
  problemsSolved?: number;
  problemsAttempted?: number;
  testsPassed?: number;
  testsFailed?: number;

  // AI Usage
  claudeInteractions?: number;
  avgPromptQuality?: number; // 1-5
  aiAcceptanceRate?: number; // 0-1
  aiUsagePattern?: "goal-oriented" | "trial-and-error" | "copy-paste" | "ai-avoidant";

  // Timeline
  appliedAt: string;
  invitedAt?: string;
  assessmentStartedAt?: string;
  assessmentCompletedAt?: string;
  lastActivityAt: string;
}

/**
 * Red flags and green flags
 */
export interface Flag {
  type: "technical" | "behavioral" | "ai_usage" | "code_quality";
  severity?: "low" | "medium" | "high";
  description: string;
  evidence?: string; // link to session timestamp or code
}

/**
 * Dashboard KPIs (Key Performance Indicators)
 */
export interface DashboardKPIs {
  // Overview Metrics
  activeAssessments: KPI;
  pendingReview: KPI;
  completedThisMonth: KPI;
  averageScore: KPI;
  creditsRemaining: KPI;

  // Pipeline Health
  completionRate: KPI;
  passRate: KPI;
  timeToHire: KPI;
  offerAcceptanceRate: KPI;

  // AI-Specific
  avgAIProficiency: KPI;
  candidatesUsingAI: KPI;
}

export interface KPI {
  value: number | string;
  label: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    percentage: number;
    comparison: string; // e.g., "vs last month"
  };
  status?: "good" | "warning" | "critical";
}

/**
 * Funnel/Pipeline conversion metrics
 */
export interface PipelineFunnel {
  stages: FunnelStage[];
  overallConversion: number; // 0-1
}

export interface FunnelStage {
  name: string;
  count: number;
  percentage: number;
  conversionToNext?: number; // 0-1
  avgDaysInStage: number;
}

/**
 * Assessment effectiveness metrics
 */
export interface AssessmentAnalytics {
  assessmentId: string;
  assessmentName: string;

  // Usage Stats
  totalInvited: number;
  totalStarted: number;
  totalCompleted: number;
  totalPassed: number;

  // Quality Metrics
  completionRate: number; // 0-1
  passRate: number; // 0-1
  avgScore: number;
  scoreDistribution: ScoreDistribution;

  // Timing
  avgTimeToComplete: number; // minutes
  estimatedDuration: number;

  // AI Metrics
  avgAIInteractions: number;
  avgPromptQuality: number;

  // Effectiveness
  candidateExperienceScore?: number; // NPS or 1-10
  predictiveValidity?: number; // correlation coefficient
}

export interface ScoreDistribution {
  ranges: Array<{
    min: number;
    max: number;
    count: number;
    percentage: number;
  }>;
  mean: number;
  median: number;
  stdDev: number;
}

/**
 * Time-series data for trends
 */
export interface TimeSeriesData {
  period: "day" | "week" | "month" | "quarter";
  dataPoints: Array<{
    date: string;
    value: number;
    label?: string;
  }>;
}

/**
 * Candidate comparison data
 */
export interface CandidateComparison {
  candidates: CandidateProfile[];
  metrics: ComparisonMetric[];
}

export interface ComparisonMetric {
  name: string;
  category: "scores" | "performance" | "ai_usage" | "behavior";
  type: "score" | "duration" | "count" | "percentage" | "rating";
  values: Record<string, number | string>; // candidateId -> value
  higherIsBetter: boolean;
  threshold?: {
    excellent: number;
    good: number;
    acceptable: number;
  };
}

/**
 * Scoring rubrics
 */
export interface ScoringRubric {
  overall: number; // 0-100
  breakdown: {
    technical: number;
    aiCollaboration: number;
    codeQuality: number;
    problemSolving: number;
  };
  weights: {
    technical: number;
    aiCollaboration: number;
    codeQuality: number;
    problemSolving: number;
  };
  interpretation: string;
}

/**
 * AI Collaboration scoring
 */
export interface AICollaborationScore {
  overall: number; // 0-100
  components: {
    promptQuality: number;
    appropriateUsage: number;
    suggestionUtilization: number;
    independence: number;
  };
  interpretation: string;
  pattern: "goal-oriented" | "trial-and-error" | "copy-paste" | "ai-avoidant";
}

/**
 * Session analytics for replay insights
 */
export interface SessionAnalytics {
  sessionId: string;

  // Time allocation
  timeBreakdown: {
    coding: number; // percentage
    debugging: number;
    testing: number;
    aiConsultation: number;
    idle: number;
  };

  // Code evolution
  totalEdits: number;
  linesAdded: number;
  linesDeleted: number;
  filesCreated: number;

  // AI usage pattern
  aiInteractionTrend: "increasing" | "decreasing" | "stable";
  aiUsageByPhase: {
    initial: number;
    middle: number;
    final: number;
  };

  // Key moments (auto-detected)
  keyMoments: Array<{
    timestamp: number; // seconds from start
    type: "problem_solved" | "test_passed" | "ai_consultation" | "error_fixed";
    description: string;
  }>;
}

/**
 * Hiring recommendation
 */
export interface HiringRecommendation {
  decision: "strong_yes" | "yes" | "maybe" | "no" | "strong_no";
  confidence: number; // 0-100
  reasoning: string[];
  comparisons: {
    vsTeamAverage: string;
    vsSimilarCandidates: string;
    percentileRank: number;
  };
  nextSteps: string[];
  interviewTopics: string[]; // suggested questions based on weak areas
}

/**
 * Priority actions for dashboard
 */
export interface PriorityAction {
  id: string;
  type: "review_needed" | "stuck_in_stage" | "offer_response" | "schedule_interview";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  count: number;
  actionLabel: string;
  actionUrl: string;
}

/**
 * Dashboard filters
 */
export interface DashboardFilters {
  dateRange: {
    start: string;
    end: string;
    preset?: "today" | "week" | "month" | "quarter" | "year" | "all";
  };
  assessmentIds?: string[];
  roles?: Role[];
  seniorities?: SeniorityLevel[];
  statuses?: CandidateStatus[];
  stages?: PipelineStage[];
  scoreRange?: {
    min: number;
    max: number;
  };
  tags?: string[];
}

/**
 * Source effectiveness (where candidates come from)
 */
export interface SourceEffectiveness {
  source: string; // "LinkedIn", "Referral", "Indeed", etc.
  totalCandidates: number;
  assessmentsCompleted: number;
  passRate: number;
  avgScore: number;
  hires: number;
  costPerHire?: number;
  roi: number; // return on investment
}
