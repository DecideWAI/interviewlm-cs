/**
 * Install Packages Tool for Claude Agent
 * Allows AI to install packages in the candidate's Modal sandbox
 */

import { modalService as modal } from "@/lib/services";
import type { Anthropic } from "@anthropic-ai/sdk";

export type PackageManager = "npm" | "pip" | "cargo" | "go" | "auto";

export interface InstallPackagesOutput {
  success: boolean;
  packageManager: string;
  packages: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const installPackagesTool: Anthropic.Tool = {
  name: "InstallPackages",
  description:
    "Install packages in the sandbox environment. Supports npm, pip, cargo, and go.\n" +
    "Examples:\n" +
    '- `packages: "lodash axios", packageManager: "npm"`\n' +
    '- `packages: "requests flask", packageManager: "pip"`\n' +
    '- `packages: "serde tokio", packageManager: "cargo"`\n' +
    '- `packages: "gin-gonic/gin", packageManager: "go"`\n\n' +
    "Use 'auto' to detect package manager from project files (package.json, requirements.txt, etc.)",
  input_schema: {
    type: "object",
    properties: {
      packages: {
        type: "string",
        description:
          "Space-separated list of packages to install. Example: 'lodash axios express'",
      },
      packageManager: {
        type: "string",
        enum: ["npm", "pip", "cargo", "go", "auto"],
        description:
          "Package manager to use. Use 'auto' to detect from project files.",
      },
    },
    required: ["packages"],
  },
};

/**
 * Detect package manager from project files
 */
async function detectPackageManager(
  sessionId: string
): Promise<PackageManager> {
  try {
    // Check for package.json (npm)
    const npmCheck = await modal.runCommand(
      sessionId,
      "test -f /workspace/package.json && echo npm",
      "/workspace"
    );
    if (npmCheck.stdout?.trim() === "npm") return "npm";

    // Check for requirements.txt or setup.py (pip)
    const pipCheck = await modal.runCommand(
      sessionId,
      "(test -f /workspace/requirements.txt || test -f /workspace/setup.py) && echo pip",
      "/workspace"
    );
    if (pipCheck.stdout?.trim() === "pip") return "pip";

    // Check for Cargo.toml (cargo)
    const cargoCheck = await modal.runCommand(
      sessionId,
      "test -f /workspace/Cargo.toml && echo cargo",
      "/workspace"
    );
    if (cargoCheck.stdout?.trim() === "cargo") return "cargo";

    // Check for go.mod (go)
    const goCheck = await modal.runCommand(
      sessionId,
      "test -f /workspace/go.mod && echo go",
      "/workspace"
    );
    if (goCheck.stdout?.trim() === "go") return "go";

    // Default to npm
    return "npm";
  } catch {
    return "npm";
  }
}

/**
 * Get install command for package manager
 */
function getInstallCommand(
  packageManager: PackageManager,
  packages: string
): string {
  switch (packageManager) {
    case "npm":
      return `npm install ${packages}`;
    case "pip":
      return `pip install ${packages}`;
    case "cargo":
      return `cargo add ${packages}`;
    case "go":
      return `go get ${packages}`;
    default:
      return `npm install ${packages}`;
  }
}

/**
 * Validate packages string for security
 */
function validatePackages(packages: string): void {
  // Block dangerous patterns in package names
  const dangerousPatterns = [
    /[;&|`$(){}[\]<>]/,  // Shell metacharacters
    /\.\.\//,            // Path traversal
    /^-/,                // Options that could be flags
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(packages)) {
      throw new Error("Invalid package specification");
    }
  }
}

/**
 * Execute the InstallPackages tool
 */
export async function executeInstallPackages(
  sessionId: string,
  packages: string,
  packageManager: PackageManager = "auto"
): Promise<InstallPackagesOutput> {
  try {
    // Validate packages
    validatePackages(packages);

    // Detect package manager if auto
    const resolvedManager =
      packageManager === "auto"
        ? await detectPackageManager(sessionId)
        : packageManager;

    // Build and run install command
    const command = getInstallCommand(resolvedManager, packages);
    const result = await modal.runCommand(sessionId, command, "/workspace");

    return {
      success: result.exitCode === 0,
      packageManager: resolvedManager,
      packages,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.exitCode !== 0 && {
        error:
          result.stderr || result.error || `Install failed with code ${result.exitCode}`,
      }),
    };
  } catch (error) {
    return {
      success: false,
      packageManager: packageManager === "auto" ? "unknown" : packageManager,
      packages,
      error: error instanceof Error ? error.message : "Package installation failed",
    };
  }
}
