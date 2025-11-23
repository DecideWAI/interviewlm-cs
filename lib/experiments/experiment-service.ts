/**
 * Experiment Service
 *
 * Core service for managing experiments, assignments, and metrics.
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';
import type {
  Experiment,
  ExperimentVariant,
  ExperimentAssignment,
  ExperimentStatus,
  AgentBackend,
} from './types';

// In-memory cache for experiments (would use Redis in production)
const experimentCache = new Map<string, Experiment>();
const assignmentCache = new Map<string, ExperimentAssignment>();

/**
 * Get Redis client (lazy initialization)
 */
let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

/**
 * Experiment Service
 */
export class ExperimentService {
  private static instance: ExperimentService;

  private constructor() {}

  static getInstance(): ExperimentService {
    if (!ExperimentService.instance) {
      ExperimentService.instance = new ExperimentService();
    }
    return ExperimentService.instance;
  }

  /**
   * Create a new experiment
   */
  async createExperiment(experiment: Omit<Experiment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Experiment> {
    const id = `exp_${crypto.randomUUID()}`;
    const now = new Date();

    const newExperiment: Experiment = {
      ...experiment,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // Store in Redis
    const redis = getRedis();
    await redis.hset('experiments', id, JSON.stringify(newExperiment));
    experimentCache.set(id, newExperiment);

    // Log audit event
    await this.logAuditEvent('experiment.created', {
      experimentId: id,
      name: experiment.name,
      createdBy: experiment.createdBy,
    });

    return newExperiment;
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(id: string): Promise<Experiment | null> {
    // Check cache first
    if (experimentCache.has(id)) {
      return experimentCache.get(id)!;
    }

    // Load from Redis
    const redis = getRedis();
    const data = await redis.hget('experiments', id);
    if (!data) return null;

    const experiment = JSON.parse(data) as Experiment;
    experimentCache.set(id, experiment);
    return experiment;
  }

  /**
   * List all experiments
   */
  async listExperiments(status?: ExperimentStatus): Promise<Experiment[]> {
    const redis = getRedis();
    const allData = await redis.hgetall('experiments');

    const experiments = Object.values(allData)
      .map((data) => JSON.parse(data) as Experiment)
      .filter((exp) => !status || exp.status === status)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return experiments;
  }

  /**
   * Update experiment
   */
  async updateExperiment(id: string, updates: Partial<Experiment>): Promise<Experiment | null> {
    const experiment = await this.getExperiment(id);
    if (!experiment) return null;

    const updatedExperiment: Experiment = {
      ...experiment,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    const redis = getRedis();
    await redis.hset('experiments', id, JSON.stringify(updatedExperiment));
    experimentCache.set(id, updatedExperiment);

    await this.logAuditEvent('experiment.updated', {
      experimentId: id,
      updates: Object.keys(updates),
    });

    return updatedExperiment;
  }

  /**
   * Start an experiment
   */
  async startExperiment(id: string): Promise<Experiment | null> {
    return this.updateExperiment(id, {
      status: 'running',
      startedAt: new Date(),
    });
  }

  /**
   * Pause an experiment
   */
  async pauseExperiment(id: string): Promise<Experiment | null> {
    return this.updateExperiment(id, { status: 'paused' });
  }

  /**
   * Complete an experiment
   */
  async completeExperiment(id: string): Promise<Experiment | null> {
    return this.updateExperiment(id, {
      status: 'completed',
      endedAt: new Date(),
    });
  }

  /**
   * Get or create assignment for a user/session
   */
  async getAssignment(
    experimentId: string,
    userId: string,
    sessionId: string,
  ): Promise<ExperimentAssignment | null> {
    const cacheKey = `${experimentId}:${userId}:${sessionId}`;

    // Check cache first (sticky assignment)
    if (assignmentCache.has(cacheKey)) {
      return assignmentCache.get(cacheKey)!;
    }

    // Check Redis for existing assignment
    const redis = getRedis();
    const existingData = await redis.hget('experiment_assignments', cacheKey);
    if (existingData) {
      const assignment = JSON.parse(existingData) as ExperimentAssignment;
      assignmentCache.set(cacheKey, assignment);
      return assignment;
    }

    // Get experiment
    const experiment = await this.getExperiment(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check if user is eligible
    if (!this.isUserEligible(experiment, userId)) {
      return null;
    }

    // Check traffic percentage
    if (!this.shouldEnterExperiment(experiment, userId)) {
      return null;
    }

    // Assign to variant
    const variant = this.selectVariant(experiment, userId);
    if (!variant) return null;

    const assignment: ExperimentAssignment = {
      experimentId,
      variantId: variant.id,
      userId,
      sessionId,
      assignedAt: new Date(),
      backend: variant.backend,
    };

    // Store assignment
    await redis.hset('experiment_assignments', cacheKey, JSON.stringify(assignment));
    assignmentCache.set(cacheKey, assignment);

    // Log assignment
    await this.logAuditEvent('experiment.assignment', {
      experimentId,
      variantId: variant.id,
      userId,
      sessionId,
      backend: variant.backend,
    });

    return assignment;
  }

  /**
   * Check if user is eligible for experiment
   */
  private isUserEligible(experiment: Experiment, userId: string): boolean {
    const targeting = experiment.targetAudience;

    // Check exclusions first
    if (targeting.excludeUserIds?.includes(userId)) {
      return false;
    }

    // Check inclusions (if specified, user must match)
    if (targeting.userIds && targeting.userIds.length > 0) {
      return targeting.userIds.includes(userId);
    }

    // Default: eligible
    return true;
  }

  /**
   * Check if user should enter experiment based on traffic percentage
   */
  private shouldEnterExperiment(experiment: Experiment, userId: string): boolean {
    // Use consistent hashing for sticky assignment
    const hash = this.hashUserId(userId, experiment.id);
    const bucket = hash % 100;
    return bucket < experiment.trafficPercentage;
  }

  /**
   * Select variant based on allocation strategy
   */
  private selectVariant(experiment: Experiment, userId: string): ExperimentVariant | null {
    const variants = experiment.variants;
    if (variants.length === 0) return null;

    // Use consistent hashing for sticky assignment
    const hash = this.hashUserId(userId, experiment.id + '_variant');
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        return variant;
      }
    }

    // Fallback to last variant
    return variants[variants.length - 1];
  }

  /**
   * Hash user ID for consistent bucketing
   */
  private hashUserId(userId: string, salt: string): number {
    const hash = crypto.createHash('md5').update(userId + salt).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(action: string, data: Record<string, unknown>): Promise<void> {
    const event = {
      action,
      data,
      timestamp: new Date().toISOString(),
    };

    const redis = getRedis();
    await redis.lpush('experiment_audit_log', JSON.stringify(event));
    // Keep last 10000 events
    await redis.ltrim('experiment_audit_log', 0, 9999);

    console.log(`[Experiment] ${action}:`, data);
  }

  /**
   * Get audit log
   */
  async getAuditLog(limit: number = 100): Promise<Array<{ action: string; data: unknown; timestamp: string }>> {
    const redis = getRedis();
    const logs = await redis.lrange('experiment_audit_log', 0, limit - 1);
    return logs.map((log) => JSON.parse(log));
  }
}

// Export singleton instance
export const experimentService = ExperimentService.getInstance();
