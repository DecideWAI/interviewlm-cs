import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import {
  downloadFileContent,
  getSignedDownloadUrl,
  getBatchSignedUrls,
} from "@/lib/services/gcs";

/**
 * GET /api/sessions/[id]/files
 *
 * Retrieve file content from GCS for session replay.
 *
 * Query params:
 * - checksum: Content checksum to fetch
 * - candidateId: Candidate ID for path lookup
 * - mode: "content" (default) returns JSON, "redirect" returns 302 to signed URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const checksum = searchParams.get("checksum");
    const candidateId = searchParams.get("candidateId");
    const mode = searchParams.get("mode") || "content";

    if (!checksum) {
      return NextResponse.json(
        { error: "Missing checksum parameter" },
        { status: 400 }
      );
    }

    // Look up session recording to get candidateId if not provided
    let effectiveCandidateId = candidateId;

    if (!effectiveCandidateId) {
      const sessionRecording = await prisma.sessionRecording.findFirst({
        where: {
          OR: [{ id }, { candidateId: id }],
        },
        select: { candidateId: true },
      });

      if (!sessionRecording) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      effectiveCandidateId = sessionRecording.candidateId;
    }

    // Verify user has access to this session
    const hasAccess = await prisma.candidate.findFirst({
      where: {
        id: effectiveCandidateId,
        OR: [
          { createdById: session.user.id },
          {
            organization: {
              members: {
                some: {
                  userId: session.user.id,
                },
              },
            },
          },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Mode: redirect - return 302 to signed URL
    if (mode === "redirect") {
      const signedUrl = await getSignedDownloadUrl(
        effectiveCandidateId,
        checksum
      );
      return NextResponse.redirect(signedUrl, 302);
    }

    // Mode: content - download and return as JSON
    const content = await downloadFileContent(effectiveCandidateId, checksum);
    return NextResponse.json({ content, checksum });
  } catch (error) {
    console.error("[API] Error fetching file content:", error);

    // Handle file not found
    if (
      error instanceof Error &&
      error.message.includes("No such object")
    ) {
      return NextResponse.json(
        { error: "File content not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch file content" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sessions/[id]/files
 *
 * Batch get signed URLs for multiple files.
 * More efficient than multiple GET requests when loading many files.
 *
 * Request body:
 * - checksums: Array of content checksums
 * - candidateId: (optional) Candidate ID, looked up from session if not provided
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { checksums, candidateId } = body as {
      checksums: string[];
      candidateId?: string;
    };

    if (!checksums || !Array.isArray(checksums) || checksums.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid checksums array" },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    if (checksums.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 checksums per batch request" },
        { status: 400 }
      );
    }

    // Look up candidateId if not provided
    let effectiveCandidateId = candidateId;

    if (!effectiveCandidateId) {
      const sessionRecording = await prisma.sessionRecording.findFirst({
        where: {
          OR: [{ id }, { candidateId: id }],
        },
        select: { candidateId: true },
      });

      if (!sessionRecording) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      effectiveCandidateId = sessionRecording.candidateId;
    }

    // Verify user has access
    const hasAccess = await prisma.candidate.findFirst({
      where: {
        id: effectiveCandidateId,
        OR: [
          { createdById: session.user.id },
          {
            organization: {
              members: {
                some: {
                  userId: session.user.id,
                },
              },
            },
          },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get batch signed URLs
    const urlMap = await getBatchSignedUrls(effectiveCandidateId, checksums);

    // Convert Map to object for JSON response
    const urls: Record<string, string> = {};
    urlMap.forEach((url, checksum) => {
      urls[checksum] = url;
    });

    return NextResponse.json({
      urls,
      found: Object.keys(urls).length,
      requested: checksums.length,
    });
  } catch (error) {
    console.error("[API] Error getting batch signed URLs:", error);
    return NextResponse.json(
      { error: "Failed to get signed URLs" },
      { status: 500 }
    );
  }
}
