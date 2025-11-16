import { NextRequest } from "next/server";
import { getOutputQueue, clearOutputQueue } from "@/lib/terminal-state";
import { getSession } from "@/lib/auth-helpers";

/**
 * GET /api/interview/[id]/terminal
 * Server-Sent Events (SSE) endpoint for terminal output
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Demo mode bypass (sessionId is "demo")
  const isDemoMode = id === "demo";

  try {
    // Skip auth for demo mode, enforce for real sessions
    if (!isDemoMode) {
      const session = await getSession();
      if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Initialize output queue for this session
    getOutputQueue(id);

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        const connectMsg = `data: ${JSON.stringify({ output: "\r\n" })}\n\n`;
        controller.enqueue(encoder.encode(connectMsg));

        let heartbeatCounter = 0;

        // Set up interval to check for new output and send heartbeat
        const intervalId = setInterval(() => {
          try {
            const queue = getOutputQueue(id);
            if (queue.length > 0) {
              // Send all queued outputs
              const outputs = queue.splice(0, queue.length);
              outputs.forEach((output) => {
                const msg = `data: ${JSON.stringify({ output })}\n\n`;
                controller.enqueue(encoder.encode(msg));
              });
            } else {
              // Send keep-alive comment every 15 seconds
              heartbeatCounter++;
              if (heartbeatCounter % 150 === 0) { // 150 * 100ms = 15 seconds
                controller.enqueue(encoder.encode(`: keepalive\n\n`));
              }
            }
          } catch (error) {
            console.error("Error in SSE interval:", error);
          }
        }, 100); // Check every 100ms

        // Handle client disconnect
        request.signal.addEventListener("abort", () => {
          clearInterval(intervalId);
          // Clean up queue after some time (client may reconnect)
          setTimeout(() => {
            if (getOutputQueue(id).length === 0) {
              clearOutputQueue(id);
            }
          }, 30000); // 30 seconds
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error("Terminal SSE error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
