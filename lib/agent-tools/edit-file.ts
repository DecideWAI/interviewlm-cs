/**
 * Edit File Tool for Claude Agent
 * Allows AI to make surgical edits to files in the candidate's Modal sandbox
 * Uses string replacement for precise modifications
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface EditFileToolOutput {
  success: boolean;
  path: string;
  matchFound: boolean;
  replacementsCount?: number;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const editFileTool: Anthropic.Tool = {
  name: "Edit",
  description:
    "Make surgical edits to a file by replacing a specific string with new content. More efficient than rewriting the entire file for small changes. The old_string must match exactly (including whitespace and indentation).",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the file to edit (e.g., 'solution.js', 'src/utils.ts')",
      },
      old_string: {
        type: "string",
        description: "The exact string to find and replace (must match exactly including whitespace)",
      },
      new_string: {
        type: "string",
        description: "The new string to replace the old_string with",
      },
    },
    required: ["file_path", "old_string", "new_string"],
  },
};

/**
 * Execute the Edit tool
 * Reads the file, replaces the old_string with new_string, and writes back
 */
export async function executeEditFile(
  sessionId: string,
  filePath: string,
  oldString: string,
  newString: string
): Promise<EditFileToolOutput> {
  try {
    // Read the current file content
    const readResult = await modal.readFile(sessionId, filePath);
    if (!readResult.success || !readResult.content) {
      return {
        success: false,
        path: filePath,
        matchFound: false,
        error: readResult.error || `Could not read file: ${filePath}`,
      };
    }
    const currentContent = readResult.content;

    // Check if the old string exists in the file
    if (!currentContent.includes(oldString)) {
      return {
        success: false,
        path: filePath,
        matchFound: false,
        error: `Could not find the exact string to replace. Make sure the old_string matches exactly, including whitespace and indentation.`,
      };
    }

    // Count occurrences
    const occurrences = (currentContent.match(new RegExp(escapeRegExp(oldString), 'g')) || []).length;

    // Replace the old string with the new string
    const newContent = currentContent.replace(oldString, newString);

    // Write the modified content back
    await modal.writeFile(sessionId, filePath, newContent);

    return {
      success: true,
      path: filePath,
      matchFound: true,
      replacementsCount: 1, // Only replaces first occurrence
    };
  } catch (error) {
    return {
      success: false,
      path: filePath,
      matchFound: false,
      error: error instanceof Error ? error.message : "Failed to edit file",
    };
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
