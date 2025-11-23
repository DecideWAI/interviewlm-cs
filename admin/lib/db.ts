/**
 * Database/Service Layer for Admin API
 *
 * This module provides data access functions that connect to
 * the experiment service and Redis for security features.
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';
import type {
  DashboardStats,
  DashboardExperiment,
  ExperimentListItem,
  ExperimentVariantWithMetrics,
  SecurityAlert,
  AuditLogEntry,
  BlockedIp,
  CreateExperimentInput,
  UpdateExperimentInput,
} from './types';

// =============================================================================
// Redis Client
// =============================================================================

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

// =============================================================================
// Experiments Data Layer
// =============================================================================

export async function getDashboardStats(): Promise<DashboardStats> {
  const redis = getRedis();

  // Get experiment counts from Redis
  const experimentIds = await redis.smembers('experiments:active');
  const activeCount = experimentIds.length;

  // Get assignment count
  const totalAssignments = parseInt(await redis.get('experiments:total_assignments') || '0', 10);
  const assignmentsToday = parseInt(await redis.get('experiments:assignments_today') || '0', 10);

  // Get latency metrics
  const claudeLatencies = await redis.lrange('metrics:latency:claude-sdk', -1000, -1);
  const langGraphLatencies = await redis.lrange('metrics:latency:langgraph', -1000, -1);

  const avgLatencyClaudeSdk = claudeLatencies.length > 0
    ? Math.round(claudeLatencies.reduce((a, b) => a + parseInt(b, 10), 0) / claudeLatencies.length)
    : 0;

  const avgLatencyLangGraph = langGraphLatencies.length > 0
    ? Math.round(langGraphLatencies.reduce((a, b) => a + parseInt(b, 10), 0) / langGraphLatencies.length)
    : 0;

  // Get error rate
  const totalRequests = parseInt(await redis.get('metrics:total_requests') || '1', 10);
  const totalErrors = parseInt(await redis.get('metrics:total_errors') || '0', 10);
  const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

  // Get unacknowledged alerts count
  const alertsCount = await redis.zcard('security_alerts:unacknowledged');

  // Get experiments created this week
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const experimentsThisWeek = await redis.zcount('experiments:created', weekAgo, '+inf');

  return {
    activeExperiments: activeCount,
    totalAssignments,
    avgLatencyClaudeSdk,
    avgLatencyLangGraph,
    errorRate,
    alertsCount,
    assignmentsToday,
    experimentsThisWeek,
  };
}

export async function getDashboardExperiments(): Promise<DashboardExperiment[]> {
  const redis = getRedis();

  const experimentIds = await redis.smembers('experiments:active');
  const experiments: DashboardExperiment[] = [];

  for (const id of experimentIds.slice(0, 5)) {
    const data = await redis.hget('experiments', id);
    if (data) {
      const exp = JSON.parse(data);
      const variants: DashboardExperiment['variants'] = [];

      for (const variant of exp.variants || []) {
        const requests = parseInt(await redis.get(`experiments:${id}:variant:${variant.id}:requests`) || '0', 10);
        const latencySum = parseInt(await redis.get(`experiments:${id}:variant:${variant.id}:latency_sum`) || '0', 10);
        const avgLatency = requests > 0 ? Math.round(latencySum / requests) : 0;
        const errors = parseInt(await redis.get(`experiments:${id}:variant:${variant.id}:errors`) || '0', 10);

        variants.push({
          name: variant.name,
          backend: variant.backend,
          requests,
          avgLatency,
          errorRate: requests > 0 ? errors / requests : 0,
        });
      }

      experiments.push({
        id: exp.id,
        name: exp.name,
        status: exp.status,
        trafficPercentage: exp.trafficPercentage,
        variants,
      });
    }
  }

  return experiments;
}

export async function getExperiments(filter?: string): Promise<ExperimentListItem[]> {
  const redis = getRedis();

  let experimentIds: string[];

  if (filter && filter !== 'all') {
    experimentIds = await redis.smembers(`experiments:status:${filter}`);
  } else {
    experimentIds = await redis.smembers('experiments:all');
  }

  const experiments: ExperimentListItem[] = [];

  for (const id of experimentIds) {
    const data = await redis.hget('experiments', id);
    if (data) {
      const exp = JSON.parse(data);
      const variants = await getExperimentVariantsWithMetrics(id, exp.variants || []);
      const results = await getExperimentResults(id);

      experiments.push({
        id: exp.id,
        name: exp.name,
        description: exp.description,
        status: exp.status,
        trafficPercentage: exp.trafficPercentage,
        primaryMetric: exp.primaryMetric,
        startedAt: exp.startedAt,
        variants,
        results,
      });
    }
  }

  return experiments;
}

export async function getExperiment(id: string): Promise<ExperimentListItem | null> {
  const redis = getRedis();

  const data = await redis.hget('experiments', id);
  if (!data) return null;

  const exp = JSON.parse(data);
  const variants = await getExperimentVariantsWithMetrics(id, exp.variants || []);
  const results = await getExperimentResults(id);

  return {
    id: exp.id,
    name: exp.name,
    description: exp.description,
    status: exp.status,
    trafficPercentage: exp.trafficPercentage,
    primaryMetric: exp.primaryMetric,
    startedAt: exp.startedAt,
    variants,
    results,
  };
}

async function getExperimentVariantsWithMetrics(
  experimentId: string,
  variants: Array<{ id: string; name: string; backend: string; weight: number }>,
): Promise<ExperimentVariantWithMetrics[]> {
  const redis = getRedis();
  const result: ExperimentVariantWithMetrics[] = [];

  for (const variant of variants) {
    const requests = parseInt(await redis.get(`experiments:${experimentId}:variant:${variant.id}:requests`) || '0', 10);
    const latencySum = parseInt(await redis.get(`experiments:${experimentId}:variant:${variant.id}:latency_sum`) || '0', 10);
    const errors = parseInt(await redis.get(`experiments:${experimentId}:variant:${variant.id}:errors`) || '0', 10);
    const tokenUsage = parseInt(await redis.get(`experiments:${experimentId}:variant:${variant.id}:tokens`) || '0', 10);
    const completions = parseInt(await redis.get(`experiments:${experimentId}:variant:${variant.id}:completions`) || '0', 10);

    // Get percentile latencies from sorted set
    const latencies = await redis.zrange(`experiments:${experimentId}:variant:${variant.id}:latencies`, 0, -1);
    const sortedLatencies = latencies.map(l => parseInt(l, 10)).sort((a, b) => a - b);

    const p50Index = Math.floor(sortedLatencies.length * 0.5);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    result.push({
      id: variant.id,
      name: variant.name,
      backend: variant.backend as 'claude-sdk' | 'langgraph',
      weight: variant.weight,
      metrics: {
        requests,
        avgLatency: requests > 0 ? Math.round(latencySum / requests) : 0,
        p50Latency: sortedLatencies[p50Index] || 0,
        p95Latency: sortedLatencies[p95Index] || 0,
        p99Latency: sortedLatencies[p99Index] || 0,
        errorRate: requests > 0 ? errors / requests : 0,
        successRate: requests > 0 ? (requests - errors) / requests : 1,
        tokenUsage,
        completionRate: requests > 0 ? completions / requests : 0,
      },
    });
  }

  return result;
}

async function getExperimentResults(experimentId: string): Promise<ExperimentListItem['results']> {
  const redis = getRedis();

  const data = await redis.hget('experiments:results', experimentId);
  if (!data) return null;

  const results = JSON.parse(data);
  return {
    winner: results.winner,
    confidence: results.confidence,
    improvement: results.improvement,
    sampleSize: results.sampleSize,
    statisticalPower: results.statisticalPower,
  };
}

export async function createExperiment(input: CreateExperimentInput, userId: string): Promise<ExperimentListItem> {
  const redis = getRedis();

  const id = `exp_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const experiment = {
    id,
    name: input.name,
    description: input.description,
    status: 'draft',
    trafficPercentage: input.trafficPercentage,
    primaryMetric: input.primaryMetric,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    variants: input.variants.map((v, i) => ({
      id: `var_${crypto.randomUUID().slice(0, 8)}`,
      name: v.name,
      backend: v.backend,
      weight: v.weight,
      config: v.config || {},
    })),
  };

  // Store experiment
  await redis.hset('experiments', id, JSON.stringify(experiment));
  await redis.sadd('experiments:all', id);
  await redis.sadd('experiments:status:draft', id);
  await redis.zadd('experiments:created', Date.now(), id);

  // Log audit event
  await logAuditEvent({
    action: 'experiment.created',
    userId,
    resourceType: 'experiment',
    resourceId: id,
    details: { name: input.name },
    success: true,
  });

  return getExperiment(id) as Promise<ExperimentListItem>;
}

export async function updateExperiment(
  id: string,
  input: UpdateExperimentInput,
  userId: string,
): Promise<ExperimentListItem | null> {
  const redis = getRedis();

  const existing = await redis.hget('experiments', id);
  if (!existing) return null;

  const experiment = JSON.parse(existing);
  const oldStatus = experiment.status;

  // Update fields
  if (input.name !== undefined) experiment.name = input.name;
  if (input.description !== undefined) experiment.description = input.description;
  if (input.trafficPercentage !== undefined) experiment.trafficPercentage = input.trafficPercentage;
  if (input.primaryMetric !== undefined) experiment.primaryMetric = input.primaryMetric;
  if (input.status !== undefined) {
    experiment.status = input.status;

    // Handle status transitions
    if (input.status === 'running' && !experiment.startedAt) {
      experiment.startedAt = new Date().toISOString();
      await redis.srem('experiments:status:draft', id);
      await redis.sadd('experiments:status:running', id);
      await redis.sadd('experiments:active', id);
    } else if (input.status === 'paused') {
      await redis.srem('experiments:status:running', id);
      await redis.srem('experiments:active', id);
      await redis.sadd('experiments:status:paused', id);
    } else if (input.status === 'completed') {
      experiment.endedAt = new Date().toISOString();
      await redis.srem('experiments:status:running', id);
      await redis.srem('experiments:status:paused', id);
      await redis.srem('experiments:active', id);
      await redis.sadd('experiments:status:completed', id);
    }
  }

  if (input.variants !== undefined) {
    experiment.variants = input.variants.map((v) => ({
      id: v.id || `var_${crypto.randomUUID().slice(0, 8)}`,
      name: v.name,
      backend: v.backend,
      weight: v.weight,
      config: v.config || {},
    }));
  }

  experiment.updatedAt = new Date().toISOString();

  await redis.hset('experiments', id, JSON.stringify(experiment));

  // Log audit event
  await logAuditEvent({
    action: 'experiment.updated',
    userId,
    resourceType: 'experiment',
    resourceId: id,
    details: { changes: input, oldStatus, newStatus: experiment.status },
    success: true,
  });

  return getExperiment(id);
}

export async function deleteExperiment(id: string, userId: string): Promise<boolean> {
  const redis = getRedis();

  const existing = await redis.hget('experiments', id);
  if (!existing) return false;

  const experiment = JSON.parse(existing);

  // Remove from all sets
  await redis.hdel('experiments', id);
  await redis.srem('experiments:all', id);
  await redis.srem('experiments:active', id);
  await redis.srem(`experiments:status:${experiment.status}`, id);
  await redis.zrem('experiments:created', id);

  // Log audit event
  await logAuditEvent({
    action: 'experiment.deleted',
    userId,
    resourceType: 'experiment',
    resourceId: id,
    details: { name: experiment.name },
    success: true,
  });

  return true;
}

// =============================================================================
// Security Data Layer
// =============================================================================

export async function getSecurityAlerts(options: {
  acknowledged?: boolean;
  severity?: string;
  limit?: number;
}): Promise<SecurityAlert[]> {
  const redis = getRedis();

  const key = options.acknowledged === false
    ? 'security_alerts:unacknowledged'
    : 'security_alerts';

  let alertIds: string[];

  if (key === 'security_alerts') {
    alertIds = await redis.hkeys(key);
  } else {
    alertIds = await redis.zrevrange(key, 0, (options.limit || 50) - 1);
  }

  const alerts: SecurityAlert[] = [];

  for (const id of alertIds.slice(0, options.limit || 50)) {
    const data = await redis.hget('security_alerts', id);
    if (data) {
      const parsed = JSON.parse(data);
      if (!options.severity || parsed.severity === options.severity) {
        alerts.push({
          ...parsed,
          createdAt: parsed.createdAt,
          acknowledgedAt: parsed.acknowledgedAt,
        });
      }
    }
  }

  return alerts;
}

export async function acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
  const redis = getRedis();

  const data = await redis.hget('security_alerts', alertId);
  if (!data) return false;

  const alert = JSON.parse(data);
  alert.acknowledged = true;
  alert.acknowledgedBy = userId;
  alert.acknowledgedAt = new Date().toISOString();

  await redis.hset('security_alerts', alertId, JSON.stringify(alert));
  await redis.zrem('security_alerts:unacknowledged', alertId);

  await logAuditEvent({
    action: 'security_alert.acknowledged',
    userId,
    resourceType: 'security_alert',
    resourceId: alertId,
    details: { severity: alert.severity, type: alert.type },
    success: true,
  });

  return true;
}

export async function getAuditLogs(options: {
  userId?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const redis = getRedis();

  let key = 'admin_audit_log';
  if (options.userId) {
    key = `admin_audit_log:user:${options.userId}`;
  } else if (options.resourceType) {
    key = `admin_audit_log:resource:${options.resourceType}`;
  }

  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const total = await redis.zcard(key);

  const data = await redis.zrevrange(key, offset, offset + limit - 1);

  const entries = data.map((item) => {
    const parsed = JSON.parse(item);
    return {
      ...parsed,
      timestamp: parsed.timestamp,
    };
  });

  return { entries, total };
}

export async function getBlockedIps(): Promise<BlockedIp[]> {
  const redis = getRedis();

  const ips = await redis.smembers('blocked_ips');
  const result: BlockedIp[] = [];

  for (const ip of ips) {
    const info = await redis.hget('blocked_ips_info', ip);
    if (info) {
      const parsed = JSON.parse(info);
      result.push({
        ip,
        reason: parsed.reason,
        blockedBy: parsed.blockedBy,
        blockedAt: parsed.blockedAt,
      });
    }
  }

  return result;
}

export async function blockIp(ip: string, reason: string, blockedBy: string): Promise<void> {
  const redis = getRedis();

  await redis.sadd('blocked_ips', ip);
  await redis.hset('blocked_ips_info', ip, JSON.stringify({
    reason,
    blockedBy,
    blockedAt: new Date().toISOString(),
  }));

  await logAuditEvent({
    action: 'ip.blocked',
    userId: blockedBy,
    resourceType: 'ip_address',
    resourceId: ip,
    details: { reason },
    success: true,
  });
}

export async function unblockIp(ip: string, unblockedBy: string): Promise<boolean> {
  const redis = getRedis();

  const exists = await redis.sismember('blocked_ips', ip);
  if (!exists) return false;

  await redis.srem('blocked_ips', ip);
  await redis.hdel('blocked_ips_info', ip);

  await logAuditEvent({
    action: 'ip.unblocked',
    userId: unblockedBy,
    resourceType: 'ip_address',
    resourceId: ip,
    details: {},
    success: true,
  });

  return true;
}

// =============================================================================
// Audit Logging Helper
// =============================================================================

async function logAuditEvent(entry: {
  action: string;
  userId: string | null;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  success: boolean;
}): Promise<void> {
  const redis = getRedis();

  const fullEntry = {
    id: `audit_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...entry,
    userEmail: null, // Would be populated from session
    ipAddress: null, // Would be populated from request
  };

  await redis.zadd(
    'admin_audit_log',
    Date.now(),
    JSON.stringify(fullEntry),
  );

  if (entry.userId) {
    await redis.zadd(
      `admin_audit_log:user:${entry.userId}`,
      Date.now(),
      JSON.stringify(fullEntry),
    );
  }

  await redis.zadd(
    `admin_audit_log:resource:${entry.resourceType}`,
    Date.now(),
    JSON.stringify(fullEntry),
  );

  // Trim old entries (keep 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  await redis.zremrangebyscore('admin_audit_log', 0, thirtyDaysAgo);
}
