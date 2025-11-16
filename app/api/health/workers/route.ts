import { NextResponse } from "next/server";
import { Redis } from "ioredis";
import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * GET /api/health/workers
 * Health check endpoint for worker processes
 *
 * Returns:
 * - Worker queue status
 * - Job counts (waiting, active, completed, failed)
 * - Redis connection status
 * - Overall health status
 *
 * Use for monitoring and alerting
 */
export async function GET() {
  try {
    const startTime = Date.now();

    // Check Redis connection
    const redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });

    let redisHealthy = false;
    try {
      await redis.ping();
      redisHealthy = true;
      redis.disconnect();
    } catch {
      redisHealthy = false;
    }

    if (!redisHealthy) {
      return NextResponse.json(
        {
          status: "unhealthy",
          error: "Redis connection failed",
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
        },
        { status: 503 }
      );
    }

    // Check worker queues
    const interviewQueue = new Queue("interview-agent", {
      connection: { host: "localhost", port: 6379 },
    });

    const evaluationQueue = new Queue("evaluation-agent", {
      connection: { host: "localhost", port: 6379 },
    });

    // Get queue stats
    const [interviewCounts, evaluationCounts] = await Promise.all([
      interviewQueue.getJobCounts("wait", "active", "completed", "failed", "delayed"),
      evaluationQueue.getJobCounts("wait", "active", "completed", "failed", "delayed"),
    ]);

    // Calculate health metrics
    const totalFailed = (interviewCounts.failed || 0) + (evaluationCounts.failed || 0);
    const totalActive = (interviewCounts.active || 0) + (evaluationCounts.active || 0);
    const totalWaiting = (interviewCounts.wait || 0) + (evaluationCounts.wait || 0);

    // Determine overall health status
    let overallStatus = "healthy";
    const warnings: string[] = [];

    if (totalFailed > 10) {
      overallStatus = "degraded";
      warnings.push(`High failure rate: ${totalFailed} failed jobs`);
    }

    if (totalWaiting > 100) {
      overallStatus = "degraded";
      warnings.push(`High queue backlog: ${totalWaiting} waiting jobs`);
    }

    if (totalActive === 0 && totalWaiting > 0) {
      overallStatus = "unhealthy";
      warnings.push("Workers not processing jobs");
    }

    // Close queues
    await interviewQueue.close();
    await evaluationQueue.close();

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      status: overallStatus,
      warnings: warnings.length > 0 ? warnings : undefined,
      timestamp: new Date().toISOString(),
      responseTime,
      redis: {
        connected: redisHealthy,
      },
      queues: {
        interviewAgent: {
          waiting: interviewCounts.wait || 0,
          active: interviewCounts.active || 0,
          completed: interviewCounts.completed || 0,
          failed: interviewCounts.failed || 0,
          delayed: interviewCounts.delayed || 0,
        },
        evaluationAgent: {
          waiting: evaluationCounts.wait || 0,
          active: evaluationCounts.active || 0,
          completed: evaluationCounts.completed || 0,
          failed: evaluationCounts.failed || 0,
          delayed: evaluationCounts.delayed || 0,
        },
      },
      totals: {
        waiting: totalWaiting,
        active: totalActive,
        failed: totalFailed,
      },
    });
  } catch (error) {
    console.error("Worker health check error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
