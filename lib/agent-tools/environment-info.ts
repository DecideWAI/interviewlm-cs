/**
 * Get Environment Info Tool for Claude Agent
 * Allows AI to get installed language and tool versions in the sandbox
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface EnvironmentInfo {
  python?: string;
  node?: string;
  npm?: string;
  go?: string;
  rust?: string;
  cargo?: string;
  yarn?: string;
  pnpm?: string;
  typescript?: string;
  java?: string;
  javac?: string;
}

export interface GetEnvironmentInfoOutput {
  success: boolean;
  environment: EnvironmentInfo;
  workingDirectory: string;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const getEnvironmentInfoTool: Anthropic.Tool = {
  name: "GetEnvironmentInfo",
  description:
    "Get installed language and tool versions in the sandbox environment.\n" +
    "Returns version information for: Python, Node.js, npm, Go, Rust, Cargo,\n" +
    "Yarn, pnpm, TypeScript, Java.\n\n" +
    "Use this to understand what tools are available before running commands.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

/**
 * Parse version from command output
 */
function parseVersion(output: string | undefined): string | undefined {
  if (!output) return undefined;

  // Try to extract version number from common formats
  const patterns = [
    /v?(\d+\.\d+\.\d+)/,           // v1.2.3 or 1.2.3
    /version\s+(\d+\.\d+\.\d+)/i,  // version 1.2.3
    /(\d+\.\d+)/,                  // 1.2
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Return trimmed output if no pattern matches
  const trimmed = output.trim().split("\n")[0];
  return trimmed.length > 0 && trimmed.length < 50 ? trimmed : undefined;
}

/**
 * Execute the GetEnvironmentInfo tool
 */
export async function executeGetEnvironmentInfo(
  sessionId: string
): Promise<GetEnvironmentInfoOutput> {
  try {
    const environment: EnvironmentInfo = {};

    // Run version checks in parallel for efficiency
    const versionChecks = [
      { key: "python", command: "python3 --version 2>/dev/null || python --version 2>/dev/null" },
      { key: "node", command: "node --version 2>/dev/null" },
      { key: "npm", command: "npm --version 2>/dev/null" },
      { key: "go", command: "go version 2>/dev/null" },
      { key: "rust", command: "rustc --version 2>/dev/null" },
      { key: "cargo", command: "cargo --version 2>/dev/null" },
      { key: "yarn", command: "yarn --version 2>/dev/null" },
      { key: "pnpm", command: "pnpm --version 2>/dev/null" },
      { key: "typescript", command: "tsc --version 2>/dev/null" },
      { key: "java", command: "java --version 2>/dev/null | head -1" },
    ];

    const results = await Promise.all(
      versionChecks.map(async ({ key, command }) => {
        try {
          const result = await modal.runCommand(sessionId, command, "/workspace");
          return { key, version: parseVersion(result.stdout) };
        } catch {
          return { key, version: undefined };
        }
      })
    );

    // Build environment object
    for (const { key, version } of results) {
      if (version) {
        environment[key as keyof EnvironmentInfo] = version;
      }
    }

    return {
      success: true,
      environment,
      workingDirectory: "/workspace",
    };
  } catch (error) {
    return {
      success: false,
      environment: {},
      workingDirectory: "/workspace",
      error:
        error instanceof Error
          ? error.message
          : "Failed to get environment info",
    };
  }
}
