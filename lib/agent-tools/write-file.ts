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
  name: "write_file",
  description:
    "Write or overwrite a file in the candidate's workspace. Use this to create new files, fix bugs, implement features, or update existing code. The entire file content must be provided.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to write (e.g., 'solution.js', 'src/utils.ts')",
      },
      content: {
        type: "string",
        description: "Complete content to write to the file",
      },
    },
    required: ["path", "content"],
  },
};

/**
 * Execute the write_file tool
 */
export async function executeWriteFile(
  volumeId: string,
  input: WriteFileToolInput
): Promise<WriteFileToolOutput> {
  try {
    await modal.writeFile(volumeId, input.path, input.content);

    return {
      success: true,
      path: input.path,
      bytesWritten: input.content.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to write file",
      path: input.path,
    };
  }
}
