import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { getTunnelUrl } from "@/lib/services/modal";

/**
 * GET /api/interview/[id]/terminal/tunnel
 * Returns the WebSocket tunnel URL for direct terminal connection via ttyd
 *
 * Response:
 * - 200: { success: true, data: { tunnelUrl, protocol, port } }
 * - 401: Unauthorized
 * - 503: { error: "...", fallback: true } - Tunnel not available, use HTTP fallback
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Demo mode bypass - tunnel not available in demo
  const isDemoMode = id === "demo";
  if (isDemoMode) {
    return NextResponse.json(
      { error: "Demo mode - tunnel not available", fallback: true },
      { status: 503 }
    );
  }

  try {
    // Verify authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get tunnel URL from Modal service
    const tunnelUrl = await getTunnelUrl(id);

    if (!tunnelUrl) {
      return NextResponse.json(
        { error: "Tunnel not available", fallback: true },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        tunnelUrl,
        protocol: "wss",
        port: 7681,
      },
    });
  } catch (error) {
    console.error("Tunnel URL error:", error);
    return NextResponse.json(
      {
        error: "Failed to get tunnel URL",
        fallback: true,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
