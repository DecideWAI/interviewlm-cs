/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse with configurable rate limits.
 * Uses in-memory storage for simplicity, can be upgraded to Redis.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit as rateLimitResponse } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /**
   * Maximum requests allowed in the window
   */
  max: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Custom key generator (default: IP address)
   */
  keyGenerator?: (request: NextRequest) => string;

  /**
   * Skip rate limiting for certain requests
   */
  skip?: (request: NextRequest) => boolean;

  /**
   * Custom handler when rate limit is exceeded
   */
  onLimitReached?: (request: NextRequest, key: string) => void;

  /**
   * Custom message when rate limited
   */
  message?: string;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// ============================================================================
// In-Memory Store
// ============================================================================

class RateLimitStore {
  private store = new Map<string, RateLimitRecord>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get(key: string): RateLimitRecord | undefined {
    const record = this.store.get(key);

    // Remove if expired
    if (record && Date.now() >= record.resetAt) {
      this.store.delete(key);
      return undefined;
    }

    return record;
  }

  set(key: string, value: RateLimitRecord): void {
    this.store.set(key, value);
  }

  increment(key: string, windowMs: number): RateLimitRecord {
    const existing = this.get(key);

    if (existing) {
      existing.count++;
      this.store.set(key, existing);
      return existing;
    }

    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: Date.now() + windowMs,
    };

    this.store.set(key, newRecord);
    return newRecord;
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug("Rate limit store cleanup", { cleaned, remaining: this.store.size });
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton store instance
const store = new RateLimitStore();

// ============================================================================
// Rate Limit Middleware Factory
// ============================================================================

/**
 * Create rate limit middleware
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    max,
    windowMs,
    keyGenerator = defaultKeyGenerator,
    skip,
    onLimitReached,
    message = "Too many requests, please try again later",
  } = config;

  return async (request: NextRequest): Promise<NextResponse | null> => {
    // Skip if configured
    if (skip && skip(request)) {
      return null;
    }

    // Generate key for this request
    const key = keyGenerator(request);

    // Increment counter
    const record = store.increment(key, windowMs);

    // Add rate limit headers
    const remaining = Math.max(0, max - record.count);
    const resetAt = new Date(record.resetAt);

    // Check if limit exceeded
    if (record.count > max) {
      // Log rate limit violation
      logger.warn("Rate limit exceeded", {
        key,
        count: record.count,
        max,
        path: request.nextUrl.pathname,
      });

      // Call custom handler
      if (onLimitReached) {
        onLimitReached(request, key);
      }

      // Return rate limit response
      const response = rateLimitResponse(
        message,
        Math.ceil((record.resetAt - Date.now()) / 1000)
      );

      // Add rate limit headers
      response.headers.set("X-RateLimit-Limit", max.toString());
      response.headers.set("X-RateLimit-Remaining", "0");
      response.headers.set("X-RateLimit-Reset", resetAt.toISOString());

      return response;
    }

    // Request allowed, but we need to add headers to the response
    // Return null and let the route handler proceed
    // Headers will be added in the response
    return null;
  };
}

/**
 * Default key generator (IP address)
 */
function defaultKeyGenerator(request: NextRequest): string {
  // Try to get real IP from headers (for proxy/load balancer)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwarded) {
    // X-Forwarded-For can have multiple IPs, use first one
    return forwarded.split(",")[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  // Fallback to direct IP (not reliable behind proxies)
  return request.ip || "unknown";
}

/**
 * Key generator based on user ID (requires authentication)
 */
export function userKeyGenerator(getUserId: (request: NextRequest) => string | null) {
  return (request: NextRequest): string => {
    const userId = getUserId(request);
    return userId || defaultKeyGenerator(request);
  };
}

/**
 * Key generator based on API key
 */
export function apiKeyGenerator(request: NextRequest): string {
  const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization");
  return apiKey || defaultKeyGenerator(request);
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Strict rate limit (for expensive operations)
 * 5 requests per minute
 */
export const strictRateLimit = createRateLimiter({
  max: 5,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Standard rate limit (for normal API endpoints)
 * 100 requests per minute
 */
export const standardRateLimit = createRateLimiter({
  max: 100,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Relaxed rate limit (for read-heavy endpoints)
 * 300 requests per minute
 */
export const relaxedRateLimit = createRateLimiter({
  max: 300,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Auth rate limit (for authentication endpoints)
 * 5 attempts per 15 minutes
 */
export const authRateLimit = createRateLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: "Too many authentication attempts, please try again later",
});

// ============================================================================
// Helper Function
// ============================================================================

/**
 * Apply rate limit to route handler
 */
export function withRateLimit(
  config: RateLimitConfig,
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  const rateLimiter = createRateLimiter(config);

  return async (request: NextRequest): Promise<NextResponse> => {
    // Check rate limit
    const rateLimitResponse = await rateLimiter(request);

    // If rate limited, return error response
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Otherwise, proceed with handler
    return handler(request);
  };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup rate limit store (call on server shutdown)
 */
export function cleanupRateLimiter(): void {
  store.destroy();
}

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Apply to route handler
 *
 * ```typescript
 * import { standardRateLimit } from "@/lib/middleware/rate-limit";
 *
 * export async function GET(request: NextRequest) {
 *   const rateLimited = await standardRateLimit(request);
 *   if (rateLimited) return rateLimited;
 *
 *   // Your handler logic
 *   return NextResponse.json({ data: "..." });
 * }
 * ```
 *
 * Example 2: Use wrapper
 *
 * ```typescript
 * import { withRateLimit } from "@/lib/middleware/rate-limit";
 *
 * export const GET = withRateLimit(
 *   { max: 10, windowMs: 60000 },
 *   async (request) => {
 *     // Your handler logic
 *     return NextResponse.json({ data: "..." });
 *   }
 * );
 * ```
 *
 * Example 3: Custom key generator (user-based)
 *
 * ```typescript
 * import { createRateLimiter, userKeyGenerator } from "@/lib/middleware/rate-limit";
 *
 * const userRateLimit = createRateLimiter({
 *   max: 50,
 *   windowMs: 60000,
 *   keyGenerator: userKeyGenerator((req) => {
 *     // Get user ID from session/token
 *     return getUserIdFromRequest(req);
 *   }),
 * });
 * ```
 *
 * Example 4: Skip rate limit for admins
 *
 * ```typescript
 * const rateLimit = createRateLimiter({
 *   max: 100,
 *   windowMs: 60000,
 *   skip: (request) => {
 *     // Skip for admin users
 *     return isAdmin(request);
 *   },
 * });
 * ```
 */
