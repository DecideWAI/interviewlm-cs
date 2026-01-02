/**
 * Cloudflare Turnstile Verification Service
 *
 * Verifies Turnstile tokens server-side via Cloudflare API.
 * Used for bot protection on public-facing forms.
 */

import { logger } from "@/lib/utils/logger";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Verify a Turnstile token with Cloudflare
 *
 * @param token - The Turnstile response token from the client
 * @param remoteIp - Optional client IP for additional validation
 * @returns Verification result with success status and any error codes
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // If no secret key configured, skip verification (dev mode)
  if (!secretKey) {
    logger.warn("[Turnstile] No secret key configured, skipping verification");
    return { success: true };
  }

  if (!token) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      logger.error("[Turnstile] API request failed", undefined, {
        status: response.status,
      });
      // Fail open on API errors to avoid blocking legitimate users
      return { success: true };
    }

    const result: TurnstileVerifyResponse = await response.json();

    if (!result.success) {
      logger.warn("[Turnstile] Verification failed", {
        errorCodes: result["error-codes"],
        hostname: result.hostname,
      });
    }

    return {
      success: result.success,
      errorCodes: result["error-codes"],
    };
  } catch (error) {
    logger.error("[Turnstile] Verification error", error as Error);
    // Fail open on network errors to avoid blocking legitimate users
    return { success: true };
  }
}

/**
 * Extract Turnstile token from request
 * Checks both header and body for the token
 *
 * @param request - The incoming request
 * @param body - Optional parsed request body
 * @returns The token if found, null otherwise
 */
export function extractTurnstileToken(
  request: Request,
  body?: Record<string, unknown>
): string | null {
  // Check header first (preferred for API calls)
  const headerToken = request.headers.get("cf-turnstile-response");
  if (headerToken) return headerToken;

  // Check body field
  if (body && typeof body.turnstileToken === "string") {
    return body.turnstileToken;
  }

  return null;
}

/**
 * Get client IP from request for Turnstile verification
 * Handles various proxy headers
 *
 * @param request - The incoming request
 * @returns The client IP if found
 */
export function getClientIp(request: Request): string | undefined {
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

  return undefined;
}
