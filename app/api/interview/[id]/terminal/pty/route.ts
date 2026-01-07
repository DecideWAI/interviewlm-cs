import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import {
  createShellSession,
  writeToShell,
  getShellSession,
  prepareShellSessionForReading,
  releaseShellSessionReader,
  getShellHistory,
  appendToShellHistory,
  clearShellHistory,
  resizeShell,
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

    // Prepare session for reading - this marks stdout as locked
    // If another connection tries to read, it will get a new session
    const prepared = prepareShellSessionForReading(id);
    if (!prepared) {
      console.error(`[PTY] Failed to prepare shell session for reading: ${id}`);
      return NextResponse.json(
        { error: "Shell session not ready" },
        { status: 500 }
      );
    }
    const { abortSignal } = prepared;

    // Create SSE stream that reads from stdout
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        let keepAliveInterval: NodeJS.Timeout | null = null;

        // Handle abort signal (another connection took over)
        const handleAbort = () => {
          console.log(`[PTY] Aborted by new connection for ${id}`);
          isClosed = true;
          if (keepAliveInterval) clearInterval(keepAliveInterval);
          try {
            // Send reconnect signal so client knows to reconnect
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ reconnect: true, reason: "new_connection" })}\n\n`)
            );
            controller.close();
          } catch {
            // Already closed
          }
        };
        abortSignal.addEventListener('abort', handleAbort);

        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            try {
              controller.enqueue(data);
            } catch {
              isClosed = true;
              if (keepAliveInterval) clearInterval(keepAliveInterval);
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            isClosed = true;
            if (keepAliveInterval) clearInterval(keepAliveInterval);
            // Release the shell session reader so future connections can reuse
            releaseShellSessionReader(id);
            // Remove abort listener
            abortSignal.removeEventListener('abort', handleAbort);
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
        };

        // Start keepalive ping every 10 seconds to prevent proxy/load balancer timeouts
        // Many proxies have 30-60s idle timeouts, so 10s gives us good margin
        keepAliveInterval = setInterval(() => {
          if (!isClosed) {
            safeEnqueue(encoder.encode(`: ping\n\n`));
          }
        }, 10000);

        try {
          // Send history replay first (if available from previous output)
          // This allows clients to see terminal history on reconnect
          const history = getShellHistory(id);
          if (history && history.length > 0) {
            console.log(`[PTY] Sending ${history.length} chars of history for ${id}`);
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ history })}\n\n`)
            );
            // Clear history after sending to prevent accumulation of duplicate prompts
            // New output will be captured fresh from this point
            clearShellHistory(id);
          }

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

            // Use a persistent TextDecoder to handle incomplete UTF-8 sequences across chunks
            // - fatal: false - replace invalid bytes with replacement character instead of throwing
            // - ignoreBOM - don't interpret BOM as output
            const textDecoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

            for await (const chunk of stdout) {
              // Check isClosed BEFORE processing to avoid writing after abort
              if (isClosed) {
                console.log(`[PTY] Skipping chunk - connection closed for ${id}`);
                break;
              }

              // chunk could be Uint8Array or string
              let text: string;
              if (chunk instanceof Uint8Array) {
                // Use stream mode (don't flush) for intermediate chunks
                // This handles multi-byte UTF-8 chars split across chunks
                text = textDecoder.decode(chunk, { stream: true });
              } else if (typeof chunk === "string") {
                text = chunk;
              } else {
                text = String(chunk);
              }

              // Only send non-empty output
              if (text.length > 0) {
                // Double-check isClosed after decoding
                if (isClosed) break;

                // Send to client
                safeEnqueue(
                  encoder.encode(`data: ${JSON.stringify({ output: text })}\n\n`)
                );

                // Save to history for replay on reconnect
                appendToShellHistory(id, text);
              }
            }

            // Flush any remaining bytes in the decoder
            if (!isClosed) {
              const remaining = textDecoder.decode(); // Final flush
              if (remaining.length > 0) {
                safeEnqueue(
                  encoder.encode(`data: ${JSON.stringify({ output: remaining })}\n\n`)
                );
                // Save to history
                appendToShellHistory(id, remaining);
              }
            }
          } else {
            // Fallback: poll readText() periodically
            console.log(`[PTY] Falling back to polling for ${id}`);
            const textDecoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

            while (!isClosed) {
              try {
                // Use readBytes with a small limit to get incremental data
                // This may not work well depending on Modal SDK behavior
                const bytes = await stdout.readBytes(4096);
                if (bytes.length > 0) {
                  const text = textDecoder.decode(bytes, { stream: true });
                  if (text.length > 0 && !isClosed) {
                    // Send to client
                    safeEnqueue(
                      encoder.encode(`data: ${JSON.stringify({ output: text })}\n\n`)
                    );
                    // Save to history for replay on reconnect
                    appendToShellHistory(id, text);
                  }
                }
              } catch (error) {
                // Stream ended or error
                console.log(`[PTY] Stdout stream ended for ${id}:`, error);
                break;
              }
            }
          }

          // Stream ended - this could be shell exit or connection issue
          // Signal client to reconnect rather than showing "done"
          console.log(`[PTY] Stdout stream ended for ${id}, signaling reconnect`);
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ reconnect: true, reason: "stream_ended" })}\n\n`)
          );
          safeClose();
        } catch (error) {
          console.error(`[PTY] Stream error for ${id}:`, error);
          const errorMessage = error instanceof Error ? error.message : "Stream failed";

          // Check if this is a recoverable error
          const isRecoverable = errorMessage.includes('timeout') ||
                                errorMessage.includes('ECONNRESET') ||
                                errorMessage.includes('socket hang up') ||
                                errorMessage.includes('ReadableStream is locked') ||
                                errorMessage.includes('Invalid state');

          if (isRecoverable) {
            // Signal client to reconnect silently
            console.log(`[PTY] Recoverable error for ${id}, signaling reconnect`);
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ reconnect: true, reason: "recoverable_error" })}\n\n`)
            );
          } else {
            // Show error to user for non-recoverable errors
            const errorMsg = `\x1b[31mError: ${errorMessage}\x1b[0m\r\n`;
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ output: errorMsg })}\n\n`)
            );
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
            );
          }
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
    const { data, syncHistory, resize } = body;

    // Handle terminal resize
    if (resize && typeof resize.cols === "number" && typeof resize.rows === "number") {
      console.log(`[PTY] Resize request for ${id}: ${resize.cols}x${resize.rows}`);
      const shellSession = getShellSession(id);
      if (shellSession) {
        try {
          // Send SIGWINCH to notify the PTY of the new size
          // Modal's PTY should handle this via the process
          await resizeShell(id, resize.cols, resize.rows);
          return NextResponse.json({ success: true, resized: true });
        } catch (error) {
          console.error(`[PTY] Resize failed for ${id}:`, error);
          // Non-fatal - continue even if resize fails
          return NextResponse.json({ success: true, resized: false });
        }
      }
      return NextResponse.json({ success: true, resized: false });
    }

    // Handle history sync from client (when server lost history but client has it cached)
    if (typeof syncHistory === "string" && syncHistory.length > 0) {
      console.log(`[PTY] Receiving ${syncHistory.length} chars of history sync from client for ${id}`);
      // Only restore if we don't already have history
      const existingHistory = getShellHistory(id);
      if (!existingHistory || existingHistory.length === 0) {
        // Restore history from client cache (limit to 50KB for safety)
        const historyToRestore = syncHistory.slice(-50000);
        appendToShellHistory(id, historyToRestore);
        console.log(`[PTY] Restored ${historyToRestore.length} chars of history from client for ${id}`);
      }
      return NextResponse.json({ success: true, historyRestored: true });
    }

    if (typeof data !== "string") {
      return NextResponse.json(
        { error: "data must be a string" },
        { status: 400 }
      );
    }

    // Check if shell session exists, auto-create if needed
    let shellSession = getShellSession(id);
    let sessionRecreated = false;
    if (!shellSession) {
      // Session doesn't exist on this worker - auto-create it
      // This handles multi-worker scenarios where SSE is on a different worker
      console.log(`[PTY] Shell session not found for ${id}, auto-creating...`);
      try {
        shellSession = await createShellSession(id);
        sessionRecreated = true;
        console.log(`[PTY] Auto-created shell session for ${id}`);
      } catch (createError) {
        console.error(`[PTY] Failed to auto-create shell session for ${id}:`, createError);
        return NextResponse.json(
          { error: "reconnect", message: "Shell session not found. Reconnecting..." },
          { status: 410 }
        );
      }
    }

    // Write to stdin
    await writeToShell(id, data);

    // Return success, with flag if session was recreated (client should reconnect SSE)
    return NextResponse.json({
      success: true,
      sessionRecreated, // Client should silently reconnect SSE stream if true
    });
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
