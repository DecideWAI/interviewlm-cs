import { NextRequest } from "next/server";
import { paddleService } from "@/lib/services/paddle";
import { withErrorHandling } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/webhooks/paddle
 * Handle Paddle webhook events
 * NOTE: No rate limiting for webhooks (they come from trusted source)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  // Parse webhook payload
  const payload = await request.json();

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

    return success(
      { error: result.message },
      { status: 400 }
    );
  }
});

/**
 * GET /api/webhooks/paddle
 * Health check endpoint
 */
export const GET = withErrorHandling(async () => {
  return success({
    status: "ok",
    message: "Paddle webhook endpoint is active",
  });
});
