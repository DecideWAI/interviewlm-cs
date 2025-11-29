/**
 * Experiment Framework Types
 */

export type AgentBackend = 'claude-sdk' | 'langgraph';

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export type AllocationStrategy = 'random' | 'percentage' | 'user-attribute' | 'sticky';

export interface ExperimentVariant {
  id: string;
  name: string;
  backend: AgentBackend;
  weight: number; // 0-100, percentage allocation
  config: Record<string, unknown>;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: ExperimentStatus;

  // Targeting
  targetAudience: ExperimentTargeting;

  // Variants
  variants: ExperimentVariant[];
  controlVariantId: string; // Which variant is the control (usually claude-sdk)

  // Allocation
  allocationStrategy: AllocationStrategy;
  trafficPercentage: number; // 0-100, what % of eligible traffic enters experiment

  // Metrics
  primaryMetric: string;
  secondaryMetrics: string[];

  // Lifecycle
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  createdBy: string;

  // Results
  results?: ExperimentResults;
}

export interface ExperimentTargeting {
  // User attributes
  userIds?: string[];
  organizationIds?: string[];
  roles?: string[];

  // Session attributes
  assessmentTypes?: string[];
  seniorityLevels?: string[];

  // Feature flags
  featureFlags?: string[];

  // Exclude rules
  excludeUserIds?: string[];
  excludeOrganizationIds?: string[];
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  userId: string;
  sessionId: string;
  assignedAt: Date;
  backend: AgentBackend;
}

export interface ExperimentMetric {
  experimentId: string;
  variantId: string;
  metricName: string;
  value: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ExperimentResults {
  experimentId: string;
  variants: VariantResults[];
  winner?: string;
  confidence: number;
  sampleSize: number;
  analyzedAt: Date;
}

export interface VariantResults {
  variantId: string;
  sampleSize: number;
  metrics: Record<string, MetricSummary>;
}

export interface MetricSummary {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

// Agent request/response types
export interface AgentRequest {
  sessionId: string;
  candidateId: string;
  message: string;
  context?: {
    problemStatement?: string;
    helpfulnessLevel?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  };
}

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  filesModified: string[];
  backend: AgentBackend;
  latencyMs: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  metadata?: Record<string, unknown>;
}
