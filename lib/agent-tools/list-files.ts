/**
 * List Files Tool for Claude Agent
 * Allows AI to list files and directories in the candidate's Modal sandbox
 * Uses Modal's native listFiles API for efficiency
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface FileEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
}

export interface ListFilesToolOutput {
  success: boolean;
  entries: FileEntry[];
  directory: string;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const listFilesTool: Anthropic.Tool = {
  name: "ListFiles",
  description:
    "List contents of a directory. Use this to:\n" +
    "- See what files exist in the workspace\n" +
    "- Explore project structure\n" +
    "- Find files before reading them\n\n" +
    "Returns file names, types (file/directory), and sizes. Use Glob for pattern-based search.",
  input_schema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Directory to list (default: workspace root '.'). Example: 'src' to list src/ contents",
      },
    },
  },
};

/**
 * Execute the ListFiles tool
 * Uses Modal's native listFiles API for better performance
 */
export async function executeListFiles(
  sessionId: string,
  directory?: string
): Promise<ListFilesToolOutput> {
  try {
    const dirPath = directory || ".";
    // Normalize path - Modal's listFiles expects absolute path
    const workspacePath = dirPath.startsWith("/")
      ? dirPath
      : `/workspace/${dirPath}`.replace(/\/+/g, "/");

    // Use Modal's native listFiles API (more efficient than running ls command)
    const files = await modal.listFiles(sessionId, workspacePath);

    // Transform Modal's FileNode[] to our FileEntry[]
    const entries: FileEntry[] = files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.type === "file" ? file.size : undefined,
    }));

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "directory" ? -1 : 1;
    });

    return {
      success: true,
      entries,
      directory: dirPath,
    };
  } catch (error) {
    return {
      success: false,
      entries: [],
      directory: directory || ".",
      error: error instanceof Error ? error.message : "Failed to list directory",
    };
  }
}
