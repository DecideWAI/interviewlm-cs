/**
 * Mock data for assessment detail pages
 */

import { AssessmentConfig } from "@/types/assessment";
import { MOCK_PROBLEM_SEEDS } from "./mock-seeds-data";
import { MOCK_CANDIDATES } from "./mock-analytics-data";

export interface AssessmentTimelineEvent {
  id: string;
  type: "created" | "updated" | "candidate_invited" | "candidate_started" | "candidate_completed" | "status_changed";
  description: string;
  timestamp: string;
  userId?: string;
}

export interface AssessmentWithAnalytics extends AssessmentConfig {
  // Enhanced candidate stats
  candidateStats: {
    total: number;
    invited: number;
    started: number;
    completed: number;
    passed: number;
    failed: number;
    inProgress: number;
  };

  // Performance metrics
  performance: {
    avgScore: number;
    avgTimeToComplete: number; // minutes
    completionRate: number; // 0-1
    passRate: number; // 0-1
    scoreDistribution: {
      range: string;
      count: number;
    }[];
  };

  // AI metrics
  aiMetrics: {
    avgInteractions: number;
    avgPromptQuality: number; // 1-5
    avgAcceptanceRate: number; // 0-1
  };

  // Problem seeds used
  problemSeedIds: string[];

  // Timeline events
  timeline: AssessmentTimelineEvent[];

  // Links to candidates
  candidateIds: string[];
}

export const MOCK_ASSESSMENT_DETAIL: AssessmentWithAnalytics = {
  // Base fields
  id: "assessment-1",
  title: "Senior Full-Stack Developer Assessment",
  description: "Comprehensive assessment for senior full-stack engineering candidates focusing on React, Node.js, and system design skills",
  role: "fullstack",
  seniority: "senior",
  duration: 90,
  createdAt: "2025-01-15T10:00:00Z",
  updatedAt: "2025-01-20T14:00:00Z",
  useTemplate: false,
  aiAssistanceEnabled: true,
  aiMonitoringEnabled: true,
  status: "active",
  createdBy: "you@company.com",
  tier: "medium",

  // Candidate stats
  candidateStats: {
    total: 15,
    invited: 20,
    started: 18,
    completed: 15,
    passed: 11,
    failed: 4,
    inProgress: 3,
  },

  candidates: {
    total: 15,
    completed: 15,
  },

  completionRate: 0.83,

  // Performance metrics
  performance: {
    avgScore: 76,
    avgTimeToComplete: 82,
    completionRate: 0.83,
    passRate: 0.73,
    scoreDistribution: [
      { range: "0-20", count: 0 },
      { range: "20-40", count: 1 },
      { range: "40-60", count: 3 },
      { range: "60-80", count: 7 },
      { range: "80-100", count: 4 },
    ],
  },

  // AI metrics
  aiMetrics: {
    avgInteractions: 18,
    avgPromptQuality: 3.8,
    avgAcceptanceRate: 0.72,
  },

  // Problem seeds
  problemSeedIds: ["seed-1", "seed-4", "seed-6"],

  // Timeline
  timeline: [
    {
      id: "t1",
      type: "created",
      description: "Assessment created",
      timestamp: "2025-01-15T10:00:00Z",
      userId: "you@company.com",
    },
    {
      id: "t2",
      type: "updated",
      description: "Duration increased from 75 to 90 minutes",
      timestamp: "2025-01-16T11:00:00Z",
      userId: "you@company.com",
    },
    {
      id: "t3",
      type: "candidate_invited",
      description: "10 candidates invited",
      timestamp: "2025-01-17T09:00:00Z",
      userId: "you@company.com",
    },
    {
      id: "t4",
      type: "candidate_started",
      description: "Sarah Chen started assessment",
      timestamp: "2025-01-17T14:00:00Z",
    },
    {
      id: "t5",
      type: "candidate_completed",
      description: "Sarah Chen completed (Score: 92)",
      timestamp: "2025-01-17T15:12:00Z",
    },
  ],

  // Candidate IDs
  candidateIds: ["cand-1", "cand-2", "cand-3", "cand-4", "cand-5"],
};

// Multiple assessments for the list view
export const MOCK_ASSESSMENTS: AssessmentConfig[] = [
  {
    id: "assessment-1",
    title: "Senior Full-Stack Developer Assessment",
    description: "Comprehensive full-stack assessment",
    role: "fullstack",
    seniority: "senior",
    duration: 90,
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-20T14:00:00Z",
    useTemplate: false,
    aiAssistanceEnabled: true,
    aiMonitoringEnabled: true,
    status: "active",
    createdBy: "you@company.com",
    tier: "medium",
    candidates: { total: 15, completed: 15 },
    completionRate: 0.83,
  },
  {
    id: "assessment-2",
    title: "Mid-Level Backend Engineer Assessment",
    description: "API development and database skills",
    role: "backend",
    seniority: "mid",
    duration: 60,
    createdAt: "2025-01-10T09:00:00Z",
    updatedAt: "2025-01-10T09:00:00Z",
    useTemplate: true,
    templateId: "backend-mid",
    aiAssistanceEnabled: true,
    aiMonitoringEnabled: true,
    status: "active",
    createdBy: "you@company.com",
    tier: "medium",
    candidates: { total: 8, completed: 6 },
    completionRate: 0.75,
  },
  {
    id: "assessment-3",
    title: "Junior Frontend Developer Assessment",
    description: "React and component development basics",
    role: "frontend",
    seniority: "junior",
    duration: 45,
    createdAt: "2025-01-05T14:00:00Z",
    updatedAt: "2025-01-05T14:00:00Z",
    useTemplate: true,
    templateId: "frontend-junior",
    aiAssistanceEnabled: true,
    aiMonitoringEnabled: false,
    status: "completed",
    createdBy: "sarah@company.com",
    tier: "medium",
    candidates: { total: 12, completed: 12 },
    completionRate: 1.0,
  },
];
