/**
 * Admin API Types
 */

// Re-export experiment types
export type {
  Experiment,
  ExperimentVariant,
  ExperimentStatus,
  AgentBackend,
  ExperimentResults,
  VariantResults,
  MetricSummary,
} from '../../lib/experiments/types';

// Dashboard types
export interface DashboardStats {
  activeExperiments: number;
  totalAssignments: number;
  avgLatencyClaudeSdk: number;
  avgLatencyLangGraph: number;
  errorRate: number;
  alertsCount: number;
  assignmentsToday: number;
  experimentsThisWeek: number;
}

export interface DashboardExperiment {
  id: string;
  name: string;
  status: string;
  trafficPercentage: number;
  variants: DashboardVariant[];
}

export interface DashboardVariant {
  name: string;
  backend: string;
  requests: number;
  avgLatency: number;
  errorRate: number;
}

// Experiment list types
export interface ExperimentListItem {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  trafficPercentage: number;
  primaryMetric: string;
  startedAt: string | null;
  variants: ExperimentVariantWithMetrics[];
  results: ExperimentResultsSummary | null;
}

export interface ExperimentVariantWithMetrics {
  id: string;
  name: string;
  backend: 'claude-sdk' | 'langgraph';
  weight: number;
  metrics: {
    requests: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
    successRate: number;
    tokenUsage: number;
    completionRate: number;
  };
}

export interface ExperimentResultsSummary {
  winner: string | null;
  confidence: number;
  improvement: string;
  sampleSize: number;
  statisticalPower: number;
}

// Security types
export interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  success: boolean;
}

export interface BlockedIp {
  ip: string;
  reason: string;
  blockedBy: string;
  blockedAt: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Create/Update types
export interface CreateExperimentInput {
  name: string;
  description: string;
  trafficPercentage: number;
  primaryMetric: string;
  variants: {
    name: string;
    backend: 'claude-sdk' | 'langgraph';
    weight: number;
    config?: Record<string, unknown>;
  }[];
}

export interface UpdateExperimentInput {
  name?: string;
  description?: string;
  status?: 'draft' | 'running' | 'paused' | 'completed';
  trafficPercentage?: number;
  primaryMetric?: string;
  variants?: {
    id?: string;
    name: string;
    backend: 'claude-sdk' | 'langgraph';
    weight: number;
    config?: Record<string, unknown>;
  }[];
}

export interface BlockIpInput {
  ip: string;
  reason: string;
}
