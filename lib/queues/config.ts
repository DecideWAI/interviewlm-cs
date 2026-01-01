/**
 * BullMQ Queue Configuration
 *
 * Centralized configuration for all BullMQ queues and Redis connection.
 * Provides type-safe queue creation and management.
 */

import { Queue, QueueOptions, ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES, type QueueName } from '../types/events';

/**
 * Parse Redis URL into connection options
 * Supports both redis:// and rediss:// (TLS) protocols
 */
function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const isTls = parsed.protocol === 'rediss:';

  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || (isTls ? '6378' : '6379'), 10),
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname?.slice(1) || '0', 10),
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // BullMQ handles this
    ...(isTls && {
      tls: {
        // For GCP Memorystore, we need to skip certificate validation
        // as it uses self-signed certs
        rejectUnauthorized: false,
      },
    }),
    retryStrategy: (times: number) => {
      // Exponential backoff: 2^times * 100ms, max 3 seconds
      const delay = Math.min(Math.pow(2, times) * 100, 3000);
      console.log(`Redis connection retry ${times}, waiting ${delay}ms`);
      return delay;
    },
  };
}

/**
 * Redis connection configuration
 * Uses REDIS_URL if available, otherwise falls back to individual env vars
 */
export const redisConnection: ConnectionOptions = process.env.REDIS_URL
  ? parseRedisUrl(process.env.REDIS_URL)
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // BullMQ handles this
      retryStrategy: (times: number) => {
        // Exponential backoff: 2^times * 100ms, max 3 seconds
        const delay = Math.min(Math.pow(2, times) * 100, 3000);
        console.log(`Redis connection retry ${times}, waiting ${delay}ms`);
        return delay;
      },
    };

/**
 * Default queue options
 * Applied to all queues unless overridden
 */
export const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 1000, // Start with 1 second, then 2s, 4s, 8s...
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs for debugging
      age: 24 * 3600, // Remove completed jobs after 24 hours
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs for debugging
    },
  },
};

/**
 * Queue-specific options
 * Override defaults for specific queues
 */
export const queueOptionsOverrides: Partial<Record<QueueName, Partial<QueueOptions>>> = {
  [QUEUE_NAMES.EVALUATION]: {
    defaultJobOptions: {
      attempts: 5, // Evaluation is critical, retry more
      priority: 1, // Higher priority
    },
  },

  [QUEUE_NAMES.NOTIFICATION]: {
    defaultJobOptions: {
      attempts: 5, // Don't lose notifications
      backoff: {
        type: 'exponential',
        delay: 2000, // Wait longer between retries (email rate limits)
      },
    },
  },
};

/**
 * Queue instances
 * Cached to avoid creating multiple instances
 */
const queues = new Map<QueueName, Queue>();

/**
 * Get or create a queue instance
 * Ensures we reuse the same queue instance across the application
 */
export function getQueue<T extends QueueName>(name: T): Queue {
  if (!queues.has(name)) {
    const options = {
      ...defaultQueueOptions,
      ...queueOptionsOverrides[name],
    };

    const queue = new Queue(name, options);

    // Handle queue errors
    queue.on('error', (error) => {
      console.error(`Queue error [${name}]:`, error);
    });

    queues.set(name, queue);
  }

  return queues.get(name)!;
}

/**
 * Close all queue connections
 * Call this during graceful shutdown
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map((queue) => queue.close());
  await Promise.all(closePromises);
  queues.clear();
  console.log('All queues closed');
}

/**
 * Pause all queues
 * Useful for maintenance
 */
export async function pauseAllQueues(): Promise<void> {
  const pausePromises = Array.from(queues.values()).map((queue) => queue.pause());
  await Promise.all(pausePromises);
  console.log('All queues paused');
}

/**
 * Resume all queues
 */
export async function resumeAllQueues(): Promise<void> {
  const resumePromises = Array.from(queues.values()).map((queue) => queue.resume());
  await Promise.all(resumePromises);
  console.log('All queues resumed');
}

/**
 * Get queue health status
 * Returns stats for all queues
 */
export async function getQueuesHealth(): Promise<Record<string, QueueHealth>> {
  const health: Record<string, QueueHealth> = {};

  for (const [name, queue] of queues) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    health[name] = {
      waiting,
      active,
      completed,
      failed,
      delayed,
      isPaused: await queue.isPaused(),
    };
  }

  return health;
}

/**
 * Queue health statistics
 */
export interface QueueHealth {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
}
