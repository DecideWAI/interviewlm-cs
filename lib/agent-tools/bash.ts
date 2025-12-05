/**
 * Bash Tool for Claude Agent
 * Allows AI to run bash commands in the candidate's Modal sandbox
 * Wrapper around execute-bash with simplified interface for streaming agent
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface BashToolOutput {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const bashTool: Anthropic.Tool = {
  name: "Bash",
  description:
    "Execute a bash command in the candidate's sandbox environment. Use for running tests, installing dependencies, checking file structure, compiling code, etc. Commands are executed in the /workspace directory.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: 'The bash command to execute (e.g., "npm test", "ls -la", "node solution.js")',
      },
    },
    required: ["command"],
  },
};

/**
 * Execute the Bash tool
 */
export async function executeBash(
  sessionId: string,
  command: string
): Promise<BashToolOutput> {
  try {
    // Sanitize command to prevent shell injection
    const sanitizedCommand = sanitizeCommand(command);

    const result = await modal.runCommand(sessionId, sanitizedCommand, "/workspace");

    // Include error info for failed commands so UI shows meaningful message
    const output: BashToolOutput = {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };

    // Add error field if command failed
    if (result.exitCode !== 0) {
      output.error = result.stderr || result.error || `Command exited with code ${result.exitCode}`;
    }

    return output;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Command execution failed",
    };
  }
}

/**
 * Sanitize command to prevent dangerous operations
 */
function sanitizeCommand(command: string): string {
  // Block dangerous patterns
  const dangerousPatterns = [
    /rm\s+-rf\s+\/(?!workspace)/, // Prevent rm -rf outside workspace
    /mkfs/, // Prevent filesystem operations
    /dd\s+if=/, // Prevent disk operations
    />\s*\/dev\//, // Prevent device writes
    /curl.*\|\s*(bash|sh)/, // Prevent remote script execution
    /wget.*\|\s*(bash|sh)/,
    /chmod\s+[0-7]*\s+\/(?!workspace)/, // Prevent chmod outside workspace
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked for security reasons: ${command.substring(0, 50)}...`);
    }
  }

  return command;
}
