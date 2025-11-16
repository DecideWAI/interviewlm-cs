/**
 * Modal Service with Volume-Based File Storage
 *
 * Production-ready implementation using Modal Volumes API:
 * - Modal Volumes for persistent file storage
 * - Redis for operation tracking and metadata caching
 * - HTTP endpoint for code execution
 * - Full terminal and sandbox management
 *
 * Architecture:
 * - Files: Stored in Modal Volumes (persistent across sessions)
 * - Operation tracking: Redis (who changed what, when)
 * - Sandbox metadata: Redis (quick lookups)
 * - Code execution: Modal HTTP endpoint
 */

import { z } from "zod";
import { Redis } from "ioredis";

// Configuration
const MODAL_API_URL = process.env.MODAL_API_URL || "https://api.modal.com/v1";
const MODAL_EXECUTE_URL = process.env.MODAL_EXECUTE_URL;
const MODAL_VOLUME_NAMESPACE = process.env.MODAL_VOLUME_NAMESPACE || "interviewlm";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Redis client singleton (for metadata only)
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis client error:", err);
    });
  }
  return redisClient;
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
 * Sandbox instance metadata
 */
export interface SandboxInstance {
  id: string;
  sessionId: string;
  volumeId: string;
  status: "initializing" | "ready" | "running" | "stopped";
  createdAt: Date;
  language: string;
  wsUrl?: string;
}

// ============================================================================
// VOLUME MANAGEMENT
// ============================================================================

/**
 * Generate volume name for a session
 */
function getVolumeName(sessionId: string): string {
  return `interview-${sessionId}`;
}

/**
 * Create a new Modal volume for an interview session
 *
 * @param sessionId - Unique session identifier
 * @returns Volume metadata
 */
export async function createVolume(sessionId: string): Promise<{ id: string }> {
  try {
    const volumeName = getVolumeName(sessionId);

    const response = await fetch(`${MODAL_API_URL}/volumes`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: volumeName,
        namespace: MODAL_VOLUME_NAMESPACE,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create volume (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Track volume creation in Redis for quick lookups
    const redis = getRedisClient();
    await redis.hset("modal:volumes", data.id, JSON.stringify({
      id: data.id,
      sessionId,
      volumeName,
      createdAt: new Date().toISOString(),
    }));

    console.log(`[Modal] Created volume: ${volumeName} (${data.id})`);
    return { id: data.id };

  } catch (error) {
    console.error("Error creating Modal volume:", error);
    throw new Error(
      `Volume creation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * List all volumes in the namespace
 *
 * @returns Array of volume metadata
 */
export async function listVolumes(): Promise<any[]> {
  try {
    const response = await fetch(
      `${MODAL_API_URL}/volumes?namespace=${MODAL_VOLUME_NAMESPACE}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list volumes (${response.status})`);
    }

    const data = await response.json();
    return data.volumes || [];

  } catch (error) {
    console.error("Error listing volumes:", error);
    return [];
  }
}

/**
 * Test Modal API connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${MODAL_API_URL}/health`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    // Also test Redis connection
    const redis = getRedisClient();
    await redis.ping();

    console.log(`[Modal] Connection test: ${response.ok ? "OK" : "FAILED"}`);
    return response.ok;
  } catch (error) {
    console.error("Modal API connection test failed:", error);
    return false;
  }
}

// ============================================================================
// FILE SYSTEM OPERATIONS (Modal Volumes API)
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
    // Extract session ID from volumeId
    const sessionId = volumeId.replace("vol-", "");
    const volumeName = getVolumeName(sessionId);

    // Normalize path (remove leading slashes)
    const normalizedPath = filePath.replace(/^\/+/, "");

    // Write to Modal Volume
    const encodedPath = encodeURIComponent(normalizedPath);
    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}/files/${encodedPath}`,
      {
        method: "PUT",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "text/plain",
        },
        body: content,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to write file (${response.status}): ${errorText}`);
    }

    // Track operation in Redis
    const redis = getRedisClient();
    await redis.lpush(
      `modal:ops:${volumeId}`,
      JSON.stringify({
        type: "write",
        path: normalizedPath,
        size: Buffer.byteLength(content, "utf8"),
        timestamp: new Date().toISOString(),
      })
    );
    await redis.ltrim(`modal:ops:${volumeId}`, 0, 99); // Keep last 100 operations

    console.log(`[Modal] Wrote file: ${normalizedPath} (${Buffer.byteLength(content, "utf8")} bytes)`);
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
    // Extract session ID from volumeId
    const sessionId = volumeId.replace("vol-", "");
    const volumeName = getVolumeName(sessionId);

    // Normalize path
    const normalizedPath = filePath.replace(/^\/+/, "");

    // Read from Modal Volume
    const encodedPath = encodeURIComponent(normalizedPath);
    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}/files/${encodedPath}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to read file (${response.status}): ${errorText}`);
    }

    const content = await response.text();

    // Track operation in Redis
    const redis = getRedisClient();
    await redis.lpush(
      `modal:ops:${volumeId}`,
      JSON.stringify({
        type: "read",
        path: normalizedPath,
        timestamp: new Date().toISOString(),
      })
    );
    await redis.ltrim(`modal:ops:${volumeId}`, 0, 99);

    console.log(`[Modal] Read file: ${normalizedPath} (${Buffer.byteLength(content, "utf8")} bytes)`);
    return content;

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
 * @param sessionId - Session identifier (not volumeId for backward compatibility)
 * @param rootPath - Root path to list (defaults to "/")
 * @returns File tree structure
 */
export async function getFileSystem(
  sessionId: string,
  rootPath: string = "/"
): Promise<FileNode[]> {
  try {
    const volumeName = getVolumeName(sessionId);
    const encodedPath = encodeURIComponent(rootPath);

    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}/tree?path=${encodedPath}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get file tree (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Modal] Listed file tree for ${volumeName}`);
    return data.tree || [];

  } catch (error) {
    console.error("Error getting file system:", error);
    throw new Error(
      `File system read failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
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

// ============================================================================
// SANDBOX & TERMINAL
// ============================================================================

/**
 * Create a sandbox instance for a session
 *
 * @param sessionId - Session identifier
 * @param initialFiles - Initial files to populate (optional)
 * @returns Sandbox instance metadata
 */
export async function createSandbox(
  sessionId: string,
  initialFiles: Record<string, string> = {}
): Promise<SandboxInstance> {
  const redis = getRedisClient();
  const volumeId = `vol-${sessionId}`;
  const sandboxId = `sandbox-${sessionId}`;

  try {
    // Create Modal volume
    const volume = await createVolume(sessionId);

    // Initialize files if provided
    for (const [path, content] of Object.entries(initialFiles)) {
      await writeFile(volumeId, path, content);
    }

    // Store sandbox metadata in Redis
    const sandbox: SandboxInstance = {
      id: sandboxId,
      sessionId,
      volumeId,
      status: "ready",
      createdAt: new Date(),
      language: "multi", // Support multiple languages
    };

    await redis.hset(
      "modal:sandboxes",
      sandboxId,
      JSON.stringify(sandbox)
    );

    console.log(`[Modal] Created sandbox: ${sandboxId} with volume ${volume.id}`);
    return sandbox;
  } catch (error) {
    console.error("Error creating sandbox:", error);
    throw new Error(
      `Sandbox creation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * List all active sandboxes
 *
 * @returns Array of sandbox instances
 */
export async function listActiveSandboxes(): Promise<SandboxInstance[]> {
  const redis = getRedisClient();

  try {
    const sandboxes = await redis.hgetall("modal:sandboxes");
    return Object.values(sandboxes).map(s => {
      const parsed = JSON.parse(s);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
      };
    });
  } catch (error) {
    console.error("Error listing sandboxes:", error);
    return [];
  }
}

/**
 * Run a command in the sandbox
 *
 * For MVP: Executes safe commands locally with validation
 * Future: Will execute in Modal sandbox container
 *
 * @param sessionId - Session identifier
 * @param command - Command to execute
 * @param workingDir - Working directory relative to workspace (default: "/")
 * @returns Command output
 */
export async function runCommand(
  sessionId: string,
  command: string,
  workingDir: string = "/"
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    // Import security validation
    const { isCommandAllowed } = await import("@/lib/constants/security");

    // Validate command for security
    const validation = isCommandAllowed(command);
    if (!validation.allowed) {
      return {
        stdout: "",
        stderr: `Security Error: ${validation.reason}`,
        exitCode: 1,
      };
    }

    // Handle built-in commands that use Modal Volume
    const trimmedCmd = command.trim().toLowerCase();

    // pwd - print working directory
    if (trimmedCmd === "pwd") {
      return {
        stdout: `/workspace${workingDir}\n`,
        stderr: "",
        exitCode: 0,
      };
    }

    // ls - list files from Modal volume
    if (trimmedCmd === "ls" || trimmedCmd === "ls -la" || trimmedCmd === "ls -l") {
      const files = await getFileSystem(sessionId, workingDir);
      const output = files
        .map(f => {
          if (trimmedCmd === "ls") {
            return f.name;
          } else {
            const perms = f.type === "directory" ? "drwxr-xr-x" : "-rw-r--r--";
            const size = f.size || 0;
            const date = f.mtime ? new Date(f.mtime).toDateString() : new Date().toDateString();
            return `${perms}  1 user user ${String(size).padStart(8)} ${date} ${f.name}`;
          }
        })
        .join("\n");

      return {
        stdout: output + "\n",
        stderr: "",
        exitCode: 0,
      };
    }

    // cat - read file from Modal volume
    if (trimmedCmd.startsWith("cat ")) {
      const filePath = command.substring(4).trim();
      try {
        const volumeId = `vol-${sessionId}`;
        const content = await readFile(volumeId, filePath);
        return {
          stdout: content + "\n",
          stderr: "",
          exitCode: 0,
        };
      } catch (error) {
        return {
          stdout: "",
          stderr: `cat: ${filePath}: No such file or directory\n`,
          exitCode: 1,
        };
      }
    }

    // clear - ANSI escape sequence
    if (trimmedCmd === "clear" || trimmedCmd === "cls") {
      return {
        stdout: "\x1b[2J\x1b[H",
        stderr: "",
        exitCode: 0,
      };
    }

    // For other commands, execute safely in subprocess with timeout
    const timeout = 30000; // 30 seconds
    const maxBuffer = 1024 * 1024; // 1MB

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer,
        shell: "/bin/bash",
        cwd: process.cwd(), // Execute in app directory for now
      });

      return {
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: 0,
      };
    } catch (execError: any) {
      // Handle execution errors
      if (execError.killed) {
        return {
          stdout: "",
          stderr: "Error: Command timed out after 30 seconds\n",
          exitCode: 124,
        };
      }

      return {
        stdout: execError.stdout || "",
        stderr: execError.stderr || execError.message || "Command execution failed\n",
        exitCode: execError.code || 1,
      };
    }
  } catch (error) {
    console.error("Error running command:", error);
    return {
      stdout: "",
      stderr: `Error: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      exitCode: 1,
    };
  }
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
  listActiveSandboxes,
  runCommand,
};

/**
 * Graceful shutdown
 */
export async function closeConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log("[Modal] Redis connection closed");
  }
}
