/**
 * Modal Service - TypeScript SDK Implementation
 *
 * Uses Modal's official TypeScript SDK for sandbox operations.
 * Each session gets an isolated container from the deployed interviewlm-executor app.
 * Supports any language/framework - candidates can install what they need.
 */

import { ModalClient } from "modal";

// Sandbox session cache
const sandboxes = new Map<string, { sandbox: any; createdAt: Date }>();

// Configuration
const SANDBOX_TIMEOUT_MS = 3600 * 1000; // 1 hour
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

// Security: blocked command patterns
const BLOCKED_PATTERNS = [
  "rm -rf /",
  "rm -rf /*",
  ":(){ :|:& };:",
  "mkfs",
  "dd if=/dev",
  "> /dev/sda",
  "chmod -R 777 /",
  "shutdown",
  "reboot",
];

// Modal client singleton
let modalClient: ModalClient | null = null;

function getModalClient(): ModalClient {
  if (!modalClient) {
    modalClient = new ModalClient();
  }
  return modalClient;
}

function sanitizeOutput(text: string): string {
  if (text.length > MAX_OUTPUT_SIZE) {
    return text.slice(0, MAX_OUTPUT_SIZE) + `\n... (truncated)`;
  }
  return text;
}

function isCommandSafe(cmd: string): { safe: boolean; reason?: string } {
  const cmdLower = cmd.toLowerCase();
  for (const pattern of BLOCKED_PATTERNS) {
    if (cmdLower.includes(pattern.toLowerCase())) {
      return { safe: false, reason: `Blocked: ${pattern}` };
    }
  }
  return { safe: true };
}

// Modal SDK exec wrapper
function exec(sandbox: any, args: string[]): Promise<any> {
  return sandbox["exec"](args);
}

// ============================================================================
// TYPES
// ============================================================================

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

// ============================================================================
// CORE API
// ============================================================================

/**
 * Create a sandbox for a session
 */
export async function createSandbox(sessionId: string): Promise<SandboxInstance> {
  const modal = getModalClient();

  // Get or create the app
  const app = await modal.apps.fromName("interviewlm-executor", { createIfMissing: true });

  // Create image with development tools
  // Using Debian as base - candidates can install any language/framework they need
  const image = modal.images.fromRegistry("debian:bookworm-slim");

  // Create sandbox with the image
  const sandbox = await modal.sandboxes.create(app, image, {
    timeoutMs: SANDBOX_TIMEOUT_MS,
    cpu: 2.0,
    memoryMiB: 2048,
  });

  // Initialize workspace
  await exec(sandbox, ["mkdir", "-p", "/workspace"]);

  const createdAt = new Date();
  sandboxes.set(sessionId, { sandbox, createdAt });
  console.log(`[Modal] Created sandbox for ${sessionId}`);

  return {
    id: sandbox.sandboxId,
    sessionId,
    status: "ready",
    createdAt,
    environment: {},
  };
}

/**
 * Get or create sandbox for a session
 */
export async function getOrCreateSandbox(sessionId: string): Promise<any> {
  const cached = sandboxes.get(sessionId);
  if (cached) return cached.sandbox;

  await createSandbox(sessionId);
  return sandboxes.get(sessionId)!.sandbox;
}

/**
 * Run a command in the sandbox
 */
export async function runCommand(
  sessionId: string,
  command: string,
  workingDir = "/workspace"
): Promise<CommandResult> {
  const safety = isCommandSafe(command);
  if (!safety.safe) {
    return { success: false, stdout: "", stderr: safety.reason!, exitCode: 1, error: safety.reason };
  }

  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    const fullCmd = `cd ${workingDir} 2>/dev/null || mkdir -p ${workingDir} && cd ${workingDir} && ${command}`;
    const proc = await exec(sandbox, ["bash", "-c", fullCmd]);

    const stdout = await proc.stdout.readText();
    const stderr = await proc.stderr.readText();
    const exitCode = await proc.exitCode();

    return {
      success: exitCode === 0,
      stdout: sanitizeOutput(stdout),
      stderr: sanitizeOutput(stderr),
      exitCode,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { success: false, stdout: "", stderr: msg, exitCode: 1, error: msg };
  }
}

/**
 * Write a file to the sandbox
 */
export async function writeFile(
  sessionId: string,
  filePath: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    const absPath = filePath.startsWith("/") ? filePath : `/workspace/${filePath}`;
    const parentDir = absPath.split("/").slice(0, -1).join("/");

    await exec(sandbox, ["mkdir", "-p", parentDir]);

    // Use base64 to handle special characters
    const encoded = Buffer.from(content).toString("base64");
    await exec(sandbox, ["bash", "-c", `echo '${encoded}' | base64 -d > '${absPath}'`]);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Read a file from the sandbox
 */
export async function readFile(
  sessionId: string,
  filePath: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    const absPath = filePath.startsWith("/") ? filePath : `/workspace/${filePath}`;

    const proc = await exec(sandbox, ["cat", absPath]);
    const content = await proc.stdout.readText();
    const exitCode = await proc.exitCode();

    if (exitCode !== 0) {
      const stderr = await proc.stderr.readText();
      return { success: false, error: stderr };
    }

    return { success: true, content };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * List files in a directory
 */
export async function listFiles(
  sessionId: string,
  directory = "/workspace"
): Promise<FileNode[]> {
  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    const proc = await exec(sandbox, ["bash", "-c", `ls -la ${directory} 2>/dev/null`]);
    const stdout = await proc.stdout.readText();

    const files: FileNode[] = [];
    for (const line of stdout.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9 && !line.startsWith("total")) {
        const name = parts.slice(8).join(" ");
        if (name !== "." && name !== "..") {
          files.push({
            name,
            path: `${directory}/${name}`,
            type: parts[0].startsWith("d") ? "directory" : "file",
            size: parseInt(parts[4]) || 0,
          });
        }
      }
    }
    return files;
  } catch {
    return [];
  }
}

/**
 * Get file system tree (alias for listFiles)
 */
export async function getFileSystem(sessionId: string, rootPath = "/workspace"): Promise<FileNode[]> {
  return listFiles(sessionId, rootPath);
}

/**
 * Terminate a sandbox
 */
export async function terminateSandbox(sessionId: string): Promise<boolean> {
  const cached = sandboxes.get(sessionId);
  if (cached) {
    try {
      await cached.sandbox.terminate();
      sandboxes.delete(sessionId);
      console.log(`[Modal] Terminated sandbox for ${sessionId}`);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Test Modal connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    return !!getModalClient();
  } catch {
    return false;
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{ status: string }> {
  const connected = await testConnection();
  return { status: connected ? "healthy" : "unhealthy" };
}

// ============================================================================
// LEGACY COMPATIBILITY (for existing code)
// ============================================================================

export interface TestResult {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
  duration: number;
  hidden: boolean;
}

export interface ExecutionResult {
  success: boolean;
  testResults: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  executionTime: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface SandboxInstance {
  id: string;
  sessionId: string;
  status: "ready" | "running" | "stopped";
  createdAt: Date;
  environment: Record<string, string>;
}

// Aliases for backward compatibility
export const executeCommand = runCommand;
export const getSandbox = (sessionId: string) => sandboxes.get(sessionId)?.sandbox || null;
export const createVolume = async (sessionId: string) => { await createSandbox(sessionId); return { id: sessionId }; };
export const listVolumes = async () => Array.from(sandboxes.keys()).map(id => ({ id }));
export const listActiveSandboxes = async (): Promise<SandboxInstance[]> =>
  Array.from(sandboxes.entries()).map(([sessionId, { sandbox, createdAt }]) => ({
    id: sandbox.sandboxId, sessionId, status: "ready" as const, createdAt, environment: {},
  }));

// Run tests (auto-detects test framework)
export async function runTests(sessionId: string, testCommand?: string) {
  const cmd = testCommand || "npm test 2>&1 || python -m pytest -v 2>&1";
  const result = await runCommand(sessionId, cmd);

  // Parse passed/failed from output
  const passedMatch = result.stdout.match(/(\d+) passed/);
  const failedMatch = result.stdout.match(/(\d+) failed/);
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

  return { ...result, success: result.success && failed === 0, passed, failed, total: passed + failed };
}

// Execute code with test cases (Python-specific legacy function)
export async function executeCode(
  sessionId: string,
  code: string,
  testCases: Array<{ name: string; input: any; expected: any; hidden?: boolean }>
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    await writeFile(sessionId, "solution.py", code);

    // Generate pytest file
    const testLines = ["import pytest", "from solution import *", ""];
    testCases.forEach((tc, i) => {
      const name = tc.name || `test_${i}`;
      const args = Array.isArray(tc.input)
        ? tc.input.map(v => JSON.stringify(v)).join(", ")
        : JSON.stringify(tc.input);
      testLines.push(`def ${name}():`, `    assert solution(${args}) == ${JSON.stringify(tc.expected)}`, "");
    });
    await writeFile(sessionId, "test_solution.py", testLines.join("\n"));

    const result = await runCommand(sessionId, "python -m pytest test_solution.py -v --tb=short 2>&1");

    const testResults: TestResult[] = testCases.map((tc, i) => ({
      name: tc.name || `test_${i}`,
      passed: result.stdout.includes(`${tc.name || `test_${i}`} PASSED`),
      duration: 0,
      hidden: tc.hidden || false,
    }));

    const passedTests = testResults.filter(t => t.passed).length;

    return {
      success: passedTests === testCases.length,
      testResults,
      totalTests: testCases.length,
      passedTests,
      failedTests: testCases.length - passedTests,
      executionTime: Date.now() - startTime,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      success: false, testResults: [], totalTests: testCases.length,
      passedTests: 0, failedTests: testCases.length,
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// SERVICE EXPORT
// ============================================================================

export const modalService = {
  createSandbox,
  getOrCreateSandbox,
  getSandbox,
  runCommand,
  executeCommand,
  writeFile,
  readFile,
  listFiles,
  getFileSystem,
  terminateSandbox,
  runTests,
  executeCode,
  testConnection,
  healthCheck,
  createVolume,
  listVolumes,
  listActiveSandboxes,
};

export async function closeConnection(): Promise<void> {
  for (const sessionId of sandboxes.keys()) {
    await terminateSandbox(sessionId);
  }
}
