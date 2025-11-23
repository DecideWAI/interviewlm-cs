/**
 * Admin Security Features
 *
 * Rate limiting, audit logging, and security monitoring.
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';

// Redis client
let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

// =============================================================================
// Rate Limiting
// =============================================================================

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'auth:login': { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 attempts per 15 min
  'api:experiments': { windowMs: 60 * 1000, maxRequests: 100 }, // 100 per minute
  'api:security': { windowMs: 60 * 1000, maxRequests: 30 }, // 30 per minute
  'api:default': { windowMs: 60 * 1000, maxRequests: 60 }, // 60 per minute
};

export async function checkRateLimit(
  key: string,
  identifier: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const config = RATE_LIMITS[key] || RATE_LIMITS['api:default'];
  const redis = getRedis();

  const rateLimitKey = `ratelimit:${key}:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Remove old entries
  await redis.zremrangebyscore(rateLimitKey, 0, windowStart);

  // Count current requests
  const currentCount = await redis.zcard(rateLimitKey);

  if (currentCount >= config.maxRequests) {
    // Get oldest entry to calculate reset time
    const oldest = await redis.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
    const resetAt = new Date(parseInt(oldest[1] || '0', 10) + config.windowMs);

    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Add current request
  await redis.zadd(rateLimitKey, now, `${now}:${crypto.randomUUID()}`);
  await redis.expire(rateLimitKey, Math.ceil(config.windowMs / 1000));

  return {
    allowed: true,
    remaining: config.maxRequests - currentCount - 1,
    resetAt: new Date(now + config.windowMs),
  };
}

// =============================================================================
// Audit Logging
// =============================================================================

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  userId: string | null;
  userEmail: string | null;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  errorMessage: string | null;
}

export async function logAuditEvent(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
): Promise<void> {
  const redis = getRedis();

  const fullEntry: AuditLogEntry = {
    ...entry,
    id: `audit_${crypto.randomUUID()}`,
    timestamp: new Date(),
  };

  // Store in Redis sorted set (by timestamp)
  await redis.zadd(
    'admin_audit_log',
    fullEntry.timestamp.getTime(),
    JSON.stringify(fullEntry),
  );

  // Store by user for user-specific queries
  if (entry.userId) {
    await redis.zadd(
      `admin_audit_log:user:${entry.userId}`,
      fullEntry.timestamp.getTime(),
      JSON.stringify(fullEntry),
    );
  }

  // Store by resource type
  await redis.zadd(
    `admin_audit_log:resource:${entry.resourceType}`,
    fullEntry.timestamp.getTime(),
    JSON.stringify(fullEntry),
  );

  // Trim old entries (keep 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  await redis.zremrangebyscore('admin_audit_log', 0, thirtyDaysAgo);

  console.log(`[Audit] ${entry.action}: ${entry.resourceType}/${entry.resourceId}`);
}

export async function getAuditLogs(options: {
  userId?: string;
  resourceType?: string;
  startTime?: Date;
  endTime?: Date;
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

  const start = options.startTime?.getTime() || 0;
  const end = options.endTime?.getTime() || Date.now();
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  // Get total count
  const total = await redis.zcount(key, start, end);

  // Get entries (newest first)
  const data = await redis.zrevrangebyscore(
    key,
    end,
    start,
    'LIMIT',
    offset,
    limit,
  );

  const entries = data.map((item) => {
    const parsed = JSON.parse(item);
    return {
      ...parsed,
      timestamp: new Date(parsed.timestamp),
    };
  });

  return { entries, total };
}

// =============================================================================
// Security Alerts
// =============================================================================

export interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
}

export async function createSecurityAlert(
  alert: Omit<SecurityAlert, 'id' | 'createdAt' | 'acknowledged' | 'acknowledgedBy' | 'acknowledgedAt'>,
): Promise<SecurityAlert> {
  const redis = getRedis();

  const fullAlert: SecurityAlert = {
    ...alert,
    id: `alert_${crypto.randomUUID()}`,
    createdAt: new Date(),
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
  };

  await redis.hset('security_alerts', fullAlert.id, JSON.stringify(fullAlert));

  // Store in priority queue
  const priorityScore = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[alert.severity];

  await redis.zadd(
    'security_alerts:unacknowledged',
    priorityScore * 1000000000 + fullAlert.createdAt.getTime(),
    fullAlert.id,
  );

  console.log(`[Security Alert] ${alert.severity.toUpperCase()}: ${alert.message}`);

  return fullAlert;
}

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
          createdAt: new Date(parsed.createdAt),
          acknowledgedAt: parsed.acknowledgedAt ? new Date(parsed.acknowledgedAt) : null,
        });
      }
    }
  }

  return alerts;
}

export async function acknowledgeAlert(
  alertId: string,
  userId: string,
): Promise<void> {
  const redis = getRedis();

  const data = await redis.hget('security_alerts', alertId);
  if (!data) {
    throw new Error('Alert not found');
  }

  const alert = JSON.parse(data);
  alert.acknowledged = true;
  alert.acknowledgedBy = userId;
  alert.acknowledgedAt = new Date();

  await redis.hset('security_alerts', alertId, JSON.stringify(alert));
  await redis.zrem('security_alerts:unacknowledged', alertId);

  await logAuditEvent({
    action: 'security_alert.acknowledged',
    userId,
    userEmail: null,
    resourceType: 'security_alert',
    resourceId: alertId,
    details: { severity: alert.severity, type: alert.type },
    ipAddress: null,
    userAgent: null,
    success: true,
    errorMessage: null,
  });
}

// =============================================================================
// IP Blocking
// =============================================================================

export async function isIpBlocked(ip: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.sismember('blocked_ips', ip)) === 1;
}

export async function blockIp(
  ip: string,
  reason: string,
  blockedBy: string,
): Promise<void> {
  const redis = getRedis();

  await redis.sadd('blocked_ips', ip);
  await redis.hset('blocked_ips_info', ip, JSON.stringify({
    reason,
    blockedBy,
    blockedAt: new Date(),
  }));

  await logAuditEvent({
    action: 'ip.blocked',
    userId: blockedBy,
    userEmail: null,
    resourceType: 'ip_address',
    resourceId: ip,
    details: { reason },
    ipAddress: null,
    userAgent: null,
    success: true,
    errorMessage: null,
  });
}

export async function unblockIp(ip: string, unblockedBy: string): Promise<void> {
  const redis = getRedis();

  await redis.srem('blocked_ips', ip);
  await redis.hdel('blocked_ips_info', ip);

  await logAuditEvent({
    action: 'ip.unblocked',
    userId: unblockedBy,
    userEmail: null,
    resourceType: 'ip_address',
    resourceId: ip,
    details: {},
    ipAddress: null,
    userAgent: null,
    success: true,
    errorMessage: null,
  });
}

export async function getBlockedIps(): Promise<Array<{
  ip: string;
  reason: string;
  blockedBy: string;
  blockedAt: Date;
}>> {
  const redis = getRedis();

  const ips = await redis.smembers('blocked_ips');
  const result: Array<{ ip: string; reason: string; blockedBy: string; blockedAt: Date }> = [];

  for (const ip of ips) {
    const info = await redis.hget('blocked_ips_info', ip);
    if (info) {
      const parsed = JSON.parse(info);
      result.push({
        ip,
        reason: parsed.reason,
        blockedBy: parsed.blockedBy,
        blockedAt: new Date(parsed.blockedAt),
      });
    }
  }

  return result;
}
