/**
 * Redis Client Utility
 *
 * Shared Redis client factory with proper TLS configuration
 * for GCP Memorystore and other Redis services.
 */

import Redis, { RedisOptions } from 'ioredis';

/**
 * Parse a Redis URL and return ioredis options
 * Supports both redis:// and rediss:// (TLS) protocols
 */
export function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const isTls = parsed.protocol === 'rediss:';

  const options: RedisOptions = {
    host: parsed.hostname,
    port: parseInt(parsed.port || (isTls ? '6378' : '6379'), 10),
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname?.slice(1) || '0', 10),
    lazyConnect: true,
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
  };

  // For TLS connections (rediss://), configure TLS options
  if (isTls) {
    options.tls = {
      // GCP Memorystore uses server-side TLS with internal certificates
      // We need to disable strict certificate validation
      rejectUnauthorized: false,
    };
  }

  return options;
}

/**
 * Create a Redis client from the REDIS_URL environment variable
 * Returns null if REDIS_URL is not set
 */
export function createRedisClient(options?: Partial<RedisOptions>): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not set, Redis features will be disabled');
    return null;
  }

  const baseOptions = parseRedisUrl(redisUrl);
  const mergedOptions = { ...baseOptions, ...options };

  const client = new Redis(mergedOptions);

  // Suppress connection errors in logs (they'll be handled by retry logic)
  client.on('error', (err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Redis] Connection error:', err.message);
    }
  });

  return client;
}

/**
 * Get the Redis URL with proper options for direct ioredis usage
 * This is for cases where we need to pass a URL directly
 */
export function getRedisConnectionOptions(): RedisOptions | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  return parseRedisUrl(redisUrl);
}

// Singleton client for shared usage
let sharedClient: Redis | null = null;

/**
 * Get a shared Redis client instance
 * Use this for shared operations to avoid creating multiple connections
 */
export function getSharedRedisClient(): Redis | null {
  if (!sharedClient) {
    sharedClient = createRedisClient();
  }
  return sharedClient;
}

/**
 * Close the shared Redis client
 * Call this during graceful shutdown
 */
export async function closeSharedRedisClient(): Promise<void> {
  if (sharedClient) {
    await sharedClient.quit();
    sharedClient = null;
  }
}
