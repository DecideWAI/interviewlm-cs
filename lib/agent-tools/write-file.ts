/**
 * Write File Tool for Claude Agent
 * Allows AI to write or overwrite files in the candidate's Modal sandbox
 */

import { modalService as modal } from "@/lib/services";
import { fileStreamManager } from "@/lib/services/file-streaming";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface WriteFileToolOutput {
  success: boolean;
  path: string;
  bytesWritten?: number;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const writeFileTool: Anthropic.Tool = {
  name: "Write",
  description:
    "Create a new file or completely overwrite an existing file. Use this to:\n" +
    "- Create new source files (solution.js, utils.ts, etc.)\n" +
    "- Rewrite a file when making extensive changes\n" +
    "- Create configuration files (package.json, tsconfig.json)\n\n" +
    "For small, targeted changes to existing files, prefer the Edit tool instead.\n" +
    "The entire file content must be provided - this tool does not append.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path where the file should be written (e.g., 'solution.js', 'src/helpers.ts'). Paths are relative to /workspace.",
      },
      file_content: {
        type: "string",
        description: "The complete file content to write. REQUIRED - must include the entire file.",
      },
    },
    required: ["file_path", "file_content"],
  },
};

/**
 * Execute the Write tool
 */
export async function executeWriteFile(
  sessionId: string,
  filePath: string,
  content: string
): Promise<WriteFileToolOutput> {
  // Validate inputs
  if (!filePath) {
    return {
      success: false,
      path: '',
      error: "Missing required parameter: file_path",
    };
  }

  if (content === undefined || content === null) {
    return {
      success: false,
      path: filePath,
      error: "Missing required parameter: file_content. You MUST provide the complete file content.",
    };
  }

  // Normalize path to always be absolute (matching file tree paths)
  const absPath = filePath.startsWith("/") ? filePath : `/workspace/${filePath}`;

  try {
    // Check if file exists (to determine if this is create or update)
    let isNewFile = true;
    try {
      const existing = await modal.readFile(sessionId, absPath);
      isNewFile = !existing.success;
    } catch {
      isNewFile = true;
    }

    await modal.writeFile(sessionId, absPath, content);

    // Broadcast file change event for real-time file tree updates
    fileStreamManager.broadcastFileChange({
      sessionId,
      type: isNewFile ? 'create' : 'update',
      path: absPath,
      fileType: 'file',
      name: absPath.split('/').pop() || absPath,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      path: absPath,
      bytesWritten: content.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to write file",
      path: absPath,
    };
  }
}
