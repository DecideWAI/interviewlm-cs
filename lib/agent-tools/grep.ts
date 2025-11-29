/**
 * Grep Tool for Claude Agent
 * Allows AI to search for patterns in files within the candidate's Modal sandbox
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface GrepToolOutput {
  success: boolean;
  matches: GrepMatch[];
  pattern: string;
  searchPath: string;
  matchCount: number;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const grepTool: Anthropic.Tool = {
  name: "Grep",
  description:
    "Search for a text pattern in files. Returns matching lines with file paths and line numbers. Useful for finding function definitions, usages, imports, or any text patterns across the codebase.",
  input_schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The regex pattern to search for (e.g., 'function\\s+\\w+', 'TODO', 'import.*lodash')",
      },
      path: {
        type: "string",
        description: "Directory or file to search in, relative to workspace root. Defaults to '.'",
      },
      include: {
        type: "string",
        description: "File pattern to include (e.g., '*.ts', '*.js'). Defaults to all files.",
      },
    },
    required: ["pattern"],
  },
};

/**
 * Execute the Grep tool
 * Uses grep command to search for patterns in files
 */
export async function executeGrep(
  sessionId: string,
  pattern: string,
  path?: string,
  include?: string
): Promise<GrepToolOutput> {
  try {
    const searchPath = path || ".";
    const workspacePath = `/workspace/${searchPath}`.replace(/\/+/g, "/");

    // Build grep command
    // -r: recursive
    // -n: show line numbers
    // -H: show filenames
    // --include: file pattern filter
    let grepCommand = `grep -rn -H`;

    if (include) {
      grepCommand += ` --include="${include}"`;
    }

    // Escape special characters in pattern for shell
    const escapedPattern = pattern.replace(/"/g, '\\"');
    grepCommand += ` "${escapedPattern}" ${workspacePath}`;

    // Limit output to prevent overwhelming results
    grepCommand += " 2>/dev/null | head -50";

    const result = await modal.runCommand(sessionId, grepCommand, "/workspace");

    // grep returns exit code 1 if no matches found - that's not an error
    if (result.exitCode !== 0 && result.exitCode !== 1 && result.stderr) {
      return {
        success: false,
        matches: [],
        pattern,
        searchPath,
        matchCount: 0,
        error: result.stderr,
      };
    }

    // Parse grep output: file:line:content
    const matches: GrepMatch[] = [];
    const lines = result.stdout.split("\n").filter((line: string) => line.trim().length > 0);

    for (const line of lines) {
      // Match pattern: /path/to/file:123:content
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match) {
        matches.push({
          file: match[1].replace(/^\/workspace\//, ""),
          line: parseInt(match[2], 10),
          content: match[3],
        });
      }
    }

    return {
      success: true,
      matches,
      pattern,
      searchPath,
      matchCount: matches.length,
    };
  } catch (error) {
    return {
      success: false,
      matches: [],
      pattern,
      searchPath: path || ".",
      matchCount: 0,
      error: error instanceof Error ? error.message : "Failed to search files",
    };
  }
}
