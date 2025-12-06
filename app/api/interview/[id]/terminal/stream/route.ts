import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import { modalService as modal } from "@/lib/services";

/**
 * POST /api/interview/[id]/terminal/stream
 * Execute command with streaming output via SSE
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { command } = body;

    if (!command) {
      return new Response(JSON.stringify({ error: "Command required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Demo mode bypass
    const isDemoMode = id === "demo";

    if (!isDemoMode) {
      const session = await getSession();
      if (!session?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Verify candidate exists
      const candidate = await prisma.candidate.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!candidate) {
        return new Response(JSON.stringify({ error: "Candidate not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Create SSE stream for command output
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;

        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            try {
              controller.enqueue(data);
            } catch {
              isClosed = true;
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
        };

        try {
          // Use streaming command execution
          for await (const chunk of modal.runCommandStreaming(id, command, "/workspace")) {
            let output = "";

            if (chunk.type === "stdout") {
              output = (chunk.data as string).replace(/\n/g, "\r\n");
            } else if (chunk.type === "stderr") {
              output = `\x1b[31m${(chunk.data as string).replace(/\n/g, "\r\n")}\x1b[0m`;
            } else if (chunk.type === "exit") {
              const exitCode = chunk.data as number;
              if (exitCode !== 0) {
                output = `\x1b[31m[Exit code: ${exitCode}]\x1b[0m\r\n`;
              }
              // Send final event with prompt
              output += "\x1b[1;32m$\x1b[0m ";
            }

            if (output) {
              const msg = `data: ${JSON.stringify({ output })}\n\n`;
              safeEnqueue(encoder.encode(msg));
            }
          }

          // Signal completion
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          safeClose();
        } catch (error) {
          console.error("Streaming command error:", error);
          const errorMsg = `\x1b[31mError: ${error instanceof Error ? error.message : "Command failed"}\x1b[0m\r\n\x1b[1;32m$\x1b[0m `;
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ output: errorMsg })}\n\n`));
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          safeClose();
        }
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
    console.error("Terminal stream error:", error);
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
