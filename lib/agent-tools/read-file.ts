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
  name: "read_file",
  description:
    "Read the contents of a file in the candidate's workspace. Use this to examine code, understand the current implementation, or check file contents before making changes. The file path should be relative to the workspace root (e.g., 'solution.js', 'tests/test.js').",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Path to the file relative to workspace root (e.g., 'solution.js', 'src/index.ts')",
      },
    },
    required: ["path"],
  },
};

/**
 * Execute the read_file tool
 */
export async function executeReadFile(
  volumeId: string,
  input: ReadFileToolInput
): Promise<ReadFileToolOutput> {
  try {
    const content = await modal.readFile(volumeId, input.path);

    return {
      success: true,
      content,
      path: input.path,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to read file",
      path: input.path,
    };
  }
}
