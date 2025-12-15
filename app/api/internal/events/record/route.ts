/**
 * Internal Events API
 * POST /api/internal/events/record
 *
 * Accepts events from Python LangGraph agents via HTTP.
 * This is an internal-only endpoint, not exposed to end users.
 *
 * Events emitted by Python agents for:
 * - code.write (AI writes a file)
 * - code.edit (AI edits a file)
 * - terminal.command (AI runs a command)
 * - test.run / test.result (AI runs tests)
 * - session.metrics_updated (IRT metrics updates)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventStore } from "@/lib/services/event-store";
import type { EventOrigin } from "@prisma/client";

// Internal API key for server-to-server authentication
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "dev-internal-key";

// Request validation schema
const eventRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  type: z.string().min(1, "Event type is required"),
  origin: z.enum(["USER", "AI", "SYSTEM"]),
  data: z.record(z.any()),
  questionIndex: z.number().optional(),
  filePath: z.string().optional(),
  checkpoint: z.boolean().optional(),
});

/**
 * POST /api/internal/events/record
 * Record an event from Python agents
 */
export async function POST(request: NextRequest) {
  try {
    // Validate internal API key
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (apiKey !== INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = eventRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { sessionId, type, origin, data, questionIndex, filePath, checkpoint } = validationResult.data;

    // Determine category from event type (e.g., "code.write" -> "code")
    const category = type.split(".")[0] || "session";

    // Emit event using the unified event store
    const eventId = await eventStore.emit({
      sessionId,
      eventType: type as any, // Type assertion needed as Python agents may use custom types
      category,
      origin: origin as EventOrigin,
      data,
      questionIndex,
      filePath,
      checkpoint,
    });

    return NextResponse.json({
      success: true,
      eventId,
    });
  } catch (error) {
    console.error("[Internal Events API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
