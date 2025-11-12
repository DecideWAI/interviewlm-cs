/**
 * Simplified Modal Service
 *
 * This is a lightweight adapter for the Modal web endpoint deployed via modal_function.py
 * It wraps the HTTP endpoint and provides a simple interface for code execution.
 *
 * NOTE: This replaces the comprehensive modal.ts service which assumed features
 * (volumes, file system, terminal) that require more complex Modal setup.
 *
 * For MVP, we're using a simple HTTP endpoint for code execution only.
 */

import { z } from "zod";

// Configuration
const MODAL_EXECUTE_URL = process.env.MODAL_EXECUTE_URL;

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
 * Execute code with test cases using Modal web endpoint
 *
 * @param sessionId - Session identifier (unused for simple version, kept for API compatibility)
 * @param code - The code to execute
 * @param testCases - Array of test cases to run
 * @returns Execution results with test outcomes
 */
export async function executeCode(
  sessionId: string,
  code: string,
  testCases: TestCase[]
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    if (!MODAL_EXECUTE_URL) {
      throw new Error(
        "MODAL_EXECUTE_URL environment variable is not set. Please deploy modal_function.py and set the endpoint URL."
      );
    }

    // Call Modal web endpoint
    const response = await fetch(MODAL_EXECUTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        testCases,
        language: "python", // For MVP, only Python is supported
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Modal execution failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();

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
      testResults: [],
      totalTests: testCases.length,
      passedTests: 0,
      failedTests: testCases.length,
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}

/**
 * Stub functions for API compatibility
 * These maintain compatibility with existing API routes that expect these functions
 */

export async function createVolume(sessionId: string): Promise<{ id: string }> {
  // For MVP, volumes are not used - just return mock ID
  return { id: `mock-volume-${sessionId}` };
}

export async function writeFile(
  volumeId: string,
  filePath: string,
  content: string
): Promise<void> {
  // For MVP, file persistence is not implemented
  // In production, this would write to Modal volume or S3
  console.log(`[Mock] writeFile: ${filePath} (${content.length} bytes)`);
}

export async function readFile(
  volumeId: string,
  filePath: string
): Promise<string> {
  // For MVP, reading files is not implemented
  console.log(`[Mock] readFile: ${filePath}`);
  return "";
}

export async function getFileSystem(
  sessionId: string,
  rootPath: string = "/"
): Promise<any[]> {
  // For MVP, file system listing is not implemented
  // Return empty array to avoid errors
  return [];
}

export async function listVolumes(): Promise<any[]> {
  // For MVP, just verify Modal endpoint is reachable
  if (!MODAL_EXECUTE_URL) {
    throw new Error("MODAL_EXECUTE_URL not set");
  }

  // Try to hit health endpoint (replace 'execute' with 'health' in URL)
  const healthUrl = MODAL_EXECUTE_URL.replace('-execute.modal.run', '-health.modal.run');

  try {
    const response = await fetch(healthUrl);
    if (response.ok) {
      return [{ status: "ok" }];
    }
    throw new Error(`Health check failed: ${response.status}`);
  } catch (error) {
    console.error("Modal health check failed:", error);
    throw error;
  }
}

/**
 * Test Modal connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await listVolumes();
    return true;
  } catch {
    return false;
  }
}

// Export as modalService for drop-in replacement
export const modalService = {
  executeCode,
  createVolume,
  writeFile,
  readFile,
  getFileSystem,
  listVolumes,
  testConnection,
};
