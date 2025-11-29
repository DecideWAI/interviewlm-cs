/**
 * Write File Tool for Claude Agent
 * Allows AI to write or overwrite files in the candidate's Modal sandbox
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface WriteFileToolInput {
  path: string;
  content: string;
}

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
    "Write or overwrite a file in the candidate's workspace. Use this to create new files, fix bugs, implement features, or update existing code. The entire file content must be provided.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the file to write (e.g., 'solution.js', 'src/utils.ts')",
      },
      content: {
        type: "string",
        description: "Complete content to write to the file",
      },
    },
    required: ["file_path", "content"],
  },
};

/**
 * Execute the Write tool
 * Supports both new signature (individual params) and legacy signature (input object)
 */
export async function executeWriteFile(
  sessionId: string,
  filePathOrInput: string | WriteFileToolInput,
  content?: string
): Promise<WriteFileToolOutput> {
  // Handle both new and legacy signatures
  const filePath = typeof filePathOrInput === 'string'
    ? filePathOrInput
    : filePathOrInput.path;
  const fileContent = typeof filePathOrInput === 'string'
    ? content!
    : filePathOrInput.content;

  try {
    await modal.writeFile(sessionId, filePath, fileContent);

    return {
      success: true,
      path: filePath,
      bytesWritten: fileContent.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to write file",
      path: filePath,
    };
  }
}
