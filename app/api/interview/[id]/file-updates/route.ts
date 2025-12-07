import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import { createFileStreamResponse } from "@/lib/services/file-streaming";

/**
 * GET /api/interview/[id]/file-updates
 * Server-Sent Events endpoint for real-time file change notifications
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: candidateId } = await params;

  // Demo mode - return not supported
  if (candidateId === "demo") {
    return NextResponse.json(
      { error: "File updates not available in demo mode" },
      { status: 503 }
    );
  }

  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify candidate exists and user has access
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const encoder = new TextEncoder();

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        const { cleanup } = createFileStreamResponse(candidateId, controller);

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
    console.error("[FileUpdates] SSE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
