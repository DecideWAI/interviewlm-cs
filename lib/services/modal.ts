/**
 * Modal AI Sandbox Service with Persistent Volumes
 *
 * Manages secure code execution environments using Modal AI with persistent storage.
 * Each interview session gets its own Modal Volume for file persistence.
 * This enables instant resume, replay, and state management without constant syncing.
 */

import { z } from "zod";
import type { WebSocket } from "ws";

// Configuration
const MODAL_API_URL = process.env.MODAL_API_URL || "https://modal.com/api/v1";
const EXECUTION_TIMEOUT = 30000; // 30 seconds
const MEMORY_LIMIT_MB = 512;
const CPU_LIMIT = 1.0;

// Volume configuration
const MODAL_VOLUME_NAMESPACE = process.env.MODAL_VOLUME_NAMESPACE || "interviewlm";
const MODAL_RETENTION_DAYS = parseInt(process.env.MODAL_RETENTION_DAYS || "7", 10);
const WORKSPACE_MOUNT_PATH = "/workspace";

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
  volumeId: string;
  status: "initializing" | "ready" | "running" | "stopped";
  createdAt: Date;
  language: string;
  wsUrl?: string;
}

/**
 * Modal Volume metadata
 */
export interface ModalVolume {
  id: string;
  name: string;
  sessionId: string;
  namespace: string;
  size: number; // bytes
  createdAt: Date;
  lastAccessed?: Date;
  retentionUntil?: Date;
}

/**
 * File tree node
 */
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
  content?: string; // Only for files when requested
}

/**
 * Initial files for sandbox setup
 */
export interface InitialFiles {
  [path: string]: string; // path -> content mapping
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
export async function createVolume(sessionId: string): Promise<ModalVolume> {
  try {
    const volumeName = getVolumeName(sessionId);
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + MODAL_RETENTION_DAYS);

    const response = await fetch(`${MODAL_API_URL}/volumes`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: volumeName,
        namespace: MODAL_VOLUME_NAMESPACE,
        retentionUntil: retentionDate.toISOString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create volume (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      name: volumeName,
      sessionId,
      namespace: MODAL_VOLUME_NAMESPACE,
      size: data.size || 0,
      createdAt: new Date(data.createdAt),
      retentionUntil: retentionDate,
    };

  } catch (error) {
    console.error("Error creating Modal volume:", error);
    throw new Error(
      `Volume creation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if a volume exists for a session
 *
 * @param sessionId - Session identifier
 * @returns True if volume exists
 */
export async function volumeExists(sessionId: string): Promise<boolean> {
  try {
    const volumeName = getVolumeName(sessionId);
    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    return response.ok;

  } catch (error) {
    console.error("Error checking volume existence:", error);
    return false;
  }
}

/**
 * Get volume metadata
 *
 * @param sessionId - Session identifier
 * @returns Volume metadata
 */
export async function getVolume(sessionId: string): Promise<ModalVolume | null> {
  try {
    const volumeName = getVolumeName(sessionId);
    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      id: data.id,
      name: volumeName,
      sessionId,
      namespace: MODAL_VOLUME_NAMESPACE,
      size: data.size || 0,
      createdAt: new Date(data.createdAt),
      lastAccessed: data.lastAccessed ? new Date(data.lastAccessed) : undefined,
      retentionUntil: data.retentionUntil ? new Date(data.retentionUntil) : undefined,
    };

  } catch (error) {
    console.error("Error getting volume metadata:", error);
    return null;
  }
}

/**
 * List all volumes in the namespace
 *
 * @returns Array of volume metadata
 */
export async function listVolumes(): Promise<ModalVolume[]> {
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

    return data.volumes.map((vol: any) => ({
      id: vol.id,
      name: vol.name,
      sessionId: vol.name.replace("interview-", ""),
      namespace: MODAL_VOLUME_NAMESPACE,
      size: vol.size || 0,
      createdAt: new Date(vol.createdAt),
      lastAccessed: vol.lastAccessed ? new Date(vol.lastAccessed) : undefined,
      retentionUntil: vol.retentionUntil ? new Date(vol.retentionUntil) : undefined,
    }));

  } catch (error) {
    console.error("Error listing volumes:", error);
    return [];
  }
}

/**
 * Create a snapshot of a volume for replay/archival
 *
 * @param sessionId - Session identifier
 * @param snapshotName - Optional custom snapshot name
 * @returns Snapshot metadata
 */
export async function snapshotVolume(
  sessionId: string,
  snapshotName?: string
): Promise<{ id: string; name: string; createdAt: Date }> {
  try {
    const volumeName = getVolumeName(sessionId);
    const snapName = snapshotName || `${volumeName}-${Date.now()}`;

    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}/snapshots`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: snapName,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create snapshot (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      name: snapName,
      createdAt: new Date(data.createdAt),
    };

  } catch (error) {
    console.error("Error creating volume snapshot:", error);
    throw new Error(
      `Snapshot creation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Delete a volume
 *
 * @param sessionId - Session identifier
 */
export async function deleteVolume(sessionId: string): Promise<void> {
  try {
    const volumeName = getVolumeName(sessionId);
    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}`,
      {
        method: "DELETE",
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Failed to delete volume (${response.status}): ${errorText}`);
    }

  } catch (error) {
    console.error("Error deleting volume:", error);
    // Don't throw - volume deletion failures shouldn't break the flow
  }
}

// ============================================================================
// FILE SYSTEM OPERATIONS
// ============================================================================

/**
 * Read a file from the session's volume
 *
 * @param sessionId - Session identifier
 * @param filePath - Path to file within workspace
 * @returns File content
 */
export async function readFile(
  sessionId: string,
  filePath: string
): Promise<string> {
  try {
    const volumeName = getVolumeName(sessionId);
    const encodedPath = encodeURIComponent(filePath);

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

    return await response.text();

  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw new Error(
      `File read failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Write a file to the session's volume
 *
 * @param sessionId - Session identifier
 * @param filePath - Path to file within workspace
 * @param content - File content
 */
export async function writeFile(
  sessionId: string,
  filePath: string,
  content: string
): Promise<void> {
  try {
    const volumeName = getVolumeName(sessionId);
    const encodedPath = encodeURIComponent(filePath);

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

  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    throw new Error(
      `File write failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get file tree structure from the session's volume
 *
 * @param sessionId - Session identifier
 * @param rootPath - Root path to list (defaults to workspace root)
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

    return data.tree || [];

  } catch (error) {
    console.error("Error getting file system:", error);
    throw new Error(
      `File system read failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Initialize volume with starter files
 *
 * @param sessionId - Session identifier
 * @param initialFiles - Map of file paths to content
 */
async function initializeVolumeFiles(
  sessionId: string,
  initialFiles: InitialFiles
): Promise<void> {
  try {
    const volumeName = getVolumeName(sessionId);

    const response = await fetch(
      `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}/batch-write`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          files: initialFiles,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to initialize files (${response.status}): ${errorText}`);
    }

  } catch (error) {
    console.error("Error initializing volume files:", error);
    throw new Error(
      `File initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================================================
// SANDBOX MANAGEMENT WITH VOLUMES
// ============================================================================

/**
 * Execute code with test cases using the session's volume
 *
 * @param sessionId - Session identifier
 * @param code - The code to execute
 * @param testCases - Array of test cases to run
 * @returns Execution results with test outcomes
 *
 * @example
 * ```typescript
 * const result = await executeCode(
 *   "session-123",
 *   "function add(a, b) { return a + b; }",
 *   [{ name: "test_add", input: [2, 3], expected: 5 }]
 * );
 * console.log(`${result.passedTests}/${result.totalTests} tests passed`);
 * ```
 */
export async function executeCode(
  sessionId: string,
  code: string,
  testCases: TestCase[]
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    const volumeName = getVolumeName(sessionId);

    // Prepare execution payload with volume mount
    const payload = {
      volumeName,
      volumeNamespace: MODAL_VOLUME_NAMESPACE,
      volumeMountPath: WORKSPACE_MOUNT_PATH,
      code,
      testCases,
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
 * Create a new sandbox instance with persistent volume
 * Creates a new volume, initializes it with starter files, and mounts it to the sandbox
 *
 * @param sessionId - Unique session identifier
 * @param initialFiles - Initial files to populate the workspace
 * @returns Sandbox instance metadata
 *
 * @example
 * ```typescript
 * const sandbox = await createSandbox("session-123", {
 *   "solution.js": "function solve() { return 42; }",
 *   "test.js": "const result = solve(); console.log(result);"
 * });
 * ```
 */
export async function createSandbox(
  sessionId: string,
  initialFiles: InitialFiles = {}
): Promise<SandboxInstance> {
  try {
    // Create a new volume for this session
    const volume = await createVolume(sessionId);

    // Initialize volume with starter files if provided
    if (Object.keys(initialFiles).length > 0) {
      await initializeVolumeFiles(sessionId, initialFiles);
    }

    const volumeName = getVolumeName(sessionId);

    // Create sandbox with volume mount
    const response = await fetch(`${MODAL_API_URL}/sandboxes`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        sessionId,
        volumeName,
        volumeNamespace: MODAL_VOLUME_NAMESPACE,
        volumeMountPath: WORKSPACE_MOUNT_PATH,
        timeout: EXECUTION_TIMEOUT,
        memoryLimit: MEMORY_LIMIT_MB,
        cpuLimit: CPU_LIMIT,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Cleanup volume if sandbox creation fails
      await deleteVolume(sessionId);
      throw new Error(`Failed to create sandbox (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      sessionId,
      volumeId: volume.id,
      status: data.status,
      createdAt: new Date(data.createdAt),
      language: data.language || "unknown",
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
 * Resume a sandbox instance from existing volume
 * Instant resume - just mounts the existing volume without recreating it
 *
 * @param sessionId - Session identifier
 * @returns Sandbox instance metadata
 *
 * @example
 * ```typescript
 * // Resume a paused interview session
 * const sandbox = await resumeSandbox("session-123");
 * // All files are immediately available from the volume
 * const files = await getFileSystem(sessionId);
 * ```
 */
export async function resumeSandbox(sessionId: string): Promise<SandboxInstance> {
  try {
    // Check if volume exists
    const exists = await volumeExists(sessionId);
    if (!exists) {
      throw new Error(`No volume found for session ${sessionId}. Cannot resume.`);
    }

    const volume = await getVolume(sessionId);
    if (!volume) {
      throw new Error(`Failed to get volume metadata for session ${sessionId}`);
    }

    const volumeName = getVolumeName(sessionId);

    // Create sandbox with existing volume mount
    const response = await fetch(`${MODAL_API_URL}/sandboxes`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        sessionId,
        volumeName,
        volumeNamespace: MODAL_VOLUME_NAMESPACE,
        volumeMountPath: WORKSPACE_MOUNT_PATH,
        timeout: EXECUTION_TIMEOUT,
        memoryLimit: MEMORY_LIMIT_MB,
        cpuLimit: CPU_LIMIT,
        resume: true, // Flag to indicate this is a resume operation
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to resume sandbox (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      sessionId,
      volumeId: volume.id,
      status: data.status,
      createdAt: new Date(data.createdAt),
      language: data.language || "unknown",
      wsUrl: data.wsUrl,
    };

  } catch (error) {
    console.error("Error resuming Modal sandbox:", error);
    throw new Error(
      `Sandbox resume failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Destroy a sandbox instance and optionally archive the volume
 * Stops the sandbox and can optionally snapshot the volume to S3 for long-term storage
 *
 * @param sessionId - Session identifier
 * @param archiveToS3 - Whether to archive volume contents to S3 before deletion
 * @param deleteVolumeAfter - Whether to delete the volume after archiving (default: false to keep for replay)
 *
 * @example
 * ```typescript
 * // Archive to S3 but keep volume for replay
 * await destroySandbox("session-123", true, false);
 *
 * // Just stop sandbox, keep volume for quick resume
 * await destroySandbox("session-123", false, false);
 *
 * // Full cleanup - archive and delete
 * await destroySandbox("session-123", true, true);
 * ```
 */
export async function destroySandbox(
  sessionId: string,
  archiveToS3: boolean = false,
  deleteVolumeAfter: boolean = false
): Promise<void> {
  try {
    // 1. Get the sandbox ID for this session
    const sandboxes = await listActiveSandboxes();
    const sandbox = sandboxes.find(s => s.sessionId === sessionId);

    if (!sandbox) {
      console.warn(`No active sandbox found for session ${sessionId}`);
    } else {
      // 2. Stop the sandbox
      const response = await fetch(`${MODAL_API_URL}/sandboxes/${sandbox.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        console.error(`Failed to destroy sandbox (${response.status}): ${errorText}`);
      }
    }

    // 3. Archive volume to S3 if requested
    if (archiveToS3) {
      try {
        const volumeName = getVolumeName(sessionId);
        const archiveResponse = await fetch(
          `${MODAL_API_URL}/volumes/${MODAL_VOLUME_NAMESPACE}/${volumeName}/archive`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              destination: "s3",
              bucket: process.env.S3_BUCKET_NAME || "interviewlm-sessions",
              prefix: `sessions/${sessionId}/`,
            }),
          }
        );

        if (!archiveResponse.ok) {
          const errorText = await archiveResponse.text();
          console.error(`Failed to archive volume to S3 (${archiveResponse.status}): ${errorText}`);
        } else {
          console.log(`Volume archived to S3 for session ${sessionId}`);
        }
      } catch (archiveError) {
        console.error("Error archiving volume to S3:", archiveError);
        // Don't throw - archival failures shouldn't break the flow
      }
    }

    // 4. Delete volume if requested
    if (deleteVolumeAfter) {
      await deleteVolume(sessionId);
    } else {
      console.log(`Volume kept for session ${sessionId} (can be used for resume/replay)`);
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
 * @param sessionId - Session identifier
 * @returns Current status information including volume usage
 */
export async function getSandboxStatus(sessionId: string): Promise<{
  status: string;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  volumeSize?: number;
}> {
  try {
    // Find active sandbox for this session
    const sandboxes = await listActiveSandboxes();
    const sandbox = sandboxes.find(s => s.sessionId === sessionId);

    if (!sandbox) {
      throw new Error(`No active sandbox found for session ${sessionId}`);
    }

    const response = await fetch(`${MODAL_API_URL}/sandboxes/${sandbox.id}/status`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get sandbox status (${response.status})`);
    }

    const data = await response.json();

    // Get volume size
    const volume = await getVolume(sessionId);

    return {
      ...data,
      volumeSize: volume?.size,
    };

  } catch (error) {
    console.error("Error getting sandbox status:", error);
    throw new Error(
      `Sandbox status check failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Run a single command in the sandbox's volume workspace
 * Useful for setup tasks, npm install, running tests, etc.
 *
 * @param sessionId - Session identifier
 * @param command - Command to execute
 * @param workingDir - Working directory relative to workspace mount (default: "/")
 * @returns Command output
 *
 * @example
 * ```typescript
 * // Install dependencies
 * await runCommand("session-123", "npm install");
 *
 * // Run tests
 * const result = await runCommand("session-123", "npm test");
 * console.log(result.stdout);
 * ```
 */
export async function runCommand(
  sessionId: string,
  command: string,
  workingDir: string = "/"
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    // Find active sandbox for this session
    const sandboxes = await listActiveSandboxes();
    const sandbox = sandboxes.find(s => s.sessionId === sessionId);

    if (!sandbox) {
      throw new Error(`No active sandbox found for session ${sessionId}`);
    }

    const volumeName = getVolumeName(sessionId);

    const response = await fetch(`${MODAL_API_URL}/sandboxes/${sandbox.id}/exec`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        command,
        workingDir: `${WORKSPACE_MOUNT_PATH}${workingDir}`,
        volumeName,
        volumeNamespace: MODAL_VOLUME_NAMESPACE,
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
 * Includes volume information for each sandbox
 */
export async function listActiveSandboxes(): Promise<SandboxInstance[]> {
  try {
    const workspace = process.env.MODAL_WORKSPACE || "default";

    const response = await fetch(
      `${MODAL_API_URL}/sandboxes?workspace=${workspace}&namespace=${MODAL_VOLUME_NAMESPACE}`,
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
      volumeId: sb.volumeId || "",
      status: sb.status,
      createdAt: new Date(sb.createdAt),
      language: sb.language || "unknown",
      wsUrl: sb.wsUrl,
    }));

  } catch (error) {
    console.error("Error listing sandboxes:", error);
    return [];
  }
}
