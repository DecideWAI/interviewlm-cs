import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { paddleService, verifyWebhookSignature } from "@/lib/services/paddle";
import { withErrorHandling } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/webhooks/paddle
 * Handle Paddle webhook events
 *
 * Security: Verifies Paddle-Signature header before processing.
 * NOTE: No rate limiting for webhooks (they come from trusted source)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  // Get the raw body for signature verification
  const rawBody = await request.text();

  // Get signature from headers (Paddle Billing uses this header)
  const signature = request.headers.get("paddle-signature");

  // Verify signature in production (required if PADDLE_WEBHOOK_SECRET is set)
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  if (webhookSecret) {
    if (!signature) {
      logger.warn("Paddle webhook missing signature header", {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json(
        { error: "Missing Paddle-Signature header" },
        { status: 401 }
      );
    }

    // Verify using Paddle's signature format
    // Paddle Billing signature format: ts=timestamp;h1=hmac_signature
    const isValid = verifyPaddleBillingSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      logger.error("Paddle webhook signature verification failed", undefined, {
        signaturePresent: !!signature,
      });
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    logger.debug("Paddle webhook signature verified successfully");
  } else if (process.env.NODE_ENV === "production") {
    // In production, require webhook secret
    logger.error("PADDLE_WEBHOOK_SECRET not configured in production");
    return NextResponse.json(
      { error: "Webhook verification not configured" },
      { status: 500 }
    );
  } else {
    logger.warn("Paddle webhook signature verification skipped (no secret configured)");
  }

  // Parse the payload
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error("Failed to parse Paddle webhook payload", undefined, { rawBody: rawBody.substring(0, 200) });
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  logger.info("Received Paddle webhook", {
    event: payload.alert_name || payload.event_type,
    id: payload.alert_id || payload.event_id,
  });

  // Process webhook with timing
  const result = await logger.time(
    'processPaddleWebhook',
    () => paddleService.handleWebhook(payload),
    {
      event: payload.alert_name || payload.event_type,
    }
  );

  if (result.success) {
    logger.info("Paddle webhook processed successfully", {
      event: payload.alert_name || payload.event_type,
      message: result.message,
    });

    return success({ message: result.message });
  } else {
    logger.warn("Paddle webhook processing failed", {
      event: payload.alert_name || payload.event_type,
      message: result.message,
    });

    return NextResponse.json(
      { error: result.message },
      { status: 400 }
    );
  }
});

/**
 * Verify Paddle Billing webhook signature
 *
 * Paddle Billing signature format: ts=timestamp;h1=hmac_signature
 * The signature is computed over: timestamp + ":" + rawBody
 */
function verifyPaddleBillingSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    // Parse the signature header
    const parts = signatureHeader.split(";");
    const tsMatch = parts.find((p) => p.startsWith("ts="));
    const h1Match = parts.find((p) => p.startsWith("h1="));

    if (!tsMatch || !h1Match) {
      // Try legacy format (Classic API uses p_signature in body)
      return false;
    }

    const timestamp = tsMatch.slice(3);
    const expectedSignature = h1Match.slice(3);

    // Compute HMAC
    const signedPayload = `${timestamp}:${rawBody}`;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(signedPayload);
    const computedSignature = hmac.digest("hex");

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    logger.error("Error verifying Paddle signature", error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * GET /api/webhooks/paddle
 * Health check endpoint
 */
export const GET = withErrorHandling(async () => {
  return success({
    status: "ok",
    message: "Paddle webhook endpoint is active",
    signatureVerification: process.env.PADDLE_WEBHOOK_SECRET ? "enabled" : "disabled",
  });
});
