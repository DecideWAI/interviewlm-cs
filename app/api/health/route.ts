import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getQueuesHealth } from '@/lib/queues';
import { getIdempotencyManager } from '@/lib/utils/idempotency';
import { getCircuitBreakerManager } from '@/lib/utils/circuit-breaker';

export const dynamic = 'force-dynamic';

/**
 * Health Check Endpoint
 *
 * Comprehensive health monitoring including:
 * - Database connectivity
 * - Redis connectivity
 * - Queue health
 * - Circuit breaker status
 *
 * Used by Docker, Kubernetes, load balancers, and monitoring systems.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // Perform health checks in parallel
    const [dbHealth, redisHealth, queueHealth, cbHealth] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkQueues(),
      checkCircuitBreakers(),
    ]);

    // Determine overall status
    const allHealthy =
      dbHealth.healthy &&
      redisHealth.healthy &&
      queueHealth.healthy &&
      cbHealth.healthy;

    const anyDegraded =
      dbHealth.degraded ||
      redisHealth.degraded ||
      queueHealth.degraded ||
      cbHealth.degraded;

    const overallStatus = allHealthy
      ? 'healthy'
      : anyDegraded
      ? 'degraded'
      : 'unhealthy';

    return NextResponse.json(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        uptime: process.uptime(),
        latency: Date.now() - startTime,
        checks: {
          database: dbHealth,
          redis: redisHealth,
          queues: queueHealth,
          circuitBreakers: cbHealth,
        },
      },
      { status: overallStatus === 'unhealthy' ? 503 : 200 }
    );
  } catch (error) {
    console.error('Health check failed:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

async function checkDatabase() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      healthy: latency < 1000,
      degraded: latency >= 1000,
      status: latency < 1000 ? 'connected' : 'slow',
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      degraded: false,
      status: 'disconnected',
      error: (error as Error).message,
    };
  }
}

async function checkRedis() {
  const start = Date.now();
  try {
    const manager = getIdempotencyManager();
    await manager.checkIdempotency('health:test');
    const latency = Date.now() - start;

    // Also check Modal file storage (Redis-backed)
    const modalConnectionOk = await testModalFileStorage();

    return {
      healthy: latency < 500 && modalConnectionOk,
      degraded: latency >= 500 || !modalConnectionOk,
      status: latency < 500 && modalConnectionOk ? 'connected' : 'slow',
      latency,
      modalFileStorage: modalConnectionOk ? 'operational' : 'unavailable',
    };
  } catch (error) {
    return {
      healthy: false,
      degraded: false,
      status: 'disconnected',
      error: (error as Error).message,
    };
  }
}

async function testModalFileStorage(): Promise<boolean> {
  try {
    const { testConnection } = await import('@/lib/services/modal-redis');
    return await testConnection();
  } catch {
    return false;
  }
}

async function checkQueues() {
  try {
    const health = await getQueuesHealth();
    const totalFailed = Object.values(health).reduce((sum, q) => sum + q.failed, 0);
    const paused = Object.entries(health)
      .filter(([_, q]) => q.isPaused)
      .map(([name]) => name);

    return {
      healthy: totalFailed < 100 && paused.length === 0,
      degraded: totalFailed >= 100 || paused.length > 0,
      status: paused.length > 0 ? 'paused' : totalFailed >= 100 ? 'degraded' : 'operational',
      queues: health,
      failedJobs: totalFailed,
      pausedQueues: paused,
    };
  } catch (error) {
    return {
      healthy: false,
      degraded: false,
      status: 'error',
      error: (error as Error).message,
    };
  }
}

async function checkCircuitBreakers() {
  try {
    const manager = getCircuitBreakerManager();
    const metrics = manager.getAllMetrics();

    const open = Object.entries(metrics)
      .filter(([_, m]) => m.state === 'OPEN')
      .map(([name]) => name);

    const halfOpen = Object.entries(metrics)
      .filter(([_, m]) => m.state === 'HALF_OPEN')
      .map(([name]) => name);

    return {
      healthy: open.length === 0,
      degraded: halfOpen.length > 0,
      status: open.length > 0 ? 'open' : halfOpen.length > 0 ? 'half-open' : 'closed',
      breakers: metrics,
      openCircuits: open,
      halfOpenCircuits: halfOpen,
    };
  } catch (error) {
    return {
      healthy: false,
      degraded: false,
      status: 'error',
      error: (error as Error).message,
    };
  }
}
