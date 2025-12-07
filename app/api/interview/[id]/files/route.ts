import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { modalService as modal, sessionService as sessions } from "@/lib/services";
import { getSession } from "@/lib/auth-helpers";
import { fileStreamManager } from "@/lib/services/file-streaming";

// Request validation for file write
const writeFileSchema = z.object({
  path: z.string().min(1, "File path is required"),
  content: z.string(),
  language: z.string().optional(),
  type: z.enum(["file", "folder"]).optional().default("file"),
});

/**
 * GET /api/interview/[id]/files
 * Get file tree from Modal sandbox volume, or specific file content
 * Query params:
 *   - path (optional) - if provided, returns file content instead of tree
 *   - bulk (optional) - if true, returns all file contents in a single response
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");
    const bulk = searchParams.get("bulk") === "true";

    // Demo mode
    if (candidateId === "demo") {
      const demoContent: Record<string, string> = {
        "/workspace/solution.js": `function longestPalindrome(s) {
  // Implement your solution here
  return "";
}

module.exports = longestPalindrome;`,
        "/workspace/solution.test.js": `const longestPalindrome = require('./solution');

describe('longestPalindrome', () => {
  test('should find longest palindrome', () => {
    expect(longestPalindrome('babad')).toBe('bab');
  });
});`,
        "/workspace/README.md": `# Longest Palindromic Substring

## Problem
Given a string s, return the longest palindromic substring in s.`,
      };

      // Bulk mode - return all file contents
      if (bulk) {
        return NextResponse.json({ contents: demoContent });
      }

      // If requesting specific file content
      if (filePath) {
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

    // Get candidate with session recording for tracked files
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
        sessionRecording: {
          select: {
            id: true,
            trackedFiles: true,
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

    // Bulk mode - fetch all tracked file contents at once
    if (bulk) {
      // Get tracked files from session recording
      let trackedFiles: string[] = [];
      if (candidate.sessionRecording) {
        trackedFiles = (candidate.sessionRecording.trackedFiles as string[]) || [];
      }

      // If no tracked files, return empty
      if (trackedFiles.length === 0) {
        return NextResponse.json({ contents: {} });
      }

      // Read all tracked files in parallel
      const contents: Record<string, string> = {};
      const results = await Promise.all(
        trackedFiles.map(async (path) => {
          try {
            const result = await modal.readFile(candidateId, path);
            return { path, content: result.success ? (result.content || "") : "" };
          } catch {
            return { path, content: "" };
          }
        })
      );

      results.forEach(({ path, content }) => {
        contents[path] = content;
      });

      return NextResponse.json({ contents });
    }

    // If requesting specific file content
    if (filePath) {
      // Use candidateId (not volumeId) for sandbox lookup - Modal caches by candidateId
      const result = await modal.readFile(candidateId, filePath);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Failed to read file" },
          { status: 500 }
        );
      }
      return NextResponse.json({
        content: result.content || "",
        path: filePath,
      });
    }

    // Get tracked files from session recording and build file tree
    let trackedFiles: string[] = [];
    if (candidate.sessionRecording) {
      trackedFiles = (candidate.sessionRecording.trackedFiles as string[]) || [];
    }

    // Build file tree from tracked files
    const files = buildFileTreeFromPaths(trackedFiles);

    fileIdCounter = 0; // Reset counter for each request
    return NextResponse.json({
      files: files.map(transformFileNode),
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

    const { path, content, language, type } = validationResult.data;

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
        // Use candidateId (not volumeId) for sandbox lookup - Modal caches by candidateId
        const result = await modal.readFile(candidateId, path);
        previousContent = result.success ? result.content : undefined;
      } catch (error) {
        // File doesn't exist yet, this is a new file
        previousContent = undefined;
      }
    }

    // Create folder or write file based on type
    // Use candidateId (not volumeId) for sandbox lookup - Modal caches by candidateId
    if (type === "folder") {
      // Create directory
      const result = await modal.createDirectory(candidateId, path);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Failed to create folder" },
          { status: 500 }
        );
      }

      // Record folder creation event and track the folder
      if (candidate.sessionRecording) {
        await sessions.recordEvent(candidate.sessionRecording.id, {
          type: "folder_create",
          data: {
            folderPath: path,
            folderName: path.split("/").pop() || path,
            timestamp: new Date().toISOString(),
          },
        });

        // Track new folder
        const fullPath = path.startsWith('/workspace') ? path : `/workspace/${path}`;
        await sessions.addTrackedFile(candidate.sessionRecording.id, fullPath);
      }

      // Broadcast folder creation event
      fileStreamManager.broadcastFileChange({
        sessionId: candidateId,
        type: 'create',
        path,
        fileType: 'folder',
        name: path.split('/').pop() || path,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        path,
        type: "folder",
      });
    }

    // Write file to Modal volume
    await modal.writeFile(candidateId, path, content);

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

      // Track new files in session's trackedFiles list
      if (!previousContent) {
        // Ensure path starts with /workspace
        const fullPath = path.startsWith('/workspace') ? path : `/workspace/${path}`;
        await sessions.addTrackedFile(candidate.sessionRecording.id, fullPath);
      }
    }

    // Broadcast file change event
    fileStreamManager.broadcastFileChange({
      sessionId: candidateId,
      type: previousContent ? 'update' : 'create',
      path,
      fileType: 'file',
      name: path.split('/').pop() || path,
      timestamp: new Date().toISOString(),
    });

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
 * DELETE /api/interview/[id]/files
 * Delete file or folder from Modal sandbox volume
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;

    // Demo mode - just return success
    if (candidateId === "demo") {
      return NextResponse.json({ success: true, deleted: "demo-file" });
    }

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { path } = body;

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "File path is required" },
        { status: 400 }
      );
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

    // Delete file from Modal sandbox
    const result = await modal.deleteFile(candidateId, path);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to delete file" },
        { status: 500 }
      );
    }

    // Record file deletion event and remove from tracked files
    if (candidate.sessionRecording) {
      await sessions.recordEvent(candidate.sessionRecording.id, {
        type: "file_delete",
        data: {
          filePath: path,
          fileName: path.split("/").pop() || path,
          timestamp: new Date().toISOString(),
        },
      });

      // Remove from tracked files
      const fullPath = path.startsWith('/workspace') ? path : `/workspace/${path}`;
      await sessions.removeTrackedFile(candidate.sessionRecording.id, fullPath);
    }

    // Broadcast file deletion event
    fileStreamManager.broadcastFileChange({
      sessionId: candidateId,
      type: 'delete',
      path,
      fileType: 'file',
      name: path.split('/').pop() || path,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      deleted: path,
    });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete file",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Directories and files to exclude from file listing and bulk fetch
 * These are system/dependency directories that shouldn't be shown to users
 */
const EXCLUDED_PATHS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  '.env',
  'env',
  'dist',
  'build',
  '.next',
  '.cache',
  '.npm',
  '.yarn',
  'coverage',
  '.nyc_output',
  '.tox',
  '.mypy_cache',
  '.ruff_cache',
  'target',           // Rust/Java build output
  'vendor',           // Go dependencies
  '.gradle',
  '.idea',
  '.vscode',
  '.DS_Store',
]);

/**
 * File extensions to exclude from listing
 */
const EXCLUDED_EXTENSIONS = new Set([
  '.pyc',
  '.pyo',
  '.pyd',
  '.so',
  '.dll',
  '.dylib',
  '.class',
  '.o',
  '.obj',
]);

/**
 * Check if a file/directory should be excluded from listing
 */
function shouldExcludePath(name: string): boolean {
  // Check if the name itself is excluded
  if (EXCLUDED_PATHS.has(name)) {
    return true;
  }

  // Check file extension
  const ext = name.includes('.') ? '.' + name.split('.').pop()?.toLowerCase() : '';
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}

/**
 * Filter out excluded paths from file tree
 * Returns a new array with excluded directories/files removed
 */
function filterFileTree(files: { name: string; path: string; type: string; children?: any[] }[]): { name: string; path: string; type: string; children?: any[] }[] {
  return files
    .filter(file => !shouldExcludePath(file.name))
    .map(file => {
      if (file.children && file.children.length > 0) {
        return { ...file, children: filterFileTree(file.children) };
      }
      return file;
    });
}

/**
 * Build a file tree structure from a flat list of file paths
 * Converts ["/workspace/src/index.js", "/workspace/README.md"] into a nested structure
 */
function buildFileTreeFromPaths(paths: string[]): { name: string; path: string; type: string; children?: any[] }[] {
  if (paths.length === 0) return [];

  // Build a nested structure
  const root: Record<string, any> = {};

  for (const filePath of paths) {
    // Remove /workspace prefix for processing
    const normalizedPath = filePath.startsWith('/workspace/')
      ? filePath.slice('/workspace/'.length)
      : filePath.startsWith('/workspace')
        ? filePath.slice('/workspace'.length)
        : filePath;

    const parts = normalizedPath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1 && !filePath.endsWith('/');
      const currentPath = '/workspace/' + parts.slice(0, i + 1).join('/');

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : {},
        };
      }

      if (!isFile) {
        current = current[part].children;
      }
    }
  }

  // Convert the nested object to array format
  function objectToArray(obj: Record<string, any>): any[] {
    return Object.values(obj).map((item: any) => {
      if (item.children && typeof item.children === 'object') {
        const childArray = objectToArray(item.children);
        return {
          ...item,
          children: childArray.length > 0 ? childArray : undefined,
        };
      }
      return item;
    });
  }

  return objectToArray(root);
}

/**
 * Helper to extract all file paths from the file tree (for bulk fetch)
 * Recursively traverses directories to collect all file paths
 * Excludes system directories like node_modules, .git, etc.
 */
function extractFilePaths(files: { name: string; path: string; type: string; children?: any[] }[]): string[] {
  const paths: string[] = [];

  function traverse(nodes: { name: string; path: string; type: string; children?: any[] }[]) {
    for (const node of nodes) {
      // Skip excluded directories/files
      if (shouldExcludePath(node.name)) {
        continue;
      }

      if (node.type === "file") {
        paths.push(node.path);
      } else if (node.type === "directory" && node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(files);
  return paths;
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

/**
 * Helper to transform Modal FileNode to frontend FileNode format
 * Recursively transforms children for directories
 */
let fileIdCounter = 0;
function transformFileNode(file: { name: string; path: string; type: string; size?: number; children?: any[] }): {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  language: string;
  size?: number;
  children?: any[];
} {
  const transformed: any = {
    id: `file-${fileIdCounter++}`,
    name: file.name,
    type: file.type === "directory" ? "folder" : "file",
    path: file.path,
    language: getLanguageFromExtension(file.name),
    size: file.size,
  };

  if (file.children && file.children.length > 0) {
    transformed.children = file.children.map(transformFileNode);
  }

  return transformed;
}
