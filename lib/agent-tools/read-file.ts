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
    "Read the contents of a file in the candidate's workspace. Use this to examine code, understand the current implementation, or check file contents before making changes. The file path should be relative to the workspace root (e.g., 'solution.js', 'tests/test.js').",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description:
          "Path to the file relative to workspace root (e.g., 'solution.js', 'src/index.ts')",
      },
      offset: {
        type: "number",
        description: "Character offset to start reading from (optional)",
      },
      limit: {
        type: "number",
        description: "Maximum number of characters to read (optional)",
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
  const filePath = typeof filePathOrInput === 'string'
    ? filePathOrInput
    : filePathOrInput.path;

  try {
    let content = await modal.readFile(sessionId, filePath);

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
      path: filePath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to read file",
      path: filePath,
    };
  }
}
