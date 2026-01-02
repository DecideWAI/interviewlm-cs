/**
 * Idempotency Utilities
 *
 * Provides Redis-based distributed locks and idempotency checks
 * to prevent duplicate processing of events and operations.
 *
 * Use cases:
 * - Prevent duplicate evaluations
 * - Ensure exactly-once event processing
 * - Handle race conditions in distributed workers
 */

import Redis from 'ioredis';
import crypto from 'crypto';

/**
 * Idempotency manager
 * Uses Redis for distributed locks and deduplication
 */
export class IdempotencyManager {
  private redis: Redis;
  private readonly defaultTTL: number = 3600; // 1 hour in seconds
  private readonly lockTTL: number = 300; // 5 minutes for locks
  private readonly lockRetries: number = 3;
  private readonly lockRetryDelay: number = 100; // ms

  constructor(redis?: Redis) {
    this.redis = redis || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  /**
   * Acquire a distributed lock
   * Returns lock token if acquired, null if already locked
   */
  async acquireLock(
    key: string,
    ttl: number = this.lockTTL
  ): Promise<string | null> {
    const lockKey = this.getLockKey(key);
    const lockToken = this.generateToken();

    // Try to set lock with NX (only if not exists) and EX (expiration)
    const result = await this.redis.set(lockKey, lockToken, 'EX', ttl, 'NX');

    return result === 'OK' ? lockToken : null;
  }

  /**
   * Acquire lock with retries
   * Useful for operations that can wait briefly
   */
  async acquireLockWithRetry(
    key: string,
    ttl: number = this.lockTTL
  ): Promise<string | null> {
    for (let attempt = 0; attempt < this.lockRetries; attempt++) {
      const token = await this.acquireLock(key, ttl);
      if (token) {
        return token;
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.lockRetries - 1) {
        await this.sleep(this.lockRetryDelay * Math.pow(2, attempt));
      }
    }

    return null;
  }

  /**
   * Release a lock
   * Only releases if the token matches (prevents releasing someone else's lock)
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const lockKey = this.getLockKey(key);

    // Lua script to atomically check token and delete
    // This prevents race condition where lock expires between check and delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, token);
    return result === 1;
  }

  /**
   * Execute a function with a distributed lock
   * Automatically acquires lock, executes function, and releases lock
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = this.lockTTL
  ): Promise<T> {
    const token = await this.acquireLockWithRetry(key, ttl);

    if (!token) {
      throw new Error(`Failed to acquire lock for key: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(key, token);
    }
  }

  /**
   * Check if an operation has already been processed (idempotency)
   * Returns true if operation is new, false if duplicate
   */
  async checkIdempotency(
    idempotencyKey: string,
    ttl: number = this.defaultTTL
  ): Promise<boolean> {
    const key = this.getIdempotencyKey(idempotencyKey);

    // Try to set key with NX (only if not exists)
    const result = await this.redis.set(key, '1', 'EX', ttl, 'NX');

    return result === 'OK'; // true = new operation, false = duplicate
  }

  /**
   * Mark operation as processed and store result
   * Useful for returning cached results to duplicate requests
   */
  async setIdempotentResult<T>(
    idempotencyKey: string,
    result: T,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    const key = this.getIdempotencyKey(idempotencyKey);
    const serialized = JSON.stringify(result);

    await this.redis.set(key, serialized, 'EX', ttl);
  }

  /**
   * Get cached result for duplicate operation
   */
  async getIdempotentResult<T>(idempotencyKey: string): Promise<T | null> {
    const key = this.getIdempotencyKey(idempotencyKey);
    const value = await this.redis.get(key);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Execute idempotent operation
   * Returns cached result if duplicate, otherwise executes and caches
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    fn: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<{ result: T; isDuplicate: boolean }> {
    // Check for cached result first
    const cachedResult = await this.getIdempotentResult<T>(idempotencyKey);
    if (cachedResult !== null) {
      return { result: cachedResult, isDuplicate: true };
    }

    // Use lock to prevent race condition
    return await this.withLock(
      `idempotent:${idempotencyKey}`,
      async () => {
        // Double-check after acquiring lock
        const cachedResult = await this.getIdempotentResult<T>(idempotencyKey);
        if (cachedResult !== null) {
          return { result: cachedResult, isDuplicate: true };
        }

        // Execute operation
        const result = await fn();

        // Cache result
        await this.setIdempotentResult(idempotencyKey, result, ttl);

        return { result, isDuplicate: false };
      },
      30 // Short lock TTL for quick operations
    );
  }

  /**
   * Check if operation is in progress
   */
  async isOperationInProgress(key: string): Promise<boolean> {
    const lockKey = this.getLockKey(key);
    const exists = await this.redis.exists(lockKey);
    return exists === 1;
  }

  /**
   * Clean up old idempotency records
   * Useful for maintenance
   */
  async cleanup(pattern: string = 'idempotent:*'): Promise<number> {
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );

      cursor = newCursor;

      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        keys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    return deletedCount;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Generate unique lock token
   */
  private generateToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get lock key name
   */
  private getLockKey(key: string): string {
    return `lock:${key}`;
  }

  /**
   * Get idempotency key name
   */
  private getIdempotencyKey(key: string): string {
    return `idempotent:${key}`;
  }

  /**
   * Sleep helper for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance
 */
let idempotencyManager: IdempotencyManager | null = null;

/**
 * Get or create idempotency manager instance
 */
export function getIdempotencyManager(): IdempotencyManager {
  if (!idempotencyManager) {
    idempotencyManager = new IdempotencyManager();
  }
  return idempotencyManager;
}

/**
 * Generate idempotency key for interview operations
 */
export function generateInterviewKey(
  operation: string,
  sessionId: string,
  ...params: string[]
): string {
  const parts = [operation, sessionId, ...params].join(':');
  return parts;
}

/**
 * Generate idempotency key for evaluation operations
 */
export function generateEvaluationKey(
  sessionId: string,
  candidateId: string
): string {
  return `evaluation:${sessionId}:${candidateId}`;
}

/**
 * Decorator for idempotent methods
 * Usage: @Idempotent('operation-name', 3600)
 */
export function Idempotent(keyPrefix: string, ttl: number = 3600) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const manager = getIdempotencyManager();
      const idempotencyKey = `${keyPrefix}:${JSON.stringify(args)}`;

      const { result, isDuplicate } = await manager.executeIdempotent(
        idempotencyKey,
        () => originalMethod.apply(this, args),
        ttl
      );

      if (isDuplicate) {
        console.log(`[Idempotency] Returning cached result for ${keyPrefix}`);
      }

      return result;
    };

    return descriptor;
  };
}
