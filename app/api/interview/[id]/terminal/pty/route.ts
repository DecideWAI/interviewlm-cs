import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import {
  createShellSession,
  writeToShell,
  getShellSession,
} from "@/lib/services/modal";

/**
 * PTY Terminal Bridge API
 *
 * This endpoint provides low-latency terminal access using Modal's native PTY support.
 * Instead of creating a new process for each command, it maintains a persistent bash
 * session with true PTY emulation.
 *
 * GET  - SSE stream that reads from shell stdout (connects to PTY output)
 * POST - Writes input to shell stdin (sends keystrokes to PTY)
 */

/**
 * GET /api/interview/[id]/terminal/pty
 * SSE stream for terminal output from the persistent shell session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Demo mode - return unsupported message
  if (id === "demo") {
    return NextResponse.json(
      { error: "PTY mode not available in demo", fallback: true },
      { status: 503 }
    );
  }

  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Create or get shell session
    console.log(`[PTY] Creating/getting shell session for ${id}`);
    const shellSession = await createShellSession(id);

    // Create SSE stream that reads from stdout
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
          // Send connection established event
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`)
          );

          // Read from stdout using async iterator (if available)
          // Modal's ModalReadStream implements Symbol.asyncIterator
          const stdout = shellSession.stdout;

          // Check if stdout supports async iteration
          if (Symbol.asyncIterator in stdout) {
            console.log(`[PTY] Reading stdout with async iterator for ${id}`);
            for await (const chunk of stdout) {
              if (isClosed) break;

              // chunk could be Uint8Array or string
              let text: string;
              if (chunk instanceof Uint8Array) {
                text = new TextDecoder().decode(chunk);
              } else if (typeof chunk === "string") {
                text = chunk;
              } else {
                text = String(chunk);
              }

              // Send output as-is - PTY already sends proper line endings
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ output: text })}\n\n`)
              );
            }
          } else {
            // Fallback: poll readText() periodically
            console.log(`[PTY] Falling back to polling for ${id}`);
            while (!isClosed) {
              try {
                // Use readBytes with a small limit to get incremental data
                // This may not work well depending on Modal SDK behavior
                const bytes = await stdout.readBytes(4096);
                if (bytes.length > 0) {
                  const text = new TextDecoder().decode(bytes);
                  safeEnqueue(
                    encoder.encode(`data: ${JSON.stringify({ output: text })}\n\n`)
                  );
                }
              } catch (error) {
                // Stream ended or error
                console.log(`[PTY] Stdout stream ended for ${id}:`, error);
                break;
              }
            }
          }

          // Stream ended
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
          );
          safeClose();
        } catch (error) {
          console.error(`[PTY] Stream error for ${id}:`, error);
          const errorMsg = `\x1b[31mError: ${
            error instanceof Error ? error.message : "Stream failed"
          }\x1b[0m\r\n`;
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ output: errorMsg })}\n\n`)
          );
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
          );
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
    console.error(`[PTY] GET error for ${id}:`, error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/interview/[id]/terminal/pty
 * Write input to the shell's stdin
 *
 * Body: { data: string } - the raw input data to send (keystrokes, commands)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Demo mode - return unsupported
  if (id === "demo") {
    return NextResponse.json(
      { error: "PTY mode not available in demo", fallback: true },
      { status: 503 }
    );
  }

  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { data } = body;

    if (typeof data !== "string") {
      return NextResponse.json(
        { error: "data must be a string" },
        { status: 400 }
      );
    }

    // Check if shell session exists
    const shellSession = getShellSession(id);
    if (!shellSession) {
      return NextResponse.json(
        { error: "No shell session. Connect to GET endpoint first." },
        { status: 400 }
      );
    }

    // Write to stdin
    await writeToShell(id, data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[PTY] POST error for ${id}:`, error);
    return NextResponse.json(
      {
        error: "Failed to write to shell",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
