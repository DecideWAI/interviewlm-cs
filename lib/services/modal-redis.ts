/**
 * Modal Service with Redis-Backed File Storage
 *
 * This is a production-ready implementation that bridges modal-simple.ts and modal.ts:
 * - Uses HTTP endpoint for code execution (like modal-simple.ts)
 * - Implements real file operations using Redis (preparation for modal.ts)
 * - Maintains full API compatibility
 * - Easy migration to real Modal volumes when ready
 *
 * Architecture:
 * - Files stored in Redis hash: `modal:volume:{volumeId}:file:{filePath}` -> content
 * - File metadata in Redis hash: `modal:volume:{volumeId}:meta:{filePath}` -> {size, mtime, type}
 * - File tree in Redis sorted set: `modal:volume:{volumeId}:tree` -> [filePaths]
 * - Volume info in Redis hash: `modal:volumes` -> {volumeId: metadata}
 */

import { z } from "zod";
import { Redis } from "ioredis";

// Configuration
const MODAL_EXECUTE_URL = process.env.MODAL_EXECUTE_URL;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Redis client singleton
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
 * File metadata
 */
interface FileMetadata {
  size: number;
  mtime: string; // ISO timestamp
  type: "file" | "directory";
}

// ============================================================================
// VOLUME MANAGEMENT
// ============================================================================

/**
 * Create a new volume for an interview session
 *
 * @param sessionId - Session identifier
 * @returns Volume metadata
 */
export async function createVolume(sessionId: string): Promise<{ id: string }> {
  const redis = getRedisClient();
  const volumeId = `vol-${sessionId}`;

  // Store volume metadata
  await redis.hset("modal:volumes", volumeId, JSON.stringify({
    id: volumeId,
    sessionId,
    createdAt: new Date().toISOString(),
    size: 0,
  }));

  console.log(`[Modal Redis] Created volume: ${volumeId}`);
  return { id: volumeId };
}

/**
 * List all volumes
 *
 * @returns Array of volume metadata
 */
export async function listVolumes(): Promise<any[]> {
  const redis = getRedisClient();

  try {
    const volumes = await redis.hgetall("modal:volumes");
    return Object.values(volumes).map(v => JSON.parse(v));
  } catch (error) {
    console.error("Error listing volumes:", error);
    return [];
  }
}

/**
 * Test Modal connection (tests both Redis and Modal HTTP endpoint)
 */
export async function testConnection(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    await redis.ping();
    console.log("[Modal Redis] Redis connection OK");

    // Also test Modal HTTP endpoint if configured
    if (MODAL_EXECUTE_URL) {
      const healthUrl = MODAL_EXECUTE_URL.replace('-execute', '-health');
      const response = await fetch(healthUrl, { method: "GET" });
      console.log(`[Modal Redis] Modal HTTP endpoint: ${response.ok ? "OK" : "UNAVAILABLE"}`);
    }

    return true;
  } catch (error) {
    console.error("Modal connection test failed:", error);
    return false;
  }
}

// ============================================================================
// FILE SYSTEM OPERATIONS
// ============================================================================

/**
 * Write a file to the volume
 *
 * @param volumeId - Volume identifier
 * @param filePath - Path to file within workspace
 * @param content - File content
 */
export async function writeFile(
  volumeId: string,
  filePath: string,
  content: string
): Promise<void> {
  const redis = getRedisClient();

  try {
    // Normalize path (remove leading slashes, ensure consistency)
    const normalizedPath = filePath.replace(/^\/+/, "");

    // Store file content
    const contentKey = `modal:volume:${volumeId}:file:${normalizedPath}`;
    await redis.set(contentKey, content);

    // Store file metadata
    const metaKey = `modal:volume:${volumeId}:meta:${normalizedPath}`;
    const metadata: FileMetadata = {
      size: Buffer.byteLength(content, "utf8"),
      mtime: new Date().toISOString(),
      type: "file",
    };
    await redis.set(metaKey, JSON.stringify(metadata));

    // Add to file tree (sorted set by path)
    const treeKey = `modal:volume:${volumeId}:tree`;
    await redis.zadd(treeKey, Date.now(), normalizedPath);

    // Update directory entries
    await updateDirectoryTree(volumeId, normalizedPath);

    console.log(`[Modal Redis] Wrote file: ${normalizedPath} (${metadata.size} bytes)`);
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    throw new Error(
      `File write failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Read a file from the volume
 *
 * @param volumeId - Volume identifier
 * @param filePath - Path to file within workspace
 * @returns File content
 */
export async function readFile(
  volumeId: string,
  filePath: string
): Promise<string> {
  const redis = getRedisClient();

  try {
    // Normalize path
    const normalizedPath = filePath.replace(/^\/+/, "");

    const contentKey = `modal:volume:${volumeId}:file:${normalizedPath}`;
    const content = await redis.get(contentKey);

    if (content === null) {
      throw new Error(`File not found: ${filePath}`);
    }

    console.log(`[Modal Redis] Read file: ${normalizedPath} (${Buffer.byteLength(content, "utf8")} bytes)`);
    return content;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw new Error(
      `File read failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get file tree structure from the volume
 *
 * @param sessionId - Session identifier (not volumeId for backward compatibility)
 * @param rootPath - Root path to list (defaults to "/")
 * @returns File tree structure
 */
export async function getFileSystem(
  sessionId: string,
  rootPath: string = "/"
): Promise<FileNode[]> {
  const redis = getRedisClient();
  const volumeId = `vol-${sessionId}`;

  try {
    const treeKey = `modal:volume:${volumeId}:tree`;

    // Get all file paths
    const filePaths = await redis.zrange(treeKey, 0, -1);

    if (filePaths.length === 0) {
      return [];
    }

    // Build tree structure
    const tree: FileNode[] = [];
    const directories = new Map<string, FileNode>();

    for (const path of filePaths) {
      const metaKey = `modal:volume:${volumeId}:meta:${path}`;
      const metaStr = await redis.get(metaKey);
      const metadata: FileMetadata = metaStr ? JSON.parse(metaStr) : {
        size: 0,
        mtime: new Date().toISOString(),
        type: "file",
      };

      const parts = path.split("/");
      const name = parts[parts.length - 1];

      const node: FileNode = {
        name,
        path: `/${path}`,
        type: metadata.type,
        size: metadata.size,
        mtime: metadata.mtime,
      };

      // If file is in root, add directly
      if (parts.length === 1) {
        tree.push(node);
      } else {
        // Create parent directories if needed
        let currentPath = "";
        for (let i = 0; i < parts.length - 1; i++) {
          const dirName = parts[i];
          const parentPath = currentPath;
          currentPath = currentPath ? `${currentPath}/${dirName}` : dirName;

          if (!directories.has(currentPath)) {
            const dirNode: FileNode = {
              name: dirName,
              path: `/${currentPath}`,
              type: "directory",
              children: [],
            };
            directories.set(currentPath, dirNode);

            // Add to parent or root
            if (parentPath) {
              const parent = directories.get(parentPath);
              if (parent && parent.children) {
                parent.children.push(dirNode);
              }
            } else {
              tree.push(dirNode);
            }
          }
        }

        // Add file to parent directory
        const parentPath = parts.slice(0, -1).join("/");
        if (parentPath) {
          const parent = directories.get(parentPath);
          if (parent && parent.children) {
            parent.children.push(node);
          }
        }
      }
    }

    console.log(`[Modal Redis] Listed ${filePaths.length} files in ${volumeId}`);
    return tree;
  } catch (error) {
    console.error("Error getting file system:", error);
    throw new Error(
      `File system read failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Update directory tree when a file is added
 */
async function updateDirectoryTree(volumeId: string, filePath: string): Promise<void> {
  const redis = getRedisClient();
  const parts = filePath.split("/");

  // Create directory entries for all parent directories
  for (let i = 1; i < parts.length; i++) {
    const dirPath = parts.slice(0, i).join("/");
    const metaKey = `modal:volume:${volumeId}:meta:${dirPath}`;

    // Check if directory metadata exists
    const exists = await redis.exists(metaKey);
    if (!exists) {
      const dirMetadata: FileMetadata = {
        size: 0,
        mtime: new Date().toISOString(),
        type: "directory",
      };
      await redis.set(metaKey, JSON.stringify(dirMetadata));

      // Add to tree
      const treeKey = `modal:volume:${volumeId}:tree`;
      await redis.zadd(treeKey, Date.now(), dirPath);
    }
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
// TERMINAL & COMMAND EXECUTION
// ============================================================================

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

/**
 * Create a sandbox instance for a session
 * For Redis-backed version, this just initializes metadata
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
    // Create volume if it doesn't exist
    const volumes = await listVolumes();
    if (!volumes.find(v => v.id === volumeId)) {
      await createVolume(sessionId);
    }

    // Initialize files if provided
    for (const [path, content] of Object.entries(initialFiles)) {
      await writeFile(volumeId, path, content);
    }

    // Store sandbox metadata
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

    console.log(`[Modal Redis] Created sandbox: ${sandboxId}`);
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

    // Handle built-in commands that don't need subprocess
    const trimmedCmd = command.trim().toLowerCase();

    // pwd - print working directory
    if (trimmedCmd === "pwd") {
      return {
        stdout: `/workspace${workingDir}\n`,
        stderr: "",
        exitCode: 0,
      };
    }

    // ls - list files from Redis volume
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

    // cat - read file from Redis volume
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
    console.log("[Modal Redis] Connection closed");
  }
}
