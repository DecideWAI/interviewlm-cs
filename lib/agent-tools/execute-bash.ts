/**
 * Execute Bash Tool for Claude Agent
 * Allows AI to run bash commands in the candidate's Modal sandbox
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface ExecuteBashToolInput {
  command: string;
  timeout?: number;
}

export interface ExecuteBashToolOutput {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  duration?: number;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const executeBashTool: Anthropic.Tool = {
  name: "execute_bash",
  description:
    "Execute a bash command in the candidate's sandbox terminal. Use for installing dependencies, running scripts, checking file structure, etc. Commands are executed in the /workspace directory. Be cautious with destructive commands.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          'The bash command to execute (e.g., "npm install lodash", "ls -la", "cat package.json")',
      },
      timeout: {
        type: "number",
        description: "Optional timeout in milliseconds (default: 30000ms)",
      },
    },
    required: ["command"],
  },
};

/**
 * Execute the execute_bash tool
 */
export async function executeExecuteBash(
  candidateId: string,
  input: ExecuteBashToolInput
): Promise<ExecuteBashToolOutput> {
  try {
    const result = await modal.runCommand(
      candidateId,
      input.command,
      "/"
    );

    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Command execution failed",
    };
  }
}
