/**
 * Glob Tool for Claude Agent
 * Allows AI to find files matching glob patterns in the candidate's Modal sandbox
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface GlobToolOutput {
  success: boolean;
  files: string[];
  pattern: string;
  searchPath: string;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const globTool: Anthropic.Tool = {
  name: "Glob",
  description:
    "Find files matching a glob pattern in the workspace. Useful for discovering project structure, finding all files of a certain type, or locating specific files. Patterns like '**/*.js' find all JavaScript files.",
  input_schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match files (e.g., '**/*.js', 'src/**/*.ts', '*.json')",
      },
      path: {
        type: "string",
        description: "Directory to search in, relative to workspace root. Defaults to '.'",
      },
    },
    required: ["pattern"],
  },
};

/**
 * Execute the Glob tool
 * Uses find command to match files by pattern
 */
export async function executeGlob(
  sessionId: string,
  pattern: string,
  path?: string
): Promise<GlobToolOutput> {
  try {
    const searchPath = path || ".";
    const workspacePath = `/workspace/${searchPath}`.replace(/\/+/g, "/");

    // Convert glob pattern to find command
    // Handle common glob patterns:
    // - **/*.js -> find recursively for .js files
    // - *.js -> find in current directory
    // - src/**/*.ts -> find in src recursively for .ts files

    let findCommand: string;

    if (pattern.includes("**")) {
      // Recursive search
      const namePattern = pattern.split("/").pop() || "*";
      findCommand = `find ${workspacePath} -type f -name "${namePattern}" 2>/dev/null | head -100`;
    } else if (pattern.includes("*")) {
      // Non-recursive wildcard
      findCommand = `find ${workspacePath} -maxdepth 1 -type f -name "${pattern}" 2>/dev/null | head -100`;
    } else {
      // Exact match
      findCommand = `find ${workspacePath} -type f -name "${pattern}" 2>/dev/null | head -100`;
    }

    const result = await modal.runCommand(sessionId, findCommand, "/workspace");

    if (result.exitCode !== 0 && result.stderr) {
      return {
        success: false,
        files: [],
        pattern,
        searchPath,
        error: result.stderr,
      };
    }

    // Parse the output - each line is a file path
    const files = result.stdout
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => line.replace(/^\/workspace\//, "")); // Remove workspace prefix

    return {
      success: true,
      files,
      pattern,
      searchPath,
    };
  } catch (error) {
    return {
      success: false,
      files: [],
      pattern,
      searchPath: path || ".",
      error: error instanceof Error ? error.message : "Failed to search for files",
    };
  }
}
