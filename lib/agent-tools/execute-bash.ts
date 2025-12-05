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
  name: "ExecuteBash",
  description:
    "Execute a bash command from the root directory. Use this to:\n" +
    "- Run system-level commands outside /workspace\n" +
    "- Access tools installed at system paths\n" +
    "- Check system configuration or environment\n\n" +
    "NOTE: For most tasks, prefer the Bash tool which runs in /workspace.\n" +
    "This tool is for commands that need root-level access.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute. Examples: 'which node', 'env | grep PATH', 'cat /etc/os-release'",
      },
      timeout: {
        type: "number",
        description: "Maximum execution time in milliseconds. Default: 30000 (30 seconds). Use longer for slow operations.",
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
