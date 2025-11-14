import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { modalService as modal, sessionService as sessions } from "@/lib/services";
import { getSession } from "@/lib/auth-helpers";

// Request validation for file write
const writeFileSchema = z.object({
  path: z.string().min(1, "File path is required"),
  content: z.string(),
  language: z.string().optional(),
});

/**
 * GET /api/interview/[id]/files
 * Get file tree from Modal sandbox volume, or specific file content
 * Query params: path (optional) - if provided, returns file content instead of tree
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    // Demo mode
    if (candidateId === "demo") {
      // If requesting specific file content
      if (filePath) {
        const demoContent: Record<string, string> = {
          "/workspace/solution.js": `function longestPalindrome(s) {
  // Implement your solution here
  return "";
}

module.exports = longestPalindrome;`,
          "/workspace/README.md": `# Longest Palindromic Substring

## Problem
Given a string s, return the longest palindromic substring in s.`,
        };

        return NextResponse.json({
          content: demoContent[filePath] || "",
          path: filePath,
        });
      }

      // Return file list
      return NextResponse.json({
        files: [
          {
            id: "1",
            name: "solution.js",
            type: "file",
            path: "/workspace/solution.js",
            language: "javascript",
            size: 245,
          },
          {
            id: "2",
            name: "solution.test.js",
            type: "file",
            path: "/workspace/solution.test.js",
            language: "javascript",
            size: 512,
          },
          {
            id: "3",
            name: "README.md",
            type: "file",
            path: "/workspace/README.md",
            language: "markdown",
            size: 324,
          },
        ],
        volumeId: "demo-volume",
      });
    }

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get candidate
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

    // Get volume ID
    const volumeId = candidate.volumeId;
    if (!volumeId) {
      return NextResponse.json(
        { error: "Sandbox not initialized. Call /initialize first." },
        { status: 400 }
      );
    }

    // If requesting specific file content
    if (filePath) {
      const content = await modal.readFile(volumeId, filePath);
      return NextResponse.json({
        content,
        path: filePath,
      });
    }

    // Get files from Modal volume (file list)
    const files = await modal.getFileSystem(candidateId, "/");

    return NextResponse.json({
      files: files.map((file, index) => ({
        id: `file-${index}`,
        name: file.name,
        type: file.type,
        path: file.path,
        language: getLanguageFromExtension(file.name),
        size: file.size,
      })),
      volumeId,
    });
  } catch (error) {
    console.error("Get files error:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve files",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/interview/[id]/files
 * Write file to Modal sandbox volume
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;

    // Demo mode - just return success
    if (candidateId === "demo") {
      return NextResponse.json({ success: true });
    }

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = writeFileSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { path, content, language } = validationResult.data;

    // Get candidate
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
        sessionRecording: true,
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

    // Get volume ID
    const volumeId = candidate.volumeId;
    if (!volumeId) {
      return NextResponse.json(
        { error: "Sandbox not initialized" },
        { status: 400 }
      );
    }

    // Record EVERY file change to session (comprehensive tracking)
    let previousContent: string | undefined;
    if (candidate.sessionRecording) {
      // IMPORTANT: Fetch previous content BEFORE writing new content
      // This allows us to calculate diffs
      try {
        previousContent = await modal.readFile(volumeId, path);
      } catch (error) {
        // File doesn't exist yet, this is a new file
        previousContent = undefined;
      }
    }

    // Write file to Modal volume
    await modal.writeFile(volumeId, path, content);

    // Record file change events after write
    if (candidate.sessionRecording) {
      // Record file write event (for session replay timeline)
      await sessions.recordEvent(candidate.sessionRecording.id, {
        type: "file_write",
        data: {
          filePath: path,
          fileName: path.split("/").pop() || path,
          language: language || getLanguageFromExtension(path),
          size: Buffer.byteLength(content, "utf8"),
          isNewFile: !previousContent,
          linesChanged: previousContent
            ? Math.abs(content.split("\n").length - previousContent.split("\n").length)
            : content.split("\n").length,
          timestamp: new Date().toISOString(),
        },
      });

      // ALWAYS create code snapshot (no "significant change" filter)
      // Every file write is important for comprehensive session replay
      await sessions.recordCodeSnapshot(
        candidate.sessionRecording.id,
        {
          fileId: path,
          fileName: path.split("/").pop() || path,
          language: language || getLanguageFromExtension(path),
          content,
        },
        previousContent // Pass previous content for diff calculation
      );
    }

    return NextResponse.json({
      success: true,
      path,
      size: content.length,
    });
  } catch (error) {
    console.error("Write file error:", error);
    return NextResponse.json(
      {
        error: "Failed to write file",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Helper to determine language from file extension
 */
function getLanguageFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    go: "go",
    md: "markdown",
    json: "json",
    txt: "text",
  };
  return languageMap[ext || ""] || "text";
}
