/**
 * Redis Distributed Lock
 *
 * Simple distributed locking using Redis SET NX PX.
 * Prevents race conditions across multiple server instances.
 */

import Redis from "ioredis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (!redis) {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 5000,
    });
    redis.on("error", () => {}); // Suppress connection errors
  }
  return redis;
}

export interface LockResult {
  acquired: boolean;
  release: () => Promise<void>;
}

/**
 * Acquire a distributed lock
 */
export async function acquireLock(
  key: string,
  options: { ttlMs?: number; waitTimeoutMs?: number; retryIntervalMs?: number } = {}
): Promise<LockResult> {
  const { ttlMs = 30000, waitTimeoutMs = 10000, retryIntervalMs = 100 } = options;

  const client = getRedis();
  const lockKey = `lock:${key}`;
  const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // No Redis = no-op lock (graceful degradation)
  if (!client) {
    return { acquired: true, release: async () => {} };
  }

  const startTime = Date.now();

  while (Date.now() - startTime < waitTimeoutMs) {
    try {
      const result = await client.set(lockKey, lockValue, "PX", ttlMs, "NX");

      if (result === "OK") {
        return {
          acquired: true,
          release: async () => {
            try {
              const current = await client.get(lockKey);
              if (current === lockValue) await client.del(lockKey);
            } catch {}
          },
        };
      }

      await new Promise((r) => setTimeout(r, retryIntervalMs));
    } catch {
      // On Redis error, allow operation to proceed
      return { acquired: true, release: async () => {} };
    }
  }

  return { acquired: false, release: async () => {} };
}

export async function closeRedisLock(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
