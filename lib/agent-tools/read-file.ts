/**
 * Read File Tool for Claude Agent
 * Allows AI to read file contents from the candidate's Modal sandbox
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface ReadFileToolInput {
  path: string;
}

export interface ReadFileToolOutput {
  success: boolean;
  content?: string;
  path: string;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const readFileTool: Anthropic.Tool = {
  name: "Read",
  description:
    "Read the contents of a file from the workspace. Use this to:\n" +
    "- Examine existing code before making changes\n" +
    "- Understand current implementation details\n" +
    "- Check configuration files or dependencies\n" +
    "- Verify file contents after writing\n\n" +
    "Always read a file before editing it to understand its current state.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description:
          "Path to the file (e.g., 'solution.js', 'src/utils.ts', 'package.json'). Paths are relative to /workspace.",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from. Use for large files to read specific sections.",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read. Use for large files to avoid overwhelming output.",
      },
    },
    required: ["file_path"],
  },
};

/**
 * Execute the Read tool
 * Supports both new signature (individual params) and legacy signature (input object)
 */
export async function executeReadFile(
  sessionId: string,
  filePathOrInput: string | ReadFileToolInput,
  offset?: number,
  limit?: number
): Promise<ReadFileToolOutput> {
  // Handle both new and legacy signatures
  const rawPath = typeof filePathOrInput === 'string'
    ? filePathOrInput
    : filePathOrInput.path;

  // Normalize path to always be absolute (matching file tree paths)
  const filePath = rawPath.startsWith("/") ? rawPath : `/workspace/${rawPath}`;

  try {
    const readResult = await modal.readFile(sessionId, filePath);
    if (!readResult.success) {
      return {
        success: false,
        error: readResult.error || "Failed to read file",
        path: filePath,
      };
    }

    // Handle empty file or missing content
    let content = readResult.content ?? "";

    // Apply offset and limit if provided
    if (offset !== undefined && offset > 0) {
      content = content.slice(offset);
    }
    if (limit !== undefined && limit > 0) {
      content = content.slice(0, limit);
    }

    return {
      success: true,
      content,
      path: filePath,  // Return normalized absolute path
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to read file",
      path: filePath,
    };
  }
}
