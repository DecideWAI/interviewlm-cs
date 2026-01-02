/**
 * Turnstile Verification Middleware
 *
 * Wraps API routes to require Turnstile verification.
 * Used for bot protection on public-facing endpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyTurnstileToken,
  extractTurnstileToken,
  getClientIp,
} from "@/lib/services/turnstile";
import { logger } from "@/lib/utils/logger";

export interface TurnstileConfig {
  /**
   * Skip verification for certain requests
   */
  skip?: (request: NextRequest) => boolean;

  /**
   * Action name for logging/debugging
   */
  action?: string;

  /**
   * Custom error message when verification fails
   */
  errorMessage?: string;
}

/**
 * Create Turnstile verification middleware
 *
 * @param config - Configuration options
 * @returns Middleware function that returns null on success, or error response on failure
 */
export function createTurnstileVerifier(config: TurnstileConfig = {}) {
  const {
    skip,
    action = "unknown",
    errorMessage = "Bot verification required. Please try again.",
  } = config;

  return async (
    request: NextRequest,
    body?: Record<string, unknown>
  ): Promise<NextResponse | null> => {
    // Skip if configured
    if (skip && skip(request)) {
      return null;
    }

    // Skip in development if no secret key
    if (!process.env.TURNSTILE_SECRET_KEY) {
      logger.debug("[Turnstile] Skipping verification (no secret key)", {
        action,
      });
      return null;
    }

    // Extract token from request
    const token = extractTurnstileToken(request, body);
    if (!token) {
      logger.warn("[Turnstile] Missing token", {
        action,
        path: request.nextUrl.pathname,
      });
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Verify token with Cloudflare
    const clientIp = getClientIp(request);
    const result = await verifyTurnstileToken(token, clientIp);

    if (!result.success) {
      logger.warn("[Turnstile] Verification failed", {
        action,
        errorCodes: result.errorCodes,
        clientIp,
        path: request.nextUrl.pathname,
      });
      return NextResponse.json(
        { error: "Bot verification failed. Please try again." },
        { status: 400 }
      );
    }

    logger.debug("[Turnstile] Verification successful", {
      action,
      clientIp,
    });

    // Allow request to proceed
    return null;
  };
}

/**
 * Pre-configured middleware for auth-related endpoints
 * (signup, signin, forgot-password, reset-password)
 */
export const authTurnstileVerifier = createTurnstileVerifier({
  action: "auth",
  errorMessage: "Please complete the security check and try again.",
});

/**
 * Pre-configured middleware for interview-related endpoints
 * (interview start, validation)
 */
export const interviewTurnstileVerifier = createTurnstileVerifier({
  action: "interview",
  errorMessage: "Please complete the security check to start your interview.",
});
