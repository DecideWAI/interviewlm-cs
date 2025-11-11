/**
 * Mock actionable insights and recommendations data
 */

export interface ActionableInsight {
  id: string;
  type: "opportunity" | "risk" | "trend" | "anomaly";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  actions: Array<{
    label: string;
    url?: string;
    priority: "immediate" | "this_week" | "this_month";
  }>;
  createdAt: string;
}

export interface OptimizationRecommendation {
  id: string;
  category: "sourcing" | "assessment" | "problem_seed" | "process";
  title: string;
  finding: string;
  recommendation: string;
  expectedImpact: string;
  confidence: number; // 0-100
  priority: "high" | "medium" | "low";
}

export const MOCK_ACTIONABLE_INSIGHTS: ActionableInsight[] = [
  {
    id: "insight-1",
    type: "opportunity",
    severity: "high",
    title: "Employee Referrals Outperforming Other Sources",
    description: "Employee referrals have 57% higher pass rate than LinkedIn (36% vs 23%) and cost 5.6x less per hire ($500 vs $2,800)",
    impact: "Reallocating $10k from LinkedIn to referral program could save $15-20k/month and increase hire quality by 13%",
    actions: [
      { label: "Launch Referral Bonus Program", url: "/settings/referrals", priority: "immediate" },
      { label: "Reduce LinkedIn Budget", url: "/settings/sourcing", priority: "this_week" },
      { label: "View Source Analytics", url: "/analytics/sources", priority: "this_week" },
    ],
    createdAt: "2025-01-25T09:00:00Z",
  },
  {
    id: "insight-2",
    type: "risk",
    severity: "high",
    title: "5 Strong Candidates Awaiting Review (>48 hours)",
    description: "Sarah Chen and 4 others completed assessments with scores >80 but haven't been reviewed. Risk losing them to competitors.",
    impact: "Average time-to-hire increases 3-5 days when review delayed past 48 hours. Offer acceptance rate drops 12%.",
    actions: [
      { label: "Review Now", url: "/candidates?status=assessment_completed&score_min=80", priority: "immediate" },
      { label: "Schedule Interviews", url: "/calendar/bulk-schedule", priority: "immediate" },
      { label: "Enable Auto-Notifications", url: "/settings/alerts", priority: "this_week" },
    ],
    createdAt: "2025-01-25T10:30:00Z",
  },
  {
    id: "insight-3",
    type: "anomaly",
    severity: "medium",
    title: "Senior+ Candidates Struggling with AI Collaboration",
    description: "Candidates with 10+ years experience score 17% lower on AI Collaboration (68 vs 82 for 5-10 year exp). Sample size: 23 candidates.",
    impact: "May be unfairly filtering out strong technical candidates who need AI onboarding. 3 recent rejections worth re-reviewing.",
    actions: [
      { label: "Adjust Scoring Weights", url: "/settings/scoring", priority: "this_week" },
      { label: "Review Recent Rejections", url: "/candidates?rejected=true&experience=10+", priority: "this_week" },
      { label: "Create AI Onboarding Plan", url: "/resources/onboarding", priority: "this_month" },
    ],
    createdAt: "2025-01-24T14:00:00Z",
  },
  {
    id: "insight-4",
    type: "trend",
    severity: "medium",
    title: "Completion Rate Improving After Duration Adjustment",
    description: "After increasing assessment time from 60 to 75 minutes, completion rate improved from 72% to 86% (+14%)",
    impact: "Saving ~$280 per 100 assessments in wasted credits. Candidate satisfaction increased 12.5% (7.2 → 8.1/10)",
    actions: [
      { label: "Document Best Practice", url: "/resources/best-practices", priority: "this_month" },
      { label: "Apply to Other Roles", url: "/assessments/templates", priority: "this_week" },
    ],
    createdAt: "2025-01-23T11:00:00Z",
  },
  {
    id: "insight-5",
    type: "opportunity",
    severity: "low",
    title: "React Component Seed Performing Exceptionally Well",
    description: "React Component Library seed has 90% completion rate, 4.8/5.0 satisfaction, and 0.87 predictive validity (highest)",
    impact: "Creating similar seeds for other frontend topics could improve overall candidate experience and assessment quality",
    actions: [
      { label: "Create Similar Seeds", url: "/problems/seeds/new?template=seed-2", priority: "this_month" },
      { label: "View Seed Analytics", url: "/problems/seeds/seed-2", priority: "this_week" },
    ],
    createdAt: "2025-01-22T16:00:00Z",
  },
];

export const MOCK_OPTIMIZATION_RECOMMENDATIONS: OptimizationRecommendation[] = [
  {
    id: "rec-1",
    category: "problem_seed",
    title: "Microservices Seed Too Difficult",
    finding: "Seed #8 (Microservices Communication) has 62% completion rate vs 85% target and 3.4/5.0 candidate satisfaction",
    recommendation: "Reclassify as 'Staff' level or simplify requirements. Even top performers (90+ overall score) only score 71 on this seed.",
    expectedImpact: "Could recover 6-8% pass rate and reduce candidate frustration",
    confidence: 88,
    priority: "high",
  },
  {
    id: "rec-2",
    category: "assessment",
    title: "Frontend Assessment Duration Optimization",
    finding: "90% of frontend candidates finish in 64 minutes, but current limit is 60 minutes. 25% report feeling rushed.",
    recommendation: "Increase frontend assessment duration to 65 minutes",
    expectedImpact: "Allow 90% of candidates to complete comfortably (vs 75% currently). Minimal cost increase (~8% more time).",
    confidence: 92,
    priority: "medium",
  },
  {
    id: "rec-3",
    category: "sourcing",
    title: "Company Website Underutilized",
    finding: "Company website candidates have 12.0 ROI (vs 2.1 for LinkedIn) but only 15% of total volume",
    recommendation: "Invest in careers page SEO and content marketing to increase organic applications",
    expectedImpact: "Could double organic applicants (45 → 90/month) at near-zero marginal cost. Estimated $5-8k savings monthly.",
    confidence: 75,
    priority: "medium",
  },
  {
    id: "rec-4",
    category: "process",
    title: "Enable Proactive Interview Scheduling",
    finding: "Candidates with predicted scores >85 (based on early progress) have 92% pass rate. Average: 3-5 day delay before scheduling.",
    recommendation: "Auto-notify hiring managers when strong candidates reach 75% completion with high predicted scores",
    expectedImpact: "Reduce time-to-hire by 3-5 days for top candidates. Improve offer acceptance rate by 5-8%.",
    confidence: 84,
    priority: "low",
  },
];

export interface TrendData {
  date: string;
  assessments: number;
  completionRate: number;
  passRate: number;
  avgScore: number;
}

export const MOCK_TREND_DATA: TrendData[] = [
  { date: "2025-01-01", assessments: 28, completionRate: 0.68, passRate: 0.21, avgScore: 72 },
  { date: "2025-01-02", assessments: 32, completionRate: 0.70, passRate: 0.22, avgScore: 73 },
  { date: "2025-01-03", assessments: 25, completionRate: 0.69, passRate: 0.23, avgScore: 74 },
  { date: "2025-01-04", assessments: 18, completionRate: 0.71, passRate: 0.22, avgScore: 73 },
  { date: "2025-01-05", assessments: 15, completionRate: 0.70, passRate: 0.24, avgScore: 75 },
  { date: "2025-01-06", assessments: 38, completionRate: 0.73, passRate: 0.25, avgScore: 76 },
  { date: "2025-01-07", assessments: 42, completionRate: 0.74, passRate: 0.24, avgScore: 75 },
  { date: "2025-01-08", assessments: 45, completionRate: 0.75, passRate: 0.26, avgScore: 77 },
  { date: "2025-01-09", assessments: 48, completionRate: 0.76, passRate: 0.25, avgScore: 76 },
  { date: "2025-01-10", assessments: 50, completionRate: 0.77, passRate: 0.27, avgScore: 78 },
  { date: "2025-01-11", assessments: 35, completionRate: 0.78, passRate: 0.26, avgScore: 77 },
  { date: "2025-01-12", assessments: 30, completionRate: 0.76, passRate: 0.25, avgScore: 76 },
  { date: "2025-01-13", assessments: 52, completionRate: 0.79, passRate: 0.28, avgScore: 79 },
  { date: "2025-01-14", assessments: 55, completionRate: 0.80, passRate: 0.27, avgScore: 78 },
  { date: "2025-01-15", assessments: 58, completionRate: 0.81, passRate: 0.29, avgScore: 80 },
  { date: "2025-01-16", assessments: 60, completionRate: 0.82, passRate: 0.28, avgScore: 79 },
  { date: "2025-01-17", assessments: 48, completionRate: 0.83, passRate: 0.30, avgScore: 81 },
  { date: "2025-01-18", assessments: 42, completionRate: 0.84, passRate: 0.29, avgScore: 80 },
  { date: "2025-01-19", assessments: 38, completionRate: 0.83, passRate: 0.28, avgScore: 79 },
  { date: "2025-01-20", assessments: 62, completionRate: 0.85, passRate: 0.31, avgScore: 82 },
  { date: "2025-01-21", assessments: 65, completionRate: 0.86, passRate: 0.30, avgScore: 81 },
  { date: "2025-01-22", assessments: 68, completionRate: 0.86, passRate: 0.32, avgScore: 83 },
  { date: "2025-01-23", assessments: 70, completionRate: 0.87, passRate: 0.31, avgScore: 82 },
  { date: "2025-01-24", assessments: 72, completionRate: 0.86, passRate: 0.30, avgScore: 81 },
  { date: "2025-01-25", assessments: 45, completionRate: 0.88, passRate: 0.33, avgScore: 84 },
];

export interface PerformanceByRole {
  role: string;
  candidates: number;
  avgScore: number;
  passRate: number;
  completionRate: number;
  aiScore: number;
}

export const MOCK_PERFORMANCE_BY_ROLE: PerformanceByRole[] = [
  { role: "Backend", candidates: 42, avgScore: 78, passRate: 0.28, completionRate: 0.85, aiScore: 82 },
  { role: "Frontend", candidates: 35, avgScore: 72, passRate: 0.18, completionRate: 0.88, aiScore: 86 },
  { role: "Full-Stack", candidates: 28, avgScore: 75, passRate: 0.24, completionRate: 0.83, aiScore: 79 },
  { role: "ML Engineer", candidates: 12, avgScore: 76, passRate: 0.25, completionRate: 0.80, aiScore: 81 },
  { role: "Database", candidates: 8, avgScore: 74, passRate: 0.22, completionRate: 0.82, aiScore: 77 },
];
