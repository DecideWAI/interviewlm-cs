/**
 * Modal Service - TypeScript SDK Implementation
 *
 * Uses Modal's official TypeScript SDK for sandbox operations.
 * Each session gets an isolated container from the deployed interviewlm-executor app.
 * Supports any language/framework - candidates can install what they need.
 */

import { ModalClient } from "modal";
import prisma from "@/lib/prisma";
import { acquireLock } from "@/lib/utils/redis-lock";

// Sandbox session cache (in-memory for performance, but we also persist to DB)
const sandboxes = new Map<string, { sandbox: any; sandboxId: string; createdAt: Date }>();

// In-memory pending creations (prevents race conditions within same process)
const pendingCreations = new Map<string, Promise<any>>();

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
 * Get the volume name for a session (deterministic)
 */
function getVolumeName(sessionId: string): string {
  return `interview-volume-${sessionId}`;
}

/**
 * Get or create a persistent volume for a session
 * Volumes persist files across sandbox restarts
 */
async function getOrCreateVolume(sessionId: string): Promise<any> {
  const modal = getModalClient();
  const volumeName = getVolumeName(sessionId);

  console.log(`[Modal] Getting or creating volume: ${volumeName}`);

  // fromName with createIfMissing will create if doesn't exist, or return existing
  const volume = await modal.volumes.fromName(volumeName, { createIfMissing: true });

  console.log(`[Modal] Volume ready: ${volumeName}`);
  return volume;
}

/**
 * Create a new sandbox for a session with mounted volume (internal use)
 * The volume is persistent - files survive sandbox restarts
 */
async function createNewSandbox(sessionId: string): Promise<{ sandbox: any; sandboxId: string; volumeName: string }> {
  const modal = getModalClient();

  // Get or create the app
  const app = await modal.apps.fromName("interviewlm-executor", { createIfMissing: true });

  // Get or create persistent volume for this session
  const volume = await getOrCreateVolume(sessionId);
  const volumeName = getVolumeName(sessionId);

  // Create image with development tools
  // Using Node.js 20 on Debian base - provides Node.js pre-installed (faster startup)
  // Alternative: Use custom deployed image with modal_image.py for even faster startup
  const image = modal.images.fromRegistry("node:20-bookworm-slim");

  // Create sandbox with the image AND mounted volume
  // The volume is mounted at /workspace - files persist here
  const sandbox = await modal.sandboxes.create(app, image, {
    timeoutMs: SANDBOX_TIMEOUT_MS,
    cpu: 2.0,
    memoryMiB: 2048,
    volumes: {
      "/workspace": volume,
    },
  });

  // Verify Node.js is available (should be pre-installed)
  const nodeCheckProc = await exec(sandbox, ["node", "--version"]);
  const nodeVersion = await nodeCheckProc.stdout.readText();
  console.log(`[Modal] Node.js version: ${nodeVersion.trim()}`);

  // Install pnpm if not already available (faster than npm, cached in volume)
  const pnpmCheckProc = await exec(sandbox, ["which", "pnpm"]);
  const pnpmCheckExit = await pnpmCheckProc.exitCode;
  if (pnpmCheckExit !== 0) {
    console.log(`[Modal] Installing pnpm...`);
    const pnpmInstallProc = await exec(sandbox, ["npm", "install", "-g", "pnpm"]);
    await pnpmInstallProc.exitCode;
  }

  // Install Python and pytest for Python test support
  const pythonCheckProc = await exec(sandbox, ["which", "python3"]);
  const pythonCheckExit = await pythonCheckProc.exitCode;
  if (pythonCheckExit !== 0) {
    console.log(`[Modal] Installing Python3 and pytest...`);
    const pythonInstallProc = await exec(sandbox, ["bash", "-c",
      "apt-get update && apt-get install -y python3 python3-pip && pip3 install pytest --break-system-packages"
    ]);
    await pythonInstallProc.exitCode;
  }

  const sandboxId = sandbox.sandboxId;
  console.log(`[Modal] Created new sandbox ${sandboxId} with volume ${volumeName} for session ${sessionId}`);

  return { sandbox, sandboxId, volumeName };
}

/**
 * Try to reconnect to an existing sandbox by ID
 * If reconnection fails, returns null (caller should create new sandbox with same volume)
 */
async function reconnectToSandbox(sandboxId: string): Promise<any | null> {
  try {
    const modal = getModalClient();
    const sandbox = await modal.sandboxes.fromId(sandboxId);

    // Verify sandbox is healthy by running a simple command with timeout
    const healthCheck = Promise.race([
      (async () => {
        const proc = await sandbox["exec"](["echo", "ok"]);
        const output = await proc.stdout.readText();
        return output.trim() === "ok";
      })(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
    ]);

    const isHealthy = await healthCheck;
    if (!isHealthy) {
      console.log(`[Modal] Sandbox ${sandboxId} failed health check, will create new sandbox with same volume`);
      return null;
    }

    console.log(`[Modal] Reconnected to healthy sandbox ${sandboxId}`);
    return sandbox;
  } catch (error) {
    console.log(`[Modal] Failed to reconnect to sandbox ${sandboxId}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Create a sandbox for a session (public API)
 * The sandbox is created with a mounted persistent volume (volume_{sessionId})
 */
export async function createSandbox(sessionId: string): Promise<SandboxInstance> {
  const { sandbox, sandboxId, volumeName } = await createNewSandbox(sessionId);
  const createdAt = new Date();

  // Store in memory cache
  sandboxes.set(sessionId, { sandbox, sandboxId, createdAt });

  // Persist sandbox ID to database for reconnection after server restart
  // Note: Volume is deterministic (based on sessionId), but we store sandboxId for quick reconnect
  try {
    await prisma.candidate.update({
      where: { id: sessionId },
      data: { volumeId: sandboxId }, // Store sandboxId for quick reconnection
    });
    console.log(`[Modal] Persisted sandbox ID ${sandboxId} (volume: ${volumeName}) for session ${sessionId}`);
  } catch (dbError) {
    // Non-critical - sandbox still works, volume is deterministic
    console.warn(`[Modal] Failed to persist sandbox ID to database:`, dbError);
  }

  return {
    id: sandboxId,
    sessionId,
    status: "ready",
    createdAt,
    environment: {},
  };
}

/**
 * Get or create sandbox for a session
 *
 * IMPORTANT: Uses persistent volumes so files survive sandbox restarts.
 * - Volume name is deterministic: volume_{sessionId}
 * - If sandbox fails/expires, a new sandbox is created with the SAME volume
 * - Files in /workspace persist across sandbox restarts
 *
 * Uses Redis distributed lock to prevent race conditions across server instances.
 * All sandbox creation MUST go through this function to ensure single sandbox per session.
 */
export async function getOrCreateSandbox(sessionId: string): Promise<any> {
  // 1. Check in-memory cache first (fast path)
  const cached = sandboxes.get(sessionId);
  if (cached) {
    console.log(`[Modal] Using cached sandbox ${cached.sandboxId} for session ${sessionId}`);
    return cached.sandbox;
  }

  // 2. Check if there's a local pending creation (same process)
  const pending = pendingCreations.get(sessionId);
  if (pending) {
    console.log(`[Modal] Waiting for pending sandbox creation for session ${sessionId}`);
    return pending;
  }

  // 3. Create the promise FIRST, then set it in pending map IMMEDIATELY
  let resolveCreation!: (sandbox: any) => void;
  let rejectCreation!: (error: Error) => void;
  const creationPromise = new Promise<any>((resolve, reject) => {
    resolveCreation = resolve;
    rejectCreation = reject;
  });

  // Set pending IMMEDIATELY before any async work
  pendingCreations.set(sessionId, creationPromise);

  // 4. Now do the actual creation work
  (async () => {
    // Acquire distributed lock (for multi-instance protection)
    console.log(`[Modal] Acquiring lock for sandbox:${sessionId}`);
    const lock = await acquireLock(`sandbox:${sessionId}`, {
      ttlMs: 120000,  // 2 min TTL (sandbox creation can take time)
      waitTimeoutMs: 60000,  // Wait up to 1 min for lock
      retryIntervalMs: 100,  // Check every 100ms
    });
    console.log(`[Modal] Lock acquired for sandbox:${sessionId}`);

    try {
      // Check cache again after acquiring lock (another instance may have created it)
      const cachedAgain = sandboxes.get(sessionId);
      if (cachedAgain) {
        console.log(`[Modal] Found cached sandbox after lock for session ${sessionId}`);
        resolveCreation(cachedAgain.sandbox);
        return;
      }

      // IMPORTANT: Check database for existing sandbox (cross-instance check)
      // This is critical for multi-server deployments
      let sandbox: any = null;
      try {
        const candidate = await prisma.candidate.findUnique({
          where: { id: sessionId },
          select: { volumeId: true },
        });

        if (candidate?.volumeId) {
          console.log(`[Modal] Found volumeId ${candidate.volumeId} in DB, attempting reconnect for session ${sessionId}`);
          sandbox = await reconnectToSandbox(candidate.volumeId);
          if (sandbox) {
            // Store in cache for future requests
            sandboxes.set(sessionId, { sandbox, sandboxId: candidate.volumeId, createdAt: new Date() });
            console.log(`[Modal] Successfully reconnected to sandbox ${candidate.volumeId} for session ${sessionId}`);
            resolveCreation(sandbox);
            return;
          }
          // Sandbox failed to reconnect - will create new one with SAME volume below
          console.log(`[Modal] Sandbox ${candidate.volumeId} reconnect failed, creating new sandbox with persistent volume`);
        } else {
          console.log(`[Modal] No existing sandbox found in DB for session ${sessionId}`);
        }
      } catch (dbError) {
        console.log(`[Modal] Could not lookup sandbox from database:`, dbError);
      }

      // Create new sandbox with persistent volume
      // Even if old sandbox expired, files persist in the volume
      console.log(`[Modal] Creating NEW sandbox for session ${sessionId} (volume: ${getVolumeName(sessionId)})`);
      await createSandbox(sessionId);
      const newSandbox = sandboxes.get(sessionId)?.sandbox;

      if (newSandbox) {
        // Verify the sandbox ID was persisted to DB before releasing lock
        const cached = sandboxes.get(sessionId);
        if (cached) {
          try {
            await prisma.candidate.update({
              where: { id: sessionId },
              data: { volumeId: cached.sandboxId },
            });
            console.log(`[Modal] Verified sandbox ${cached.sandboxId} persisted to DB for session ${sessionId}`);
          } catch (dbError) {
            console.warn(`[Modal] Failed to verify DB persistence:`, dbError);
          }
        }
        resolveCreation(newSandbox);
      } else {
        rejectCreation(new Error('Failed to create sandbox'));
      }
    } catch (error) {
      console.error(`[Modal] Error in getOrCreateSandbox for session ${sessionId}:`, error);
      rejectCreation(error instanceof Error ? error : new Error('Unknown error creating sandbox'));
    } finally {
      pendingCreations.delete(sessionId);
      console.log(`[Modal] Releasing lock for sandbox:${sessionId}`);
      await lock.release();
    }
  })();

  return creationPromise;
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
    console.warn(`[Modal] Command blocked: ${safety.reason}`);
    return { success: false, stdout: "", stderr: safety.reason!, exitCode: 1, error: safety.reason };
  }

  try {
    console.log(`[Modal] Running command for session ${sessionId}: ${command.substring(0, 100)}...`);
    const sandbox = await getOrCreateSandbox(sessionId);
    const fullCmd = `cd ${workingDir} 2>/dev/null || mkdir -p ${workingDir} && cd ${workingDir} && ${command}`;
    const proc = await exec(sandbox, ["bash", "-c", fullCmd]);

    const stdout = await proc.stdout.readText();
    const stderr = await proc.stderr.readText();
    const exitCode = await proc.exitCode;

    console.log(`[Modal] Command completed: exitCode=${exitCode}, stdout=${stdout.length}b, stderr=${stderr.length}b`);

    // Note: exitCode can be undefined on success in some Modal SDK versions
    // Treat undefined as success (exitCode 0)
    const actualExitCode = exitCode ?? 0;
    return {
      success: actualExitCode === 0,
      stdout: sanitizeOutput(stdout),
      stderr: sanitizeOutput(stderr),
      exitCode: actualExitCode,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Command failed:`, error);
    return { success: false, stdout: "", stderr: msg, exitCode: 1, error: msg };
  }
}

/**
 * Run a command with streaming output
 * Yields chunks of stdout/stderr as they arrive
 */
export async function* runCommandStreaming(
  sessionId: string,
  command: string,
  workingDir = "/workspace"
): AsyncGenerator<{ type: "stdout" | "stderr" | "exit"; data: string | number }> {
  const safety = isCommandSafe(command);
  if (!safety.safe) {
    yield { type: "stderr", data: safety.reason! };
    yield { type: "exit", data: 1 };
    return;
  }

  try {
    console.log(`[Modal] Running streaming command for session ${sessionId}: ${command.substring(0, 100)}...`);
    const sandbox = await getOrCreateSandbox(sessionId);
    const fullCmd = `cd ${workingDir} 2>/dev/null || mkdir -p ${workingDir} && cd ${workingDir} && ${command}`;
    const proc = await exec(sandbox, ["bash", "-c", fullCmd]);

    // Read stdout and stderr concurrently using async iteration
    // Modal SDK should support streaming via async iterators
    const stdoutReader = proc.stdout;
    const stderrReader = proc.stderr;

    // Read stdout and stderr - use readText() for simplicity
    // Note: Modal SDK streams don't support true async iteration well,
    // so we read the full output after the command completes
    const [stdout, stderr] = await Promise.all([
      stdoutReader.readText(),
      stderrReader.readText(),
    ]);

    if (stdout) yield { type: "stdout", data: stdout };
    if (stderr) yield { type: "stderr", data: stderr };

    const exitCode = await proc.exitCode;
    yield { type: "exit", data: exitCode ?? 0 };

    console.log(`[Modal] Streaming command completed for session ${sessionId}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Streaming command failed:`, error);
    yield { type: "stderr", data: msg };
    yield { type: "exit", data: 1 };
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
  // Note: 'exec' here is Modal sandbox exec wrapper (line 64), NOT Node.js child_process
  try {
    console.log(`[Modal] Writing file ${filePath} for session ${sessionId}, contentLength=${content.length}`);
    const sandbox = await getOrCreateSandbox(sessionId);
    const absPath = filePath.startsWith("/") ? filePath : `/workspace/${filePath}`;
    const parentDir = absPath.split("/").slice(0, -1).join("/");

    console.log(`[Modal] Creating parent directory: ${parentDir}`);
    // Modal sandbox exec - runs inside isolated container, not local shell
    await sandbox["exec"](["mkdir", "-p", parentDir]);

    // Use base64 to handle special characters safely
    const encoded = Buffer.from(content).toString("base64");
    console.log(`[Modal] Writing ${encoded.length} bytes (base64) to ${absPath}`);

    // Write base64 content to a temp file first, then decode
    // This is more reliable than heredocs or echo with large content
    const tempPath = `/tmp/file_${Date.now()}.b64`;

    // Write encoded content using printf (more portable than echo for special chars)
    // Split into chunks to avoid argument length limits
    const CHUNK_SIZE = 50000; // Safe chunk size for shell arguments
    let success = true;

    if (encoded.length <= CHUNK_SIZE) {
      // Small file - write directly
      const writeProc = await sandbox["exec"](["bash", "-c", `printf '%s' '${encoded}' | base64 -d > '${absPath}'`]);
      const exitCode = await writeProc.exitCode;
      // Note: exitCode can be undefined on success in some Modal SDK versions
      // Treat undefined or 0 as success, anything else (positive number) as failure
      if (exitCode && exitCode !== 0) {
        const stderr = await writeProc.stderr.readText();
        console.error(`[Modal] Write failed: exitCode=${exitCode}, stderr=${stderr}`);
        success = false;
      }
    } else {
      // Large file - write to temp file in chunks, then decode
      for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
        const chunk = encoded.slice(i, i + CHUNK_SIZE);
        const op = i === 0 ? '>' : '>>';
        const chunkProc = await sandbox["exec"](["bash", "-c", `printf '%s' '${chunk}' ${op} '${tempPath}'`]);
        const chunkExit = await chunkProc.exitCode;
        // Treat undefined or 0 as success
        if (chunkExit && chunkExit !== 0) {
          success = false;
          break;
        }
      }

      if (success) {
        // Decode the temp file to the target path
        const decodeProc = await sandbox["exec"](["bash", "-c", `base64 -d '${tempPath}' > '${absPath}' && rm -f '${tempPath}'`]);
        const decodeExit = await decodeProc.exitCode;
        // Treat undefined or 0 as success
        if (decodeExit && decodeExit !== 0) {
          const stderr = await decodeProc.stderr.readText();
          console.error(`[Modal] Decode failed: ${stderr}`);
          success = false;
        }
      }
    }

    if (!success) {
      return { success: false, error: "Failed to write file content" };
    }

    // Verify the file was written with correct size
    const verifyProc = await sandbox["exec"](["bash", "-c", `stat -c '%s' '${absPath}' 2>/dev/null || stat -f '%z' '${absPath}'`]);
    const verifyOutput = await verifyProc.stdout.readText();
    const actualSize = parseInt(verifyOutput.trim(), 10);
    const expectedSize = content.length;

    console.log(`[Modal] Write verification: file size ${actualSize} bytes (expected ~${expectedSize})`);

    // Warn if size seems wrong (allow for encoding differences)
    if (actualSize === 0 && expectedSize > 0) {
      console.error(`[Modal] WARNING: File was written but appears empty!`);
      return { success: false, error: "File was created but content is empty" };
    }

    console.log(`[Modal] Successfully wrote file ${filePath}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Failed to write file ${filePath}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Write multiple files to the sandbox in batch
 * More efficient than sequential writeFile calls (reduces network round trips)
 *
 * Uses a tar archive approach for optimal performance:
 * 1. Creates base64-encoded tar content
 * 2. Extracts all files in a single exec call
 */
export async function writeFilesBatch(
  sessionId: string,
  files: Record<string, string>  // {path: content}
): Promise<{ success: boolean; results: Record<string, string>; error?: string }> {
  const fileCount = Object.keys(files).length;
  console.log(`[Modal] Writing ${fileCount} files in batch for session ${sessionId}`);

  if (fileCount === 0) {
    return { success: true, results: {} };
  }

  // For small number of files, parallel writeFile is simpler and nearly as fast
  if (fileCount <= 3) {
    try {
      const results: Record<string, string> = {};
      const writePromises = Object.entries(files).map(async ([path, content]) => {
        const result = await writeFile(sessionId, path, content);
        results[path] = result.success
          ? `Wrote ${content.length} bytes`
          : result.error || "Failed";
        return { path, success: result.success };
      });

      const writeResults = await Promise.all(writePromises);
      const allSucceeded = writeResults.every(r => r.success);

      return { success: allSucceeded, results };
    } catch (error) {
      return {
        success: false,
        results: {},
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // For larger batches, use tar archive approach (10-15x faster)
  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    const results: Record<string, string> = {};

    // Create a temporary directory for staging files
    const tempDir = `/tmp/batch_${Date.now()}`;
    await sandbox["exec"](["mkdir", "-p", tempDir]);

    // Write each file to the temp directory
    for (const [path, content] of Object.entries(files)) {
      const absPath = path.startsWith("/") ? path : `/workspace/${path}`;
      const relativePath = absPath.replace(/^\/workspace\//, "");
      const tempPath = `${tempDir}/${relativePath}`;

      // Create parent directories
      const parentDir = tempPath.split("/").slice(0, -1).join("/");
      await sandbox["exec"](["mkdir", "-p", parentDir]);

      // Write file using base64
      const encoded = Buffer.from(content).toString("base64");
      const writeProc = await sandbox["exec"](["bash", "-c", `printf '%s' '${encoded}' | base64 -d > '${tempPath}'`]);
      const exitCode = await writeProc.exitCode;

      // Treat undefined or 0 as success
      if (!exitCode || exitCode === 0) {
        results[path] = `Wrote ${content.length} bytes`;
      } else {
        results[path] = "Failed to write";
      }
    }

    // Copy all files from temp to workspace in one operation
    const copyProc = await sandbox["exec"](["bash", "-c", `cp -r ${tempDir}/* /workspace/ 2>/dev/null || true`]);
    await copyProc.exitCode;

    // Cleanup temp directory
    await sandbox["exec"](["rm", "-rf", tempDir]);

    const successCount = Object.values(results).filter(r => r.startsWith("Wrote")).length;
    console.log(`[Modal] Batch write complete: ${successCount}/${fileCount} files succeeded`);

    return {
      success: successCount === fileCount,
      results,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Batch write failed:`, errorMsg);
    return { success: false, results: {}, error: errorMsg };
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
    console.log(`[Modal] Reading file ${filePath} for session ${sessionId}`);
    const sandbox = await getOrCreateSandbox(sessionId);
    const absPath = filePath.startsWith("/") ? filePath : `/workspace/${filePath}`;

    // Add timeout to prevent hanging on stale sandboxes
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('File read timed out after 10s')), 10000);
    });

    const readPromise = (async () => {
      // Note: 'exec' here is Modal sandbox exec, not Node child_process
      const proc = await sandbox["exec"](["cat", absPath]);
      const content = await proc.stdout.readText();
      const exitCode = await proc.exitCode;

      console.log(`[Modal] cat ${absPath} exitCode=${exitCode}, contentLength=${content?.length || 0}`);

      // Note: exitCode can be undefined on success in some Modal SDK versions
      // Treat undefined or 0 as success, only fail if exitCode is a non-zero number
      if (exitCode !== undefined && exitCode !== 0) {
        const stderr = await proc.stderr.readText();
        console.error(`[Modal] cat stderr: ${stderr}`);
        return { success: false, error: stderr || `File not found: ${absPath}` };
      }

      return { success: true, content };
    })();

    const result = await Promise.race([readPromise, timeoutPromise]);
    console.log(`[Modal] Successfully read file ${filePath}, hasContent=${!!result.content}, length=${result.content?.length || 0}`);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Failed to read file ${filePath}:`, errorMsg);
    return { success: false, error: errorMsg };
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
    console.log(`[Modal] Listing files in ${directory} for session ${sessionId}`);
    const sandbox = await getOrCreateSandbox(sessionId);

    // Use ls -laL to get detailed file listing (L follows symlinks)
    // Also add trailing slash to directory to ensure we list contents, not the symlink itself
    const targetDir = directory.endsWith("/") ? directory : `${directory}/`;
    const proc = await exec(sandbox, ["ls", "-laL", targetDir]);
    const stdout = await proc.stdout.readText();
    const stderr = await proc.stderr.readText();
    const exitCode = await proc.exitCode;

    console.log(`[Modal] ls exitCode=${exitCode}, stdout=${stdout.length}b, stderr=${stderr.length}b`);
    console.log(`[Modal] ls raw output:\n${stdout}`);

    // Note: exitCode can be undefined on success in some Modal SDK versions
    // Treat undefined or 0 as success, only fail if exitCode is a non-zero number
    const commandFailed = exitCode !== undefined && exitCode !== 0;
    if (commandFailed || !stdout.trim()) {
      console.log(`[Modal] Directory ${directory} is empty or doesn't exist: ${stderr}`);
      return [];
    }

    const files: FileNode[] = [];
    const lines = stdout.trim().split("\n");

    for (const line of lines) {
      // Skip the "total" line at the start
      if (line.startsWith("total")) continue;

      // Parse ls -la output: permissions links owner group size month day time name
      // Example: -rw-r--r-- 1 root root 1234 Dec 5 12:00 filename.txt
      // Symlinks: lrwxrwxrwx 1 root root 38 Dec 5 12:00 name -> target
      const parts = line.trim().split(/\s+/);

      if (parts.length >= 9) {
        let name = parts.slice(8).join(" ");

        // Skip symlinks (they show as "name -> target")
        // The /workspace symlink to modal volume should be skipped
        if (parts[0].startsWith("l")) {
          // This is a symlink - skip it as we're inside the symlinked directory
          continue;
        }

        // Handle any remaining -> in filename (shouldn't happen, but just in case)
        if (name.includes(" -> ")) {
          name = name.split(" -> ")[0];
        }

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

    console.log(`[Modal] Found ${files.length} files in ${directory}:`, files.map(f => f.name));
    return files;
  } catch (error) {
    console.error(`[Modal] Failed to list files in ${directory}:`, error);
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
 * Delete a file or directory from the sandbox
 */
export async function deleteFile(
  sessionId: string,
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Modal] Deleting ${filePath} for session ${sessionId}`);
    const sandbox = await getOrCreateSandbox(sessionId);
    const absPath = filePath.startsWith("/") ? filePath : `/workspace/${filePath}`;

    // Use rm -rf to delete files or directories
    const proc = await sandbox["exec"](["rm", "-rf", absPath]);
    await proc.exitCode;

    console.log(`[Modal] Successfully deleted ${filePath}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Failed to delete ${filePath}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
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
      console.log(`[Modal] Terminated sandbox ${cached.sandboxId} for session ${sessionId}`);

      // Clear the volumeId from database
      try {
        await prisma.candidate.update({
          where: { id: sessionId },
          data: { volumeId: null },
        });
      } catch {
        // Non-critical
      }

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

/**
 * Create or get volume for a session (uses getOrCreateSandbox with lock)
 * IMPORTANT: Always goes through getOrCreateSandbox to prevent duplicate sandboxes
 */
export const createVolume = async (sessionId: string) => {
  // Use getOrCreateSandbox which has the Redis lock - this prevents race conditions
  await getOrCreateSandbox(sessionId);
  const cached = sandboxes.get(sessionId);
  return { id: cached?.sandboxId || sessionId };
};

export const listVolumes = async () => Array.from(sandboxes.keys()).map(id => ({ id }));
export const listActiveSandboxes = async (): Promise<SandboxInstance[]> =>
  Array.from(sandboxes.entries()).map(([sessionId, { sandboxId, createdAt }]) => ({
    id: sandboxId, sessionId, status: "ready" as const, createdAt, environment: {},
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
  writeFilesBatch,
  readFile,
  deleteFile,
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
