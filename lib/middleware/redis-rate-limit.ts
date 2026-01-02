/**
 * Redis-backed Rate Limiting
 *
 * Uses sliding window algorithm with Redis for distributed rate limiting.
 * Falls back to in-memory store when Redis is unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { getSharedRedisClient } from "@/lib/utils/redis";
import { rateLimit as rateLimitResponse } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";

// ============================================================================
// Types
// ============================================================================

export interface RedisRateLimitConfig {
  /**
   * Unique identifier for this rate limiter
   */
  name: string;

  /**
   * Maximum requests allowed in the window
   */
  max: number;

  /**
   * Time window in seconds
   */
  windowSec: number;

  /**
   * Custom key generator (default: IP address)
   */
  keyGenerator?: (request: NextRequest) => string;

  /**
   * Skip rate limiting for certain requests
   */
  skip?: (request: NextRequest) => boolean;

  /**
   * Custom message when rate limited
   */
  message?: string;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
}

// ============================================================================
// Redis Availability Tracking
// ============================================================================

let redisAvailable = true;
let lastRedisCheck = 0;
const REDIS_CHECK_INTERVAL = 30000; // 30 seconds

// ============================================================================
// In-Memory Fallback Store
// ============================================================================

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function cleanupMemoryStore() {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, record] of memoryStore.entries()) {
    if (now >= record.resetAt) {
      memoryStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug("[Redis Rate Limit] Memory store cleanup", {
      cleaned,
      remaining: memoryStore.size,
    });
  }
}

// Cleanup every minute
if (typeof setInterval !== "undefined") {
  setInterval(cleanupMemoryStore, 60000);
}

async function checkRateLimitMemory(
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now >= record.resetAt) {
    // Start new window
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return {
      success: true,
      remaining: max - 1,
      resetAt: new Date(resetAt),
    };
  }

  // Increment existing window
  record.count++;
  memoryStore.set(key, record);

  return {
    success: record.count <= max,
    remaining: Math.max(0, max - record.count),
    resetAt: new Date(record.resetAt),
  };
}

// ============================================================================
// Redis Sliding Window Implementation
// ============================================================================

// Lua script for atomic sliding window rate limiting
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local window_sec = tonumber(ARGV[4])

-- Remove old entries outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current entries in the window
local count = redis.call('ZCARD', key)

-- Check if under limit
if count < max_requests then
  -- Add new entry with unique member (timestamp + random)
  local member = now .. '-' .. math.random(1000000)
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, window_sec + 1)
  return {1, max_requests - count - 1}
else
  return {0, 0}
end
`;

async function checkRateLimitRedis(
  redis: Redis,
  key: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowStart = now - windowMs;

  try {
    const result = (await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      now,
      windowStart,
      max,
      windowSec
    )) as [number, number];

    const resetAt = new Date(now + windowMs);

    return {
      success: result[0] === 1,
      remaining: result[1],
      resetAt,
    };
  } catch (error) {
    logger.error("[Redis Rate Limit] Redis error", error as Error);
    throw error;
  }
}

// ============================================================================
// Rate Limiter Factory
// ============================================================================

/**
 * Default key generator (IP address)
 */
function defaultKeyGenerator(request: NextRequest): string {
  // Cloudflare specific header
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  // Standard proxy headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

/**
 * Create Redis-backed rate limiter with in-memory fallback
 *
 * @param config - Rate limiter configuration
 * @returns Middleware function that returns null on success, or error response on limit exceeded
 */
export function createRedisRateLimiter(config: RedisRateLimitConfig) {
  const {
    name,
    max,
    windowSec,
    keyGenerator = defaultKeyGenerator,
    skip,
    message = "Too many requests, please try again later",
  } = config;

  return async (request: NextRequest): Promise<NextResponse | null> => {
    // Skip if configured
    if (skip && skip(request)) {
      return null;
    }

    // Generate key
    const clientKey = keyGenerator(request);
    const redisKey = `ratelimit:${name}:${clientKey}`;

    let result: RateLimitResult;
    const now = Date.now();

    // Try Redis first
    const redis = getSharedRedisClient();

    if (redis && redisAvailable) {
      try {
        result = await checkRateLimitRedis(redis, redisKey, max, windowSec);
      } catch {
        // Fall back to memory on Redis error
        redisAvailable = false;
        lastRedisCheck = now;
        logger.warn("[Redis Rate Limit] Falling back to in-memory store", {
          name,
        });
        result = await checkRateLimitMemory(
          redisKey,
          max,
          windowSec * 1000
        );
      }
    } else {
      // Check if we should retry Redis
      if (!redisAvailable && now - lastRedisCheck > REDIS_CHECK_INTERVAL) {
        lastRedisCheck = now;
        redisAvailable = true; // Will try again on next request
      }
      result = await checkRateLimitMemory(redisKey, max, windowSec * 1000);
    }

    // If rate limited, return error response
    if (!result.success) {
      logger.warn("[Redis Rate Limit] Limit exceeded", {
        name,
        key: clientKey,
        max,
        windowSec,
        path: request.nextUrl.pathname,
      });

      const retryAfter = Math.ceil(
        (result.resetAt.getTime() - Date.now()) / 1000
      );
      const response = rateLimitResponse(message, retryAfter);

      response.headers.set("X-RateLimit-Limit", max.toString());
      response.headers.set("X-RateLimit-Remaining", "0");
      response.headers.set("X-RateLimit-Reset", result.resetAt.toISOString());

      return response;
    }

    // Request allowed
    return null;
  };
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Strict rate limit for sensitive operations
 * 5 requests per minute
 */
export const redisStrictRateLimit = createRedisRateLimiter({
  name: "strict",
  max: 5,
  windowSec: 60,
});

/**
 * Standard rate limit for normal API endpoints
 * 100 requests per minute
 */
export const redisStandardRateLimit = createRedisRateLimiter({
  name: "standard",
  max: 100,
  windowSec: 60,
});

/**
 * Relaxed rate limit for read-heavy endpoints
 * 300 requests per minute
 */
export const redisRelaxedRateLimit = createRedisRateLimiter({
  name: "relaxed",
  max: 300,
  windowSec: 60,
});

/**
 * Auth rate limit for authentication endpoints
 * 5 attempts per 15 minutes per IP
 */
export const redisAuthRateLimit = createRedisRateLimiter({
  name: "auth",
  max: 5,
  windowSec: 15 * 60,
  message: "Too many authentication attempts, please try again later",
});

/**
 * Registration rate limit
 * 3 registrations per hour per IP
 */
export const redisRegistrationRateLimit = createRedisRateLimiter({
  name: "registration",
  max: 3,
  windowSec: 60 * 60,
  message: "Too many registration attempts, please try again later",
});

/**
 * Password reset rate limit
 * 3 attempts per hour per IP
 */
export const redisPasswordResetRateLimit = createRedisRateLimiter({
  name: "password-reset",
  max: 3,
  windowSec: 60 * 60,
  message: "Too many password reset attempts, please try again later",
});

/**
 * Email verification rate limit
 * 5 attempts per 15 minutes per IP
 */
export const redisEmailVerificationRateLimit = createRedisRateLimiter({
  name: "email-verification",
  max: 5,
  windowSec: 15 * 60,
  message: "Too many verification attempts, please try again later",
});
