/**
 * List Files Tool for Claude Agent
 * Allows AI to list files and directories in the candidate's Modal sandbox
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
 * Execute the list_files tool
 */
export async function executeListFiles(
  sessionId: string,
  directory?: string
): Promise<ListFilesToolOutput> {
  try {
    const dirPath = directory || ".";
    const workspacePath = `/workspace/${dirPath}`.replace(/\/+/g, "/");

    // Use ls with specific format for parsing
    // -l: long format (includes size)
    // -a: show hidden files
    // -p: append / to directories
    // --time-style=+: suppress time for easier parsing
    const result = await modal.runCommand(
      sessionId,
      `ls -lap --time-style=+ ${workspacePath} 2>/dev/null || ls -lap ${workspacePath} 2>/dev/null`,
      "/workspace"
    );

    if (result.exitCode !== 0) {
      return {
        success: false,
        entries: [],
        directory: dirPath,
        error: result.stderr || `Directory not found: ${dirPath}`,
      };
    }

    // Parse ls -l output
    // Example: drwxr-xr-x 2 user group 4096  src/
    //          -rw-r--r-- 1 user group 1234  file.js
    const entries: FileEntry[] = [];
    const lines = result.stdout.split("\n").slice(1); // Skip "total" line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "." || trimmed === "..") continue;

      // Parse the ls output
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        const permissions = parts[0];
        const size = parseInt(parts[4], 10) || 0;
        const name = parts.slice(5).join(" ").replace(/\/$/, ""); // Handle filenames with spaces

        if (!name || name === "." || name === "..") continue;

        const isDirectory = permissions.startsWith("d") || trimmed.endsWith("/");

        entries.push({
          name,
          type: isDirectory ? "directory" : "file",
          size: isDirectory ? undefined : size,
        });
      }
    }

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
