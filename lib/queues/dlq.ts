/**
 * Dead Letter Queue (DLQ) Management
 *
 * Handles failed jobs that have exceeded retry limits:
 * - Logs failure details
 * - Stores for manual review
 * - Sends alerts for critical failures
 * - Provides retry mechanisms
 */

import { Queue, Job } from "bullmq";
import { Redis } from "ioredis";
import prisma from "@/lib/prisma";
import { alerting } from "@/lib/services/alerting";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Failed job storage key prefix
const DLQ_KEY_PREFIX = "dlq:";

/**
 * Move failed job to dead letter queue
 */
export async function moveToDeadLetterQueue(
  queueName: string,
  job: Job,
  error: Error
): Promise<void> {
  const redis = new Redis(REDIS_URL);
  try {
    const dlqEntry = {
      jobId: job.id,
      queueName,
      name: job.name,
      data: job.data,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      attemptsMade: job.attemptsMade,
      timestamp: new Date().toISOString(),
      failedAt: Date.now(),
    };

    // Store in Redis with 30-day TTL
    const dlqKey = `${DLQ_KEY_PREFIX}${queueName}:${job.id}`;
    await redis.setex(dlqKey, 30 * 24 * 60 * 60, JSON.stringify(dlqEntry));

    // Add to sorted set for easy retrieval
    await redis.zadd(
      `${DLQ_KEY_PREFIX}${queueName}:index`,
      Date.now(),
      job.id!
    );

    // Log to database for persistence
    await logFailedJob(dlqEntry);

    console.error(`[DLQ] Job ${job.id} moved to dead letter queue:`, {
      queue: queueName,
      jobName: job.name,
      error: error.message,
      attempts: job.attemptsMade,
    });

    // Send alert for critical jobs
    if (isCriticalJob(queueName, job.name)) {
      await sendFailureAlert(dlqEntry);
    }
  } catch (dlqError) {
    console.error("[DLQ] Failed to move job to DLQ:", dlqError);
  } finally {
    redis.disconnect();
  }
}

/**
 * Get failed jobs from dead letter queue
 */
export async function getDeadLetterJobs(
  queueName: string,
  limit: number = 100
): Promise<any[]> {
  const redis = new Redis(REDIS_URL);
  try {
    // Get job IDs from sorted set (most recent first)
    const jobIds = await redis.zrevrange(
      `${DLQ_KEY_PREFIX}${queueName}:index`,
      0,
      limit - 1
    );

    // Fetch job data
    const jobs = await Promise.all(
      jobIds.map(async (jobId) => {
        const data = await redis.get(`${DLQ_KEY_PREFIX}${queueName}:${jobId}`);
        return data ? JSON.parse(data) : null;
      })
    );

    return jobs.filter((job) => job !== null);
  } catch (error) {
    console.error("[DLQ] Failed to get dead letter jobs:", error);
    return [];
  } finally {
    redis.disconnect();
  }
}

/**
 * Retry a job from dead letter queue
 */
export async function retryDeadLetterJob(
  queueName: string,
  jobId: string
): Promise<boolean> {
  const redis = new Redis(REDIS_URL);
  let queue: Queue | null = null;

  try {
    // Get job data from DLQ
    const dlqKey = `${DLQ_KEY_PREFIX}${queueName}:${jobId}`;
    const data = await redis.get(dlqKey);

    if (!data) {
      console.error(`[DLQ] Job ${jobId} not found in DLQ`);
      return false;
    }

    const dlqEntry = JSON.parse(data);

    // Re-add to original queue
    queue = new Queue(queueName, {
      connection: redis,
    });

    await queue.add(dlqEntry.name, dlqEntry.data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });

    // Remove from DLQ
    await redis.del(dlqKey);
    await redis.zrem(`${DLQ_KEY_PREFIX}${queueName}:index`, jobId);

    console.log(`[DLQ] Job ${jobId} retried from DLQ`);

    return true;
  } catch (error) {
    console.error("[DLQ] Failed to retry job:", error);
    return false;
  } finally {
    if (queue) {
      await queue.close();
    }
    redis.disconnect();
  }
}

/**
 * Clear dead letter queue for a specific queue
 */
export async function clearDeadLetterQueue(queueName: string): Promise<number> {
  const redis = new Redis(REDIS_URL);
  try {
    // Get all job IDs
    const jobIds = await redis.zrange(
      `${DLQ_KEY_PREFIX}${queueName}:index`,
      0,
      -1
    );

    // Delete job data
    const deletionPromises = jobIds.map((jobId) =>
      redis.del(`${DLQ_KEY_PREFIX}${queueName}:${jobId}`)
    );

    await Promise.all(deletionPromises);

    // Delete index
    await redis.del(`${DLQ_KEY_PREFIX}${queueName}:index`);

    console.log(`[DLQ] Cleared ${jobIds.length} jobs from DLQ for queue ${queueName}`);

    return jobIds.length;
  } catch (error) {
    console.error("[DLQ] Failed to clear DLQ:", error);
    return 0;
  } finally {
    redis.disconnect();
  }
}

/**
 * Log failed job to database for long-term storage
 */
async function logFailedJob(dlqEntry: any): Promise<void> {
  try {
    // Store failed job in database for historical tracking and analysis
    await prisma.failedJob.create({
      data: {
        jobId: dlqEntry.jobId,
        queueName: dlqEntry.queueName,
        jobName: dlqEntry.name,
        jobData: dlqEntry.data || {},
        error: {
          message: dlqEntry.error?.message || 'Unknown error',
          stack: dlqEntry.error?.stack,
          ...dlqEntry.error,
        },
        errorMessage: dlqEntry.error?.message || 'Unknown error',
        errorStack: dlqEntry.error?.stack,
        attemptsMade: dlqEntry.attemptsMade,
        failedAt: new Date(dlqEntry.timestamp),
      },
    });

    console.log("[DLQ] Failed job logged to database:", {
      jobId: dlqEntry.jobId,
      queue: dlqEntry.queueName,
      error: dlqEntry.error?.message,
    });
  } catch (error) {
    console.error("[DLQ] Failed to log to database:", error);
    // Don't throw - we still want DLQ to work even if database logging fails
  }
}

/**
 * Check if job is critical and requires immediate attention
 */
function isCriticalJob(queueName: string, jobName: string): boolean {
  const criticalJobs = [
    "evaluation-agent", // Evaluation failures affect candidate experience
    "interview-agent", // Interview monitoring is time-sensitive
  ];

  return criticalJobs.includes(queueName) || criticalJobs.includes(jobName);
}

/**
 * Send alert for critical job failure
 */
async function sendFailureAlert(dlqEntry: any): Promise<void> {
  try {
    // Send critical alert via alerting service
    await alerting.critical(
      `Critical Job Failure: ${dlqEntry.queueName}`,
      `Job ${dlqEntry.jobId} (${dlqEntry.name}) failed after ${dlqEntry.attemptsMade} attempts`,
      {
        jobId: dlqEntry.jobId,
        queue: dlqEntry.queueName,
        jobName: dlqEntry.name,
        error: dlqEntry.error.message,
        errorStack: dlqEntry.error.stack,
        attemptsMade: dlqEntry.attemptsMade,
        timestamp: dlqEntry.timestamp,
        failedAt: new Date(dlqEntry.failedAt).toISOString(),
      }
    );
  } catch (error) {
    console.error("[DLQ] Failed to send alert:", error);
  }
}

/**
 * Get DLQ statistics
 */
export async function getDeadLetterStats(): Promise<{
  [queueName: string]: {
    count: number;
    oldestFailure: number | null;
    newestFailure: number | null;
  };
}> {
  const redis = new Redis(REDIS_URL);
  try {
    // Get all DLQ index keys
    const keys = await redis.keys(`${DLQ_KEY_PREFIX}*:index`);

    const stats: any = {};

    for (const key of keys) {
      const queueName = key.replace(`${DLQ_KEY_PREFIX}`, "").replace(":index", "");

      const count = await redis.zcard(key);
      const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
      const newest = await redis.zrevrange(key, 0, 0, "WITHSCORES");

      stats[queueName] = {
        count,
        oldestFailure: oldest[1] ? parseInt(oldest[1]) : null,
        newestFailure: newest[1] ? parseInt(newest[1]) : null,
      };
    }

    return stats;
  } catch (error) {
    console.error("[DLQ] Failed to get stats:", error);
    return {};
  } finally {
    redis.disconnect();
  }
}
