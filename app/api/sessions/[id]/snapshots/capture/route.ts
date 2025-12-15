import { NextRequest, NextResponse } from "next/server";
import { readFile } from "@/lib/services/modal";
import { uploadFileContent } from "@/lib/services/gcs";
import prisma from "@/lib/prisma";
import { recordCodeSnapshot } from "@/lib/services/sessions";

/**
 * POST /api/sessions/[id]/snapshots/capture
 *
 * Capture file snapshots from Modal sandbox and upload to GCS.
 * Called by LangGraph agents after tool execution.
 *
 * This is a fire-and-forget endpoint - it responds immediately with 202 Accepted
 * and processes uploads in the background. Failures are logged but don't affect
 * the caller.
 *
 * Request body:
 * - candidateId: Candidate ID (used for Modal sandbox and GCS path)
 * - filesModified: Array of file paths that were modified
 *
 * Security:
 * - Accepts internal API key for server-to-server calls
 * - No user auth required (this is called from LangGraph)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Verify internal API key (for LangGraph -> Next.js calls)
    const apiKey = request.headers.get("x-internal-api-key");
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      console.warn("[SnapshotCapture] Invalid or missing API key");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { candidateId, filesModified } = body as {
      candidateId: string;
      filesModified: string[];
    };

    if (!candidateId) {
      return NextResponse.json(
        { error: "Missing candidateId" },
        { status: 400 }
      );
    }

    if (!filesModified || !Array.isArray(filesModified) || filesModified.length === 0) {
      return NextResponse.json({
        message: "No files to capture",
        captured: 0,
      });
    }

    console.log(
      `[SnapshotCapture] Capturing ${filesModified.length} files for session ${sessionId}, candidate ${candidateId}`
    );

    // Start background processing (fire-and-forget)
    // We don't await this - respond immediately
    captureFilesInBackground(sessionId, candidateId, filesModified).catch(
      (err) => {
        console.error("[SnapshotCapture] Background capture failed:", err);
      }
    );

    // Respond immediately with 202 Accepted
    return NextResponse.json(
      {
        message: "Snapshot capture started",
        sessionId,
        candidateId,
        filesQueued: filesModified.length,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[SnapshotCapture] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Background file capture and upload
 * Reads files from Modal sandbox and uploads to GCS
 */
async function captureFilesInBackground(
  sessionId: string,
  candidateId: string,
  filesModified: string[]
): Promise<void> {
  const results: Array<{
    filePath: string;
    success: boolean;
    checksum?: string;
    error?: string;
  }> = [];

  // Sequence numbers are handled by recordCodeSnapshot helper

  for (const filePath of filesModified) {
    try {
      // Read file content from Modal sandbox
      const readResult = await readFile(candidateId, filePath);

      if (!readResult.success || !readResult.content) {
        console.warn(
          `[SnapshotCapture] Failed to read ${filePath}: ${readResult.error}`
        );
        results.push({ filePath, success: false, error: readResult.error });
        continue;
      }

      const content = readResult.content;

      // Upload to GCS
      const uploadResult = await uploadFileContent(candidateId, content);

      console.log(
        `[SnapshotCapture] ${filePath} -> ${uploadResult.checksum.slice(0, 12)}... ` +
          `(${uploadResult.alreadyExists ? "exists" : "uploaded"}, ` +
          `${content.length} -> ${uploadResult.compressedSize} bytes)`
      );

      // Record code snapshot event in event store using helper (includes fullContent for offline replay)
      try {
        await recordCodeSnapshot(
          sessionId,
          {
            fileId: filePath,
            fileName: filePath.split("/").pop() || filePath,
            language: detectLanguage(filePath),
            content, // Include full content for offline replay
          },
          "AI" // Snapshots captured from LangGraph agent tool executions are AI-originated
        );
      } catch (dbError) {
        // Non-fatal - GCS upload succeeded
        console.warn(
          `[SnapshotCapture] Failed to record snapshot in DB: ${dbError}`
        );
      }

      results.push({
        filePath,
        success: true,
        checksum: uploadResult.checksum,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[SnapshotCapture] Error processing ${filePath}:`, errorMsg);
      results.push({ filePath, success: false, error: errorMsg });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `[SnapshotCapture] Completed for session ${sessionId}: ${successCount}/${filesModified.length} files captured`
  );
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    r: "r",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    md: "markdown",
    txt: "text",
  };
  return languageMap[ext || ""] || "text";
}
