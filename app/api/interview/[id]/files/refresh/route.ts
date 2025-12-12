import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { modalService as modal } from "@/lib/services";
import { getSession } from "@/lib/auth-helpers";

/**
 * POST /api/interview/[id]/files/refresh
 *
 * Refresh file tree and contents directly from the sandbox.
 * Unlike the bulk endpoint which uses trackedFiles from DB,
 * this fetches the actual current state of the sandbox filesystem.
 *
 * Returns:
 * - files: FileNode[] - The current file tree structure
 * - contents: Record<string, string> - Content of all files
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;

    // Demo mode
    if (candidateId === "demo") {
      return NextResponse.json({
        files: [
          { id: "1", name: "solution.js", type: "file", path: "/workspace/solution.js" },
          { id: "2", name: "README.md", type: "file", path: "/workspace/README.md" },
        ],
        contents: {
          "/workspace/solution.js": "// Demo solution",
          "/workspace/README.md": "# Demo README",
        },
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
        { error: "Sandbox not initialized" },
        { status: 400 }
      );
    }

    console.log(`[FilesRefresh] Starting refresh for ${candidateId}`);

    // Get file tree directly from sandbox
    const sandboxFiles = await modal.getFileSystem(candidateId, "/workspace");
    console.log(`[FilesRefresh] Found ${sandboxFiles.length} top-level items`);

    if (!sandboxFiles || sandboxFiles.length === 0) {
      return NextResponse.json({
        files: [],
        contents: {},
      });
    }

    // Filter out system directories
    const filteredFiles = filterFileTree(sandboxFiles);

    // Extract all file paths from the tree
    const filePaths = extractFilePaths(filteredFiles);
    console.log(`[FilesRefresh] Extracting content for ${filePaths.length} files`);

    // Fetch content for all files in parallel
    const contents: Record<string, string> = {};
    const results = await Promise.all(
      filePaths.map(async (path) => {
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

    // Transform file nodes for frontend
    fileIdCounter = 0;
    const transformedFiles = filteredFiles.map(transformFileNode);

    console.log(`[FilesRefresh] Complete: ${transformedFiles.length} files, ${Object.keys(contents).length} contents`);

    return NextResponse.json({
      files: transformedFiles,
      contents,
    });
  } catch (error) {
    console.error("[FilesRefresh] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to refresh files",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Directories and files to exclude from file listing
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
  'target',
  'vendor',
  '.gradle',
  '.idea',
  '.vscode',
  '.DS_Store',
]);

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

function shouldExcludePath(name: string): boolean {
  if (EXCLUDED_PATHS.has(name)) {
    return true;
  }
  const ext = name.includes('.') ? '.' + name.split('.').pop()?.toLowerCase() : '';
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return true;
  }
  return false;
}

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

function extractFilePaths(files: { name: string; path: string; type: string; children?: any[] }[]): string[] {
  const paths: string[] = [];

  function traverse(nodes: { name: string; path: string; type: string; children?: any[] }[]) {
    for (const node of nodes) {
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

function getLanguageFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    txt: "text",
  };
  return languageMap[ext || ""] || "text";
}

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
