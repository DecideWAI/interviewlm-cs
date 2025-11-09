import { NextRequest } from "next/server";
import { WebSocketServer, WebSocket } from "ws";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";

/**
 * WebSocket connections map
 * In production, this should use Redis or a distributed store
 */
const connections = new Map<
  string,
  {
    clientWs: WebSocket;
    sandboxWs: WebSocket | null;
    candidateId: string;
    sessionId: string;
  }
>();

/**
 * GET /api/interview/[id]/terminal
 * WebSocket endpoint for Modal sandbox terminal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Upgrade HTTP connection to WebSocket
  const upgradeHeader = request.headers.get("upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  try {
    // Check authentication from cookies
    const session = await auth();
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Verify candidate exists and user has access
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        sessionRecording: true,
      },
    });

    if (!candidate) {
      return new Response("Interview session not found", { status: 404 });
    }

    if (candidate.organization.members.length === 0) {
      return new Response("Forbidden", { status: 403 });
    }

    // Get or create session recording
    let sessionRecording = candidate.sessionRecording;
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId: id,
          status: "ACTIVE",
        },
      });
    }

    // Note: Actual WebSocket upgrade in Next.js 15 requires custom server
    // This is a placeholder showing the structure
    // In production, you would:
    // 1. Use a custom Next.js server with ws library
    // 2. Or use a separate WebSocket server
    // 3. Or use a service like Pusher/Ably

    return new Response(
      JSON.stringify({
        error: "WebSocket endpoint requires custom server setup",
        message:
          "Please use the standalone WebSocket server or configure a custom Next.js server",
        candidateId: id,
        sessionId: sessionRecording.id,
      }),
      {
        status: 501, // Not Implemented
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Terminal WebSocket error:", error);
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

/**
 * Handle WebSocket connection (when using custom server)
 * This function should be called from a custom server setup
 */
export async function handleWebSocketConnection(
  clientWs: WebSocket,
  candidateId: string,
  sessionId: string
) {
  const connectionId = `${candidateId}-${Date.now()}`;

  try {
    // Connect to Modal sandbox WebSocket
    const modalWsUrl = process.env.MODAL_WEBSOCKET_URL || "";
    const sandboxWs = modalWsUrl
      ? new WebSocket(
          `${modalWsUrl}/sandbox/${candidateId}?session=${sessionId}`
        )
      : null;

    // Store connection
    connections.set(connectionId, {
      clientWs,
      sandboxWs,
      candidateId,
      sessionId,
    });

    // Handle client -> sandbox messages
    clientWs.on("message", async (data) => {
      try {
        const message = data.toString();

        // Forward to sandbox
        if (sandboxWs && sandboxWs.readyState === WebSocket.OPEN) {
          sandboxWs.send(message);
        }

        // Record terminal input to session events
        await prisma.sessionEvent.create({
          data: {
            sessionId,
            type: "terminal_input",
            data: { input: message },
          },
        });
      } catch (error) {
        console.error("Client message error:", error);
      }
    });

    // Handle sandbox -> client messages
    if (sandboxWs) {
      sandboxWs.on("open", () => {
        clientWs.send(
          JSON.stringify({
            type: "system",
            message: "Connected to Modal AI Sandbox\r\n",
          })
        );
      });

      sandboxWs.on("message", async (data) => {
        try {
          const message = data.toString();

          // Forward to client
          clientWs.send(message);

          // Record terminal output to session events
          await prisma.sessionEvent.create({
            data: {
              sessionId,
              type: "terminal_output",
              data: { output: message },
            },
          });
        } catch (error) {
          console.error("Sandbox message error:", error);
        }
      });

      sandboxWs.on("error", (error) => {
        console.error("Sandbox WebSocket error:", error);
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: "Sandbox connection error",
          })
        );
      });

      sandboxWs.on("close", () => {
        clientWs.send(
          JSON.stringify({
            type: "system",
            message: "Sandbox connection closed\r\n",
          })
        );
      });
    } else {
      // No sandbox connection - echo mode for demo
      clientWs.send(
        JSON.stringify({
          type: "system",
          message:
            "Mock terminal (MODAL_WEBSOCKET_URL not configured)\r\nType commands to see them echoed back.\r\n$ ",
        })
      );

      clientWs.on("message", (data) => {
        const input = data.toString();
        clientWs.send(`$ ${input}\r\n`);
        clientWs.send(`Mock output for: ${input}\r\n$ `);
      });
    }

    // Handle client disconnect
    clientWs.on("close", () => {
      if (sandboxWs) {
        sandboxWs.close();
      }
      connections.delete(connectionId);
    });

    clientWs.on("error", (error) => {
      console.error("Client WebSocket error:", error);
      if (sandboxWs) {
        sandboxWs.close();
      }
      connections.delete(connectionId);
    });
  } catch (error) {
    console.error("WebSocket connection setup error:", error);
    clientWs.close();
  }
}

/**
 * Clean up all connections
 */
export function closeAllConnections() {
  connections.forEach(({ clientWs, sandboxWs }) => {
    clientWs.close();
    if (sandboxWs) {
      sandboxWs.close();
    }
  });
  connections.clear();
}

/**
 * Get active connections count
 */
export function getActiveConnectionsCount(): number {
  return connections.size;
}
