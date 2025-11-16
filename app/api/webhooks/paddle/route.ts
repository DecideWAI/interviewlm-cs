import { NextRequest, NextResponse } from "next/server";
import { paddleService } from "@/lib/services/paddle";

/**
 * POST /api/webhooks/paddle
 * Handle Paddle webhook events
 */
export async function POST(request: NextRequest) {
  try {
    // Parse webhook payload
    const payload = await request.json();

    console.log("Received Paddle webhook:", {
      event: payload.alert_name || payload.event_type,
      id: payload.alert_id || payload.event_id,
    });

    // Process webhook
    const result = await paddleService.handleWebhook(payload);

    if (result.success) {
      return NextResponse.json(
        { message: result.message },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Paddle webhook error:", error);
    return NextResponse.json(
      {
        error: "Webhook processing failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/paddle
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      message: "Paddle webhook endpoint is active",
    },
    { status: 200 }
  );
}
