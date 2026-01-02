import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import { createEvaluationStreamResponse } from "@/lib/services/evaluation-streaming";

/**
 * GET /api/evaluation/[sessionId]/stream
 * Server-Sent Events endpoint for real-time evaluation progress updates
 *
 * Clients subscribe to this endpoint to receive:
 * - evaluation_progress: Progress updates during evaluation
 * - evaluation_complete: Final scores when evaluation is done
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    console.log(`[EvaluationStream] SSE request for session ${sessionId}`);

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      console.log(`[EvaluationStream] Unauthorized - no session`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify session exists and user has access
    const sessionRecording = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
      include: {
        candidate: {
          include: {
            organization: {
              include: {
                members: {
                  where: { userId: session.user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!sessionRecording) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Check authorization - must be org member or the candidate themselves
    const isOrgMember = sessionRecording.candidate.organization.members.length > 0;
    const isSelfInterview = sessionRecording.candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const encoder = new TextEncoder();

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        const { cleanup } = createEvaluationStreamResponse(sessionId, controller);

        // Keep-alive ping every 15 seconds
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            // Stream closed, cleanup will handle it
            clearInterval(keepAliveInterval);
          }
        }, 15000);

        // Handle client disconnect
        request.signal.addEventListener("abort", () => {
          clearInterval(keepAliveInterval);
          cleanup();
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[EvaluationStream] SSE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
