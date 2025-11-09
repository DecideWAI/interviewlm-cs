/**
 * Modal AI Sandbox Service
 *
 * Manages secure code execution environments using Modal AI.
 * Provides isolated sandboxes for running candidate code with test cases.
 */

import { z } from "zod";
import type { WebSocket } from "ws";

// Configuration
const MODAL_API_URL = process.env.MODAL_API_URL || "https://modal.com/api/v1";
const EXECUTION_TIMEOUT = 30000; // 30 seconds
const MEMORY_LIMIT_MB = 512;
const CPU_LIMIT = 1.0;

// Validation schemas
const testCaseSchema = z.object({
  name: z.string(),
  input: z.any(),
  expected: z.any(),
  hidden: z.boolean().default(false),
  timeout: z.number().optional(),
});

const executeCodeSchema = z.object({
  code: z.string(),
  language: z.enum(["javascript", "typescript", "python", "go"]),
  testCases: z.array(testCaseSchema),
  sessionId: z.string().optional(),
});

type TestCase = z.infer<typeof testCaseSchema>;
type ExecuteCodeParams = z.infer<typeof executeCodeSchema>;

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
 * Sandbox instance metadata
 */
export interface SandboxInstance {
  id: string;
  sessionId: string;
  status: "initializing" | "ready" | "running" | "stopped";
  createdAt: Date;
  language: string;
  wsUrl?: string;
}

/**
 * Get Modal authentication headers
 */
function getAuthHeaders(): Record<string, string> {
  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error("MODAL_TOKEN_ID and MODAL_TOKEN_SECRET must be set");
  }

  return {
    "Authorization": `Bearer ${tokenId}:${tokenSecret}`,
    "Content-Type": "application/json",
  };
}

/**
 * Execute code with test cases in a Modal sandbox
 *
 * @param code - The code to execute
 * @param language - Programming language
 * @param testCases - Array of test cases to run
 * @returns Execution results with test outcomes
 *
 * @example
 * ```typescript
 * const result = await executeCode(
 *   "function add(a, b) { return a + b; }",
 *   "javascript",
 *   [{ name: "test_add", input: [2, 3], expected: 5 }]
 * );
 * console.log(`${result.passedTests}/${result.totalTests} tests passed`);
 * ```
 */
export async function executeCode(
  code: string,
  language: string,
  testCases: TestCase[]
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Validate inputs
    const params = executeCodeSchema.parse({ code, language, testCases });

    // Prepare execution payload
    const payload = {
      language: params.language,
      code: params.code,
      testCases: params.testCases,
      timeout: EXECUTION_TIMEOUT,
      memoryLimit: MEMORY_LIMIT_MB,
      cpuLimit: CPU_LIMIT,
    };

    // Send to Modal API
    const response = await fetch(`${MODAL_API_URL}/execute`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Modal API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Parse test results
    const testResults: TestResult[] = data.testResults.map((test: any) => ({
      name: test.name,
      passed: test.passed,
      output: test.output,
      error: test.error,
      duration: test.duration || 0,
      hidden: test.hidden || false,
    }));

    const passedTests = testResults.filter((t) => t.passed).length;
    const failedTests = testResults.filter((t) => !t.passed).length;

    return {
      success: data.success,
      testResults,
      totalTests: testResults.length,
      passedTests,
      failedTests,
      executionTime: Date.now() - startTime,
      stdout: data.stdout,
      stderr: data.stderr,
      error: data.error,
    };

  } catch (error) {
    console.error("Error executing code in Modal sandbox:", error);

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
 * Create a persistent sandbox instance for a session
 * Useful for maintaining state across multiple executions
 *
 * @param sessionId - Unique session identifier
 * @param language - Programming language for the sandbox
 * @returns Sandbox instance metadata
 */
export async function createSandbox(
  sessionId: string,
  language: string
): Promise<SandboxInstance> {
  try {
    const response = await fetch(`${MODAL_API_URL}/sandboxes`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        sessionId,
        language,
        timeout: EXECUTION_TIMEOUT,
        memoryLimit: MEMORY_LIMIT_MB,
        cpuLimit: CPU_LIMIT,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create sandbox (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      sessionId,
      status: data.status,
      createdAt: new Date(data.createdAt),
      language,
      wsUrl: data.wsUrl,
    };

  } catch (error) {
    console.error("Error creating Modal sandbox:", error);
    throw new Error(
      `Sandbox creation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Destroy a sandbox instance
 * Important for cleanup and cost control
 *
 * @param sandboxId - Sandbox instance ID
 */
export async function destroySandbox(sandboxId: string): Promise<void> {
  try {
    const response = await fetch(`${MODAL_API_URL}/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to destroy sandbox (${response.status}): ${errorText}`);
    }

  } catch (error) {
    console.error("Error destroying Modal sandbox:", error);
    // Don't throw - sandbox cleanup failures shouldn't break the flow
  }
}

/**
 * Get WebSocket connection URL for terminal access
 * Allows real-time interaction with the sandbox terminal
 *
 * @param sessionId - Session identifier
 * @returns WebSocket URL for terminal connection
 */
export function getTerminalConnectionUrl(sessionId: string): string {
  const workspace = process.env.MODAL_WORKSPACE || "default";
  const tokenId = process.env.MODAL_TOKEN_ID;

  if (!tokenId) {
    throw new Error("MODAL_TOKEN_ID must be set");
  }

  // Build WebSocket URL with auth token
  const wsUrl = new URL(`wss://modal.com/api/v1/ws/terminal`);
  wsUrl.searchParams.set("session", sessionId);
  wsUrl.searchParams.set("workspace", workspace);
  wsUrl.searchParams.set("token", tokenId);

  return wsUrl.toString();
}

/**
 * Check sandbox health and status
 *
 * @param sandboxId - Sandbox instance ID
 * @returns Current status information
 */
export async function getSandboxStatus(sandboxId: string): Promise<{
  status: string;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
}> {
  try {
    const response = await fetch(`${MODAL_API_URL}/sandboxes/${sandboxId}/status`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get sandbox status (${response.status})`);
    }

    return await response.json();

  } catch (error) {
    console.error("Error getting sandbox status:", error);
    throw new Error(
      `Sandbox status check failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Run a single command in the sandbox
 * Useful for setup tasks or quick checks
 *
 * @param sandboxId - Sandbox instance ID
 * @param command - Command to execute
 * @returns Command output
 */
export async function runCommand(
  sandboxId: string,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const response = await fetch(`${MODAL_API_URL}/sandboxes/${sandboxId}/exec`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        command,
        timeout: EXECUTION_TIMEOUT,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Command execution failed (${response.status}): ${errorText}`);
    }

    return await response.json();

  } catch (error) {
    console.error("Error running command in sandbox:", error);
    throw new Error(
      `Command execution failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Test Modal API connection
 * Useful for health checks
 */
export async function testConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${MODAL_API_URL}/health`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response.ok;
  } catch (error) {
    console.error("Modal API connection test failed:", error);
    return false;
  }
}

/**
 * List all active sandboxes for monitoring
 */
export async function listActiveSandboxes(): Promise<SandboxInstance[]> {
  try {
    const workspace = process.env.MODAL_WORKSPACE || "default";

    const response = await fetch(
      `${MODAL_API_URL}/sandboxes?workspace=${workspace}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list sandboxes (${response.status})`);
    }

    const data = await response.json();

    return data.sandboxes.map((sb: any) => ({
      id: sb.id,
      sessionId: sb.sessionId,
      status: sb.status,
      createdAt: new Date(sb.createdAt),
      language: sb.language,
      wsUrl: sb.wsUrl,
    }));

  } catch (error) {
    console.error("Error listing sandboxes:", error);
    return [];
  }
}
