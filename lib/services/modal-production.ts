/**
 * Modal Service - Production Implementation
 *
 * Real integration with deployed Modal.com functions for:
 * - Sandboxed code execution
 * - File storage and operations
 * - Test running
 *
 * This replaces the stub implementation with actual Modal API calls.
 */

import { z } from "zod";

// Configuration from environment
const MODAL_EXECUTE_URL = process.env.MODAL_EXECUTE_URL;
const MODAL_WRITE_FILE_URL = process.env.MODAL_WRITE_FILE_URL;
const MODAL_READ_FILE_URL = process.env.MODAL_READ_FILE_URL;
const MODAL_LIST_FILES_URL = process.env.MODAL_LIST_FILES_URL;

// Validation schemas
const testCaseSchema = z.object({
  name: z.string(),
  input: z.any(),
  expected: z.any(),
  hidden: z.boolean().default(false),
});

type TestCase = z.infer<typeof testCaseSchema>;

/**
 * Test execution result
 */
export interface TestResult {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
  duration: number; // milliseconds
  hidden: boolean;
}

/**
 * Code execution response
 */
export interface ExecutionResult {
  success: boolean;
  testResults: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  executionTime: number; // total milliseconds
  stdout?: string;
  stderr?: string;
  error?: string;
}

/**
 * File node for file tree
 */
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime?: string; // ISO timestamp
  children?: FileNode[];
}

/**
 * Sandbox instance metadata (stored in-memory or Redis)
 */
export interface SandboxInstance {
  id: string;
  sessionId: string;
  status: "initializing" | "ready" | "running" | "stopped";
  createdAt: Date;
  language: string;
}

// In-memory storage for sandbox metadata (could be replaced with Redis)
const sandboxes = new Map<string, SandboxInstance>();

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateModalEndpoints(): void {
  if (!MODAL_EXECUTE_URL) {
    throw new Error(
      "MODAL_EXECUTE_URL not configured. Deploy modal_executor.py and set the environment variable. See MODAL_DEPLOYMENT.md"
    );
  }
  if (!MODAL_WRITE_FILE_URL) {
    console.warn("MODAL_WRITE_FILE_URL not set - file write operations will fail");
  }
  if (!MODAL_READ_FILE_URL) {
    console.warn("MODAL_READ_FILE_URL not set - file read operations will fail");
  }
  if (!MODAL_LIST_FILES_URL) {
    console.warn("MODAL_LIST_FILES_URL not set - file listing will fail");
  }
}

// ============================================================================
// CODE EXECUTION
// ============================================================================

/**
 * Execute code with test cases using Modal web endpoint
 *
 * @param sessionId - Session identifier
 * @param code - The code to execute
 * @param testCases - Array of test cases to run
 * @param language - Programming language (python, javascript, typescript, go)
 * @returns Execution results with test outcomes
 */
export async function executeCode(
  sessionId: string,
  code: string,
  testCases: TestCase[],
  language: string = "python"
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    validateModalEndpoints();

    console.log(`[Modal] Executing ${language} code for session ${sessionId}`);

    // Call deployed Modal function
    const response = await fetch(MODAL_EXECUTE_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        testCases,
        language,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Modal execution failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    console.log(`[Modal] Execution complete: ${data.passedTests}/${data.totalTests} tests passed`);

    // Return in expected format
    return {
      success: data.success || false,
      testResults: data.testResults || [],
      totalTests: data.totalTests || testCases.length,
      passedTests: data.passedTests || 0,
      failedTests: data.failedTests || testCases.length,
      executionTime: data.executionTime || (Date.now() - startTime),
      stdout: data.stdout,
      stderr: data.stderr,
      error: data.error,
    };

  } catch (error) {
    console.error("Error executing code in Modal:", error);

    // Return error result
    return {
      success: false,
      testResults: testCases.map(tc => ({
        name: tc.name,
        passed: false,
        error: error instanceof Error ? error.message : "Execution failed",
        duration: 0,
        hidden: tc.hidden,
      })),
      totalTests: testCases.length,
      passedTests: 0,
      failedTests: testCases.length,
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}

// ============================================================================
// FILE SYSTEM OPERATIONS (Modal Web Endpoints)
// ============================================================================

/**
 * Write a file to the Modal volume
 *
 * @param volumeId - Volume identifier (format: "vol-{sessionId}")
 * @param filePath - Path to file within workspace
 * @param content - File content
 */
export async function writeFile(
  volumeId: string,
  filePath: string,
  content: string
): Promise<void> {
  try {
    if (!MODAL_WRITE_FILE_URL) {
      throw new Error("MODAL_WRITE_FILE_URL not configured");
    }

    // Extract session ID from volumeId
    const sessionId = volumeId.replace("vol-", "");

    console.log(`[Modal] Writing file: ${filePath} for session ${sessionId}`);

    const response = await fetch(MODAL_WRITE_FILE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        filePath,
        content,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to write file (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "File write failed");
    }

    console.log(`[Modal] File written: ${filePath} (${data.size} bytes)`);

  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    throw new Error(
      `File write failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Read a file from the Modal volume
 *
 * @param volumeId - Volume identifier (format: "vol-{sessionId}")
 * @param filePath - Path to file within workspace
 * @returns File content
 */
export async function readFile(
  volumeId: string,
  filePath: string
): Promise<string> {
  try {
    if (!MODAL_READ_FILE_URL) {
      throw new Error("MODAL_READ_FILE_URL not configured");
    }

    // Extract session ID from volumeId
    const sessionId = volumeId.replace("vol-", "");

    console.log(`[Modal] Reading file: ${filePath} for session ${sessionId}`);

    const response = await fetch(MODAL_READ_FILE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        filePath,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to read file (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "File read failed");
    }

    console.log(`[Modal] File read: ${filePath}`);
    return data.content;

  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw new Error(
      `File read failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get file tree structure from the Modal volume
 *
 * @param sessionId - Session identifier
 * @param rootPath - Root path to list (defaults to "/")
 * @returns File tree structure
 */
export async function getFileSystem(
  sessionId: string,
  rootPath: string = "/"
): Promise<FileNode[]> {
  try {
    if (!MODAL_LIST_FILES_URL) {
      console.warn("MODAL_LIST_FILES_URL not configured - returning empty file list");
      return [];
    }

    console.log(`[Modal] Listing files for session ${sessionId}`);

    const response = await fetch(MODAL_LIST_FILES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        directory: rootPath,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list files (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "File listing failed");
    }

    console.log(`[Modal] Listed ${data.files?.length || 0} files`);
    return data.files || [];

  } catch (error) {
    console.error("Error getting file system:", error);
    // Return empty array rather than throwing - graceful degradation
    return [];
  }
}

// ============================================================================
// SANDBOX MANAGEMENT
// ============================================================================

/**
 * Create a sandbox instance for a session
 *
 * @param sessionId - Session identifier
 * @param initialFiles - Initial files to populate (optional)
 * @param language - Programming language
 * @returns Sandbox instance metadata
 */
export async function createSandbox(
  sessionId: string,
  initialFiles: Record<string, string> = {},
  language: string = "python"
): Promise<SandboxInstance> {
  const sandboxId = `sandbox-${sessionId}`;
  const volumeId = `vol-${sessionId}`;

  try {
    console.log(`[Modal] Creating sandbox for session ${sessionId}`);

    // Write initial files if provided
    const filePromises = Object.entries(initialFiles).map(([path, content]) =>
      writeFile(volumeId, path, content).catch(err => {
        console.error(`Failed to write initial file ${path}:`, err);
        // Continue even if some files fail
      })
    );

    await Promise.all(filePromises);

    // Create sandbox metadata
    const sandbox: SandboxInstance = {
      id: sandboxId,
      sessionId,
      status: "ready",
      createdAt: new Date(),
      language,
    };

    // Store in memory (could be Redis in production)
    sandboxes.set(sandboxId, sandbox);

    console.log(`[Modal] Sandbox created: ${sandboxId}`);
    return sandbox;

  } catch (error) {
    console.error("Error creating sandbox:", error);
    throw new Error(
      `Sandbox creation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get sandbox metadata
 *
 * @param sessionId - Session identifier
 * @returns Sandbox instance or null if not found
 */
export async function getSandbox(sessionId: string): Promise<SandboxInstance | null> {
  const sandboxId = `sandbox-${sessionId}`;
  return sandboxes.get(sandboxId) || null;
}

/**
 * List all active sandboxes
 *
 * @returns Array of sandbox instances
 */
export async function listActiveSandboxes(): Promise<SandboxInstance[]> {
  return Array.from(sandboxes.values());
}

/**
 * Delete a sandbox
 *
 * @param sessionId - Session identifier
 */
export async function deleteSandbox(sessionId: string): Promise<void> {
  const sandboxId = `sandbox-${sessionId}`;
  sandboxes.delete(sandboxId);
  console.log(`[Modal] Sandbox deleted: ${sandboxId}`);
}

// ============================================================================
// LEGACY COMPATIBILITY EXPORTS
// ============================================================================

/**
 * Test Modal connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    validateModalEndpoints();

    // Try a simple execution to test connectivity
    const result = await executeCode(
      "health-check",
      "def solution(x):\n    return x",
      [{ name: "test", input: { x: 1 }, expected: 1, hidden: false }],
      "python"
    );

    console.log(`[Modal] Connection test: ${result.success ? "OK" : "FAILED"}`);
    return result.success;
  } catch (error) {
    console.error("Modal connection test failed:", error);
    return false;
  }
}

/**
 * Create volume (no-op in new architecture - Modal handles volumes internally)
 */
export async function createVolume(sessionId: string): Promise<{ id: string }> {
  console.log(`[Modal] Volume auto-created for session ${sessionId}`);
  return { id: `vol-${sessionId}` };
}

/**
 * List volumes (no-op in new architecture)
 */
export async function listVolumes(): Promise<any[]> {
  console.log("[Modal] Listing volumes (not implemented in Modal web endpoint architecture)");
  return [];
}

/**
 * Run command (simplified - just returns a message)
 * Real command execution should happen in Modal sandbox
 */
export async function runCommand(
  sessionId: string,
  command: string,
  workingDir: string = "/"
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  console.warn(`[Modal] runCommand called but not implemented for production. Use executeCode instead.`);

  // Simple built-in commands
  if (command.trim() === "pwd") {
    return {
      stdout: `/workspace${workingDir}\n`,
      stderr: "",
      exitCode: 0,
    };
  }

  if (command.trim() === "clear" || command.trim() === "cls") {
    return {
      stdout: "\x1b[2J\x1b[H",
      stderr: "",
      exitCode: 0,
    };
  }

  return {
    stdout: "",
    stderr: "Command execution in terminal is not yet implemented. Use the code editor and test runner.\n",
    exitCode: 1,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Export as modalService for drop-in replacement
 */
export const modalService = {
  executeCode,
  createVolume,
  writeFile,
  readFile,
  getFileSystem,
  listVolumes,
  testConnection,
  createSandbox,
  getSandbox,
  listActiveSandboxes,
  deleteSandbox,
  runCommand,
};

/**
 * Graceful shutdown
 */
export async function closeConnection(): Promise<void> {
  sandboxes.clear();
  console.log("[Modal] Connection closed, sandboxes cleared");
}
