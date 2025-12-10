import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  evaluationStreamManager,
  EvaluationProgressEvent,
  EvaluationCompleteEvent,
} from "@/lib/services/evaluation-streaming";

// Schema for progress events
const progressEventSchema = z.object({
  sessionId: z.string(),
  candidateId: z.string(),
  type: z.literal("evaluation_progress"),
  status: z.enum(["analyzing", "scoring", "finalizing"]),
  progressPercent: z.number().min(0).max(100),
  currentStep: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

// Schema for completion events
const completeEventSchema = z.object({
  sessionId: z.string(),
  candidateId: z.string(),
  evaluationId: z.string(),
  type: z.literal("evaluation_complete"),
  overallScore: z.number().min(0).max(100),
  codeQualityScore: z.number().min(0).max(100),
  problemSolvingScore: z.number().min(0).max(100),
  aiCollaborationScore: z.number().min(0).max(100),
  communicationScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
});

// Combined schema
const eventSchema = z.union([progressEventSchema, completeEventSchema]);

/**
 * POST /api/internal/evaluation/notify
 * Internal API endpoint for Python LangGraph to broadcast evaluation events
 *
 * This endpoint is called by the Python evaluation agent to:
 * - Send progress updates during evaluation
 * - Notify when evaluation is complete
 *
 * Security: This is an internal API. In production, add authentication
 * (API key, internal network restriction, or service-to-service auth).
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add internal API key validation for production
    // const apiKey = request.headers.get("x-internal-api-key");
    // if (apiKey !== process.env.INTERNAL_API_KEY) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const body = await request.json();
    const validationResult = eventSchema.safeParse(body);

    if (!validationResult.success) {
      console.error("[EvaluationNotify] Invalid payload:", validationResult.error.errors);
      return NextResponse.json(
        { error: "Invalid event payload", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const event = validationResult.data;
    console.log(`[EvaluationNotify] Received ${event.type} for session ${event.sessionId}`);

    // Broadcast to connected SSE clients
    if (event.type === "evaluation_progress") {
      evaluationStreamManager.broadcastEvent(event as EvaluationProgressEvent);
    } else {
      evaluationStreamManager.broadcastEvent(event as EvaluationCompleteEvent);
    }

    return NextResponse.json({
      success: true,
      clientsNotified: evaluationStreamManager.getClientCount(event.sessionId),
    });
  } catch (error) {
    console.error("[EvaluationNotify] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
