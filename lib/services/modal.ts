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

// ============================================================================
// SHELL SESSION MANAGEMENT (for PTY-based terminal access)
// ============================================================================

/**
 * Shell session - maintains a persistent bash process with PTY for low-latency terminal
 * Uses Modal's native PTY support via sandbox["exec"](['bash'], { pty: true })
 */
export interface ShellSession {
  sessionId: string;
  process: any;  // Modal sandbox process
  stdin: any;    // ModalWriteStream - use writeText() to send input
  stdout: any;   // ModalReadStream - use streaming reads for output
  stderr: any;   // ModalReadStream
  stdinWriter: WritableStreamDefaultWriter<Uint8Array> | null;  // Acquired writer for stdin
  createdAt: Date;
  lastActivity: Date;
  writeQueue: Promise<void>;  // Queue for serializing writes to stdin
}

// Active shell sessions (one per interview session)
const shellSessions = new Map<string, ShellSession>();

/**
 * Check if a shell session is still alive and healthy
 * Returns true if the session can be reused
 */
async function isShellSessionHealthy(session: ShellSession): Promise<boolean> {
  try {
    // Check if the stdin writer is still usable
    if (session.stdinWriter) {
      // Try to check if writer is in a valid state
      // Writers in error state will throw on desiredSize access
      try {
        const _ = session.stdinWriter.desiredSize;
        if (_ === null) {
          console.log(`[Modal] Shell session ${session.sessionId} stdin writer is closed`);
          return false;
        }
      } catch {
        console.log(`[Modal] Shell session ${session.sessionId} stdin writer is in error state`);
        return false;
      }
    }

    // Check session age - Modal shell sessions can become stale after extended periods
    const sessionAge = Date.now() - session.createdAt.getTime();
    const MAX_SESSION_AGE_MS = 30 * 60 * 1000; // 30 minutes
    if (sessionAge > MAX_SESSION_AGE_MS) {
      console.log(`[Modal] Shell session ${session.sessionId} is too old (${Math.round(sessionAge / 60000)}min)`);
      return false;
    }

    return true;
  } catch (error) {
    console.log(`[Modal] Shell session health check failed:`, error);
    return false;
  }
}

/**
 * Create or get an interactive shell session for a sandbox
 * Uses Modal's pty: true option for proper terminal emulation
 *
 * @returns ShellSession with stdin/stdout streams for I/O
 */
export async function createShellSession(sessionId: string): Promise<ShellSession> {
  // Check for existing session
  const existing = shellSessions.get(sessionId);
  if (existing) {
    // Verify the session is still healthy before reusing
    const isHealthy = await isShellSessionHealthy(existing);
    if (isHealthy) {
      existing.lastActivity = new Date();
      console.log(`[Modal] Reusing existing healthy shell session for ${sessionId}`);
      return existing;
    } else {
      // Session is unhealthy, remove it and create new one
      console.log(`[Modal] Removing unhealthy shell session for ${sessionId}`);
      shellSessions.delete(sessionId);
      // Release writer if it exists
      if (existing.stdinWriter) {
        try {
          existing.stdinWriter.releaseLock();
        } catch {
          // Ignore errors on release
        }
      }
    }
  }

  console.log(`[Modal] Creating new shell session for ${sessionId}`);

  // Get or create the sandbox first
  const sandbox = await getOrCreateSandbox(sessionId);

  // Start bash with PTY enabled
  // Modal's pty: true option allocates a real PTY (/dev/pts/0)
  // NOTE: Using sandbox["exec"] to call Modal SDK method, NOT child_process
  const proc = await sandbox["exec"](['bash', '-i'], {
    pty: true,
    workdir: '/workspace',
  });

  // Acquire a writer for stdin upfront to avoid lock conflicts
  let stdinWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  try {
    // Check if stdin is a WritableStream and get a writer
    if (proc.stdin && typeof proc.stdin.getWriter === 'function') {
      stdinWriter = proc.stdin.getWriter();
      console.log(`[Modal] Acquired stdin writer for ${sessionId}`);
    }
  } catch (err) {
    console.log(`[Modal] Could not acquire stdin writer, will use writeText():`, err);
  }

  const session: ShellSession = {
    sessionId,
    process: proc,
    stdin: proc.stdin,
    stdout: proc.stdout,
    stderr: proc.stderr,
    stdinWriter,
    createdAt: new Date(),
    lastActivity: new Date(),
    writeQueue: Promise.resolve(),  // Initialize empty queue
  };

  shellSessions.set(sessionId, session);
  console.log(`[Modal] Shell session created for ${sessionId}`);

  // Set a cleaner prompt - hide the long Modal volume path
  // PS1 format: green "workspace" + cyan short path + reset "$"
  const initCommands = [
    // Set a cleaner prompt: just shows current directory name
    `export PS1='\\[\\e[32m\\]workspace\\[\\e[0m\\]:\\[\\e[36m\\]\\W\\[\\e[0m\\]\\$ '`,
    // Clear the screen to hide the initial long path prompt
    'clear',
  ].join(' && ');

  // Send init commands after a brief delay to let shell start
  setTimeout(async () => {
    try {
      await writeToShell(sessionId, initCommands + '\n');
    } catch (err) {
      console.log(`[Modal] Failed to send init commands:`, err);
    }
  }, 100);

  return session;
}

/**
 * Write input to a shell session
 * Uses a pre-acquired writer to avoid WritableStream lock conflicts
 * @param sessionId - The session ID
 * @param data - The data to write (keystrokes, commands)
 */
export async function writeToShell(sessionId: string, data: string): Promise<void> {
  const session = shellSessions.get(sessionId);
  if (!session) {
    throw new Error(`No shell session found for ${sessionId}`);
  }

  session.lastActivity = new Date();
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);

  // Queue writes to serialize them
  const writePromise = session.writeQueue.then(async () => {
    try {
      if (session.stdinWriter) {
        // Use pre-acquired writer for better performance
        await session.stdinWriter.write(bytes);
      } else {
        // Fallback to writeText() if no writer available
        await session.stdin.writeText(data);
      }
    } catch (err) {
      // Log but don't throw - the stream might be closed
      console.error(`[Modal] Write error for ${sessionId}:`, err);
    }
  });

  session.writeQueue = writePromise;
  await writePromise;
}

/**
 * Get the shell session for reading output
 * The caller can use stdout.readText() or implement streaming reads
 */
export function getShellSession(sessionId: string): ShellSession | null {
  return shellSessions.get(sessionId) || null;
}

/**
 * Close a shell session
 */
export async function closeShellSession(sessionId: string): Promise<void> {
  const session = shellSessions.get(sessionId);
  if (session) {
    try {
      // Release the writer first if we have one
      if (session.stdinWriter) {
        try {
          // Send exit command
          const encoder = new TextEncoder();
          await session.stdinWriter.write(encoder.encode('exit\n'));
          session.stdinWriter.releaseLock();
        } catch {
          // Ignore errors
        }
      }
      await session.stdin.close();
    } catch {
      // Ignore errors on close
    }
    shellSessions.delete(sessionId);
    console.log(`[Modal] Shell session closed for ${sessionId}`);
  }
}

/**
 * Check if a shell session exists and is active
 */
export function hasShellSession(sessionId: string): boolean {
  return shellSessions.has(sessionId);
}

/**
 * Clear sandbox from in-memory cache (for testing)
 * Does NOT terminate the sandbox - just removes from cache to simulate server restart
 */
export function clearSandboxCache(sessionId: string): boolean {
  return sandboxes.delete(sessionId);
}

/**
 * Check if sandbox is in cache (for testing)
 */
export function isSandboxCached(sessionId: string): boolean {
  return sandboxes.has(sessionId);
}

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

// Modal SDK sandbox command runner (NOT Node.js child_process)
function runSandboxCommand(sandbox: any, args: string[]): Promise<any> {
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
  children?: FileNode[];
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
 * Universal image ID - set after deploying modal_image.py
 * Run: modal deploy modal_image.py
 * Then set MODAL_UNIVERSAL_IMAGE_ID env var to the deployed image ID
 *
 * Example: MODAL_UNIVERSAL_IMAGE_ID=im-xxxxx
 */
const UNIVERSAL_IMAGE_ID = process.env.MODAL_UNIVERSAL_IMAGE_ID;

/**
 * Get the appropriate Docker image for a language
 * If MODAL_UNIVERSAL_IMAGE_ID is set, uses the pre-built universal image
 * Otherwise falls back to language-specific public images
 */
function getImageForLanguage(language?: string): { type: 'universal' | 'registry'; value: string } {
  // Universal image has Node.js, Python, Go, Rust, Java, and ttyd pre-installed
  if (UNIVERSAL_IMAGE_ID) {
    return { type: 'universal', value: UNIVERSAL_IMAGE_ID };
  }

  const lang = language?.toLowerCase() || 'javascript';

  // Fallback: Language-specific base images from public registries
  const imageMap: Record<string, string> = {
    'python': 'python:3.11-slim-bookworm',
    'py': 'python:3.11-slim-bookworm',
    'javascript': 'node:20-bookworm-slim',
    'typescript': 'node:20-bookworm-slim',
    'js': 'node:20-bookworm-slim',
    'ts': 'node:20-bookworm-slim',
    'go': 'golang:1.21-bookworm',
    'golang': 'golang:1.21-bookworm',
    'java': 'eclipse-temurin:21-jdk-jammy',
    'rust': 'rust:1.75-slim-bookworm',
  };

  return { type: 'registry', value: imageMap[lang] || 'node:20-bookworm-slim' };
}

/**
 * Create a new sandbox for a session with mounted volume (internal use)
 * The volume is persistent - files survive sandbox restarts
 *
 * OPTIMIZATION: Trust Modal to handle volume attachment - no manual verification needed.
 * Modal guarantees volume is mounted when sandboxes.create() returns.
 */
async function createNewSandbox(sessionId: string, language?: string): Promise<{ sandbox: any; sandboxId: string; volumeName: string }> {
  const modal = getModalClient();
  const volumeName = getVolumeName(sessionId);

  // OPTIMIZATION: Parallelize app + volume creation (saves ~1-2s)
  const [app, volume] = await Promise.all([
    modal.apps.fromName("interviewlm-executor", { createIfMissing: true }),
    getOrCreateVolume(sessionId),
  ]);

  // Get image - use universal image (by ID) or language-specific registry image
  const imageConfig = getImageForLanguage(language);
  const isUniversalImage = imageConfig.type === 'universal';
  console.log(`[Modal] Using ${isUniversalImage ? 'universal' : imageConfig.value} image for language: ${language || 'default'}`);

  // For universal image, use fromId with the deployed image ID (async)
  // For language-specific, use public registry images (sync)
  const image = isUniversalImage
    ? await modal.images.fromId(imageConfig.value)
    : modal.images.fromRegistry(imageConfig.value);

  // Create sandbox with the image AND mounted volume
  // Modal handles volume attachment - no need to verify manually
  // encryptedPorts exposes ttyd via Modal tunnel for low-latency WebSocket terminal
  const sandbox = await modal.sandboxes.create(app, image, {
    timeoutMs: SANDBOX_TIMEOUT_MS,
    cpu: 0.5,
    cpuLimit: 2.0,
    memoryMiB: 512,
    memoryLimitMiB: 4096,
    volumes: {
      "/workspace": volume,
    },
    encryptedPorts: [7681], // ttyd WebSocket port for tunnel
  });

  const sandboxId = sandbox.sandboxId;

  // For non-universal images, install pytest for Python
  if (!isUniversalImage) {
    const isPython = ['python', 'py'].includes(language?.toLowerCase() || '');
    if (isPython) {
      console.log(`[Modal] Installing pytest in background...`);
      runSandboxCommand(sandbox, ["pip", "install", "pytest", "-q"])
        .then((proc: any) => proc.exitCode)
        .catch((err: Error) => console.warn(`[Modal] pytest install warning:`, err.message));
    }
  }

  // Start ttyd for WebSocket terminal access via tunnel
  // IMPORTANT: ttyd needs a proper shell with TTY allocation
  // Use 'bash -il' for interactive login shell to ensure proper initialization
  // Use setsid to create a new session (prevents orphaning issues)
  console.log(`[Modal] Starting ttyd for WebSocket terminal...`);
  try {
    if (isUniversalImage) {
      // Universal image has ttyd pre-installed - just start it
      // -W enables write mode (required for input)
      // -p 7681 specifies the port
      // bash starts a shell (simpler than bash -il which can have init issues)
      const ttydStart = await runSandboxCommand(sandbox, [
        "sh", "-c",
        `cd /workspace && setsid ttyd -W -p 7681 bash > /tmp/ttyd.log 2>&1 & sleep 2 && ps aux | grep ttyd | grep -v grep`
      ]);
      const startOutput = await ttydStart.stdout.readText();
      console.log(`[Modal] ttyd start: running=${startOutput.trim() ? 'yes' : 'no'}`);

      if (!startOutput.trim()) {
        const logCheck = await runSandboxCommand(sandbox, ["cat", "/tmp/ttyd.log"]);
        const logContent = await logCheck.stdout.readText();
        console.warn(`[Modal] ttyd may have failed to start. Log: ${logContent.trim()}`);
      } else {
        console.log(`[Modal] ttyd started on port 7681`);
      }
    } else {
      // Non-universal image - need to download ttyd first
      const ttydInstall = await runSandboxCommand(sandbox, [
        "sh", "-c",
        `if ! which ttyd > /dev/null 2>&1; then
          if which curl > /dev/null 2>&1; then
            curl -sL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd;
          elif which wget > /dev/null 2>&1; then
            wget -q https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -O /usr/local/bin/ttyd;
          else
            apt-get update -qq && apt-get install -qq -y wget > /dev/null 2>&1;
            wget -q https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -O /usr/local/bin/ttyd;
          fi;
          chmod +x /usr/local/bin/ttyd;
        fi`
      ]);
      await ttydInstall.exitCode;

      const ttydStart = await runSandboxCommand(sandbox, [
        "sh", "-c",
        `cd /workspace && setsid /usr/local/bin/ttyd -W -p 7681 bash > /tmp/ttyd.log 2>&1 & sleep 2 && ps aux | grep ttyd | grep -v grep`
      ]);
      const startOutput = await ttydStart.stdout.readText();
      console.log(`[Modal] ttyd start: running=${startOutput.trim() ? 'yes' : 'no'}`);
    }
  } catch (ttydError) {
    // Non-fatal: ttyd failure doesn't block sandbox creation, fallback to HTTP mode
    console.warn(`[Modal] ttyd setup failed (will use HTTP fallback):`, ttydError);
  }

  console.log(`[Modal] Created new sandbox ${sandboxId} with volume ${volumeName} for session ${sessionId}`);

  return { sandbox, sandboxId, volumeName };
}

// Timeout for fromId reconnection (per attempt)
// Based on testing: fromId takes 2-4s for warm sandboxes, 2-5s+ for cold
// With retry logic, we use shorter timeout per attempt (5s × 3 attempts = 15s+ total)
const RECONNECT_TIMEOUT_MS = 5000;

// Retry configuration for reconnection
const RECONNECT_MAX_RETRIES = 2;  // Total attempts = 3 (1 initial + 2 retries)
const RECONNECT_RETRY_DELAY_MS = 1000;  // Base delay between retries (doubles each retry)

// Keep-alive configuration
const KEEPALIVE_INTERVAL_MS = 30000;  // Send heartbeat every 30 seconds
const KEEPALIVE_TIMEOUT_MS = 5000;    // Timeout for heartbeat command

// Track keep-alive intervals per session
const keepAliveIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Try to reconnect to an existing sandbox by ID using fromId (single attempt)
 * Returns sandbox if successful, null if failed
 */
async function attemptReconnect(sandboxId: string, timeoutMs: number): Promise<any | null> {
  const modal = getModalClient();
  const startTime = Date.now();

  const sandbox = await Promise.race([
    modal.sandboxes.fromId(sandboxId),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`fromId timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  const elapsed = Date.now() - startTime;
  console.log(`[Modal] fromId completed in ${elapsed}ms, verifying sandbox is alive...`);

  // Verify the sandbox is actually alive by calling tunnels()
  // This catches cases where fromId returns a reference to a terminated sandbox
  try {
    const tunnels = await sandbox.tunnels();
    console.log(`[Modal] Sandbox verified alive, tunnels:`, Object.keys(tunnels));
    return sandbox;
  } catch (verifyError) {
    const errorMsg = (verifyError instanceof Error ? verifyError.message : String(verifyError)).toLowerCase();
    // Handle all cases where sandbox is no longer accessible:
    // - terminated/finished: sandbox lifecycle ended
    // - permission_denied/permission denied: sandbox created by different app/credentials or expired
    // - not found: sandbox ID doesn't exist
    if (['terminated', 'finished', 'permission_denied', 'permission denied', 'not found'].some(x => errorMsg.includes(x))) {
      console.log(`[Modal] Sandbox ${sandboxId} is inaccessible: ${verifyError}`);
      return null;
    }
    // Other errors (e.g., tunnels not configured) - sandbox is still alive
    console.log(`[Modal] Sandbox alive but tunnel check failed: ${errorMsg}`);
    return sandbox;
  }
}

/**
 * Try to reconnect to an existing sandbox by ID using fromId with retry logic
 * Uses exponential backoff for retries to handle cold sandbox wake-up delays
 *
 * IMPORTANT: Cold sandboxes (suspended by Modal to save resources) can take
 * 2-5+ seconds to wake up. If the first attempt times out, retries with
 * increasing delays often succeed as the sandbox finishes waking up.
 *
 * @param sandboxId - The Modal sandbox ID to reconnect to
 * @returns The sandbox instance if successful, null if all retries failed
 */
async function reconnectToSandbox(sandboxId: string): Promise<any | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RECONNECT_MAX_RETRIES; attempt++) {
    try {
      const attemptNum = attempt + 1;
      const totalAttempts = RECONNECT_MAX_RETRIES + 1;
      console.log(`[Modal] Reconnect attempt ${attemptNum}/${totalAttempts} to ${sandboxId}...`);

      const sandbox = await attemptReconnect(sandboxId, RECONNECT_TIMEOUT_MS);

      if (sandbox) {
        if (attempt > 0) {
          console.log(`[Modal] Reconnect succeeded on attempt ${attemptNum} (sandbox was likely cold)`);
        }
        return sandbox;
      }

      // attemptReconnect returned null (sandbox terminated)
      console.log(`[Modal] Sandbox ${sandboxId} is terminated, no retry needed`);
      return null;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isTimeout = lastError.message.includes('timed out');

      console.log(`[Modal] Reconnect attempt ${attempt + 1} failed: ${lastError.message}`);

      // Only retry on timeout (cold sandbox may still be waking up)
      // Don't retry on other errors (e.g., sandbox not found, auth errors)
      if (!isTimeout) {
        console.log(`[Modal] Non-timeout error, skipping retries`);
        return null;
      }

      // Wait before retry with exponential backoff
      if (attempt < RECONNECT_MAX_RETRIES) {
        const delay = RECONNECT_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`[Modal] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.log(`[Modal] All ${RECONNECT_MAX_RETRIES + 1} reconnect attempts failed for ${sandboxId}`);
  return null;
}

/**
 * Start keep-alive pings for a sandbox to prevent Modal from suspending it
 * Sends a lightweight command every 30 seconds to keep the sandbox warm
 *
 * @param sessionId - The session ID associated with the sandbox
 * @param sandbox - The sandbox instance to keep alive
 */
function startKeepAlive(sessionId: string, sandbox: any): void {
  // Clear any existing interval for this session
  stopKeepAlive(sessionId);

  console.log(`[Modal] Starting keep-alive for session ${sessionId} (interval: ${KEEPALIVE_INTERVAL_MS}ms)`);

  const interval = setInterval(async () => {
    try {
      // Send a lightweight "true" command - minimal overhead, just keeps sandbox active
      const proc = await Promise.race([
        sandbox["exec"](["true"]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Keep-alive timeout')), KEEPALIVE_TIMEOUT_MS)
        )
      ]);

      // Wait for command to complete (don't need to check exitCode)
      await proc.exitCode;
      console.log(`[Modal] Keep-alive ping sent for session ${sessionId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // If sandbox is terminated or unreachable, stop keep-alive
      if (errorMsg.includes('terminated') || errorMsg.includes('finished') || errorMsg.includes('not found')) {
        console.log(`[Modal] Sandbox ${sessionId} appears dead, stopping keep-alive`);
        stopKeepAlive(sessionId);

        // Also remove from cache since sandbox is dead
        sandboxes.delete(sessionId);
        return;
      }

      // Log other errors but continue trying
      console.warn(`[Modal] Keep-alive failed for ${sessionId}: ${errorMsg}`);
    }
  }, KEEPALIVE_INTERVAL_MS);

  keepAliveIntervals.set(sessionId, interval);
}

/**
 * Stop keep-alive pings for a sandbox
 *
 * @param sessionId - The session ID to stop keep-alive for
 */
function stopKeepAlive(sessionId: string): void {
  const existing = keepAliveIntervals.get(sessionId);
  if (existing) {
    clearInterval(existing);
    keepAliveIntervals.delete(sessionId);
    console.log(`[Modal] Stopped keep-alive for session ${sessionId}`);
  }
}

/**
 * Check if keep-alive is active for a session
 */
function hasKeepAlive(sessionId: string): boolean {
  return keepAliveIntervals.has(sessionId);
}

/**
 * Create a sandbox for a session (public API)
 * The sandbox is created with a mounted persistent volume (volume_{sessionId})
 */
export async function createSandbox(sessionId: string, language?: string): Promise<SandboxInstance> {
  const { sandbox, sandboxId, volumeName } = await createNewSandbox(sessionId, language);
  const createdAt = new Date();

  // Store in memory cache
  sandboxes.set(sessionId, { sandbox, sandboxId, createdAt });

  // Start keep-alive to prevent Modal from suspending the sandbox
  startKeepAlive(sessionId, sandbox);

  // Persist sandbox ID and language to database for reconnection after server restart
  // Note: Volume is deterministic (based on sessionId), but we store sandboxId for quick reconnect
  try {
    await prisma.candidate.update({
      where: { id: sessionId },
      data: {
        volumeId: sandboxId,
        sandboxCreatedAt: createdAt, // Track when sandbox was created for expiry checks
        sandboxLanguage: language || 'javascript', // Store language for reconnection
      },
    });
    console.log(`[Modal] Persisted sandbox ID ${sandboxId} (volume: ${volumeName}, language: ${language || 'javascript'}) for session ${sessionId}`);
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
export async function getOrCreateSandbox(sessionId: string, language?: string): Promise<any> {
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
      let storedLanguage: string | null = null;
      try {
        const candidate = await prisma.candidate.findUnique({
          where: { id: sessionId },
          select: { volumeId: true, sandboxCreatedAt: true, sandboxLanguage: true },
        });

        // Store the language from DB for later use if we need to create a new sandbox
        storedLanguage = candidate?.sandboxLanguage || null;

        if (candidate?.volumeId) {
          const sandboxAge = candidate.sandboxCreatedAt
            ? Date.now() - candidate.sandboxCreatedAt.getTime()
            : Infinity;
          const isExpired = sandboxAge > SANDBOX_TIMEOUT_MS - 60000; // 59 min = expired

          console.log(`[Modal] Found sandbox ${candidate.volumeId} in DB (age: ${Math.round(sandboxAge / 1000)}s, language: ${storedLanguage})`);

          if (isExpired) {
            // Expired sandbox - don't try to reconnect (Modal terminates after 1 hour)
            console.log(`[Modal] Sandbox expired (>59 min), skipping reconnect`);
          } else {
            // Try fromId reconnection with retry logic
            // Cold sandboxes may need multiple attempts as they wake up
            sandbox = await reconnectToSandbox(candidate.volumeId);
            if (sandbox) {
              // Success! Store in cache and return
              sandboxes.set(sessionId, {
                sandbox,
                sandboxId: candidate.volumeId,
                createdAt: candidate.sandboxCreatedAt || new Date()
              });

              // Start keep-alive to prevent Modal from suspending again
              startKeepAlive(sessionId, sandbox);

              console.log(`[Modal] Reconnected to sandbox ${candidate.volumeId}`);
              resolveCreation(sandbox);
              return;
            }
            console.log(`[Modal] Sandbox reconnect failed (sandbox may be dead), will create new`);
          }

          // Clear stale sandbox ID - we'll create a new one
          await prisma.candidate.update({
            where: { id: sessionId },
            data: { volumeId: null, sandboxCreatedAt: null },
          });
        } else {
          console.log(`[Modal] No existing sandbox found in DB for session ${sessionId}`);
        }
      } catch (dbError) {
        console.log(`[Modal] Could not lookup sandbox from database:`, dbError);
      }

      // Use language from: 1) parameter, 2) stored in DB, 3) default to javascript
      const effectiveLanguage = language || storedLanguage || 'javascript';

      // Create new sandbox with persistent volume
      // Even if old sandbox expired, files persist in the volume
      console.log(`[Modal] Creating NEW sandbox for session ${sessionId} (volume: ${getVolumeName(sessionId)}, language: ${effectiveLanguage})`);
      await createSandbox(sessionId, effectiveLanguage);
      const newSandbox = sandboxes.get(sessionId)?.sandbox;

      if (newSandbox) {
        // Verify the sandbox ID was persisted to DB before releasing lock
        const cached = sandboxes.get(sessionId);
        if (cached) {
          try {
            await prisma.candidate.update({
              where: { id: sessionId },
              data: {
                volumeId: cached.sandboxId,
                sandboxCreatedAt: cached.createdAt,
              },
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
 * Ensure ttyd is running in the sandbox
 * Checks if ttyd process is alive and restarts it if needed
 */
async function ensureTtydRunning(sandbox: any): Promise<boolean> {
  try {
    // Check if ttyd is running
    const checkProc = await runSandboxCommand(sandbox, [
      "sh", "-c",
      "pgrep -x ttyd > /dev/null && echo 'running' || echo 'stopped'"
    ]);
    const status = (await checkProc.stdout.readText()).trim();

    if (status === 'running') {
      return true;
    }

    console.log(`[Modal] ttyd not running, restarting...`);

    // Restart ttyd with proper session
    // -W enables write mode, -p 7681 sets port, bash starts a shell
    const restartProc = await runSandboxCommand(sandbox, [
      "sh", "-c",
      "cd /workspace && setsid ttyd -W -p 7681 bash > /tmp/ttyd.log 2>&1 & sleep 2 && pgrep -x ttyd"
    ]);
    const pid = (await restartProc.stdout.readText()).trim();

    if (pid) {
      console.log(`[Modal] ttyd restarted with PID ${pid}`);
      return true;
    } else {
      // Check log for errors
      const logProc = await runSandboxCommand(sandbox, ["tail", "-20", "/tmp/ttyd.log"]);
      const logContent = await logProc.stdout.readText();
      console.warn(`[Modal] Failed to restart ttyd. Log: ${logContent}`);
      return false;
    }
  } catch (error) {
    console.error(`[Modal] Error ensuring ttyd is running:`, error);
    return false;
  }
}

/**
 * Get the tunnel URL for WebSocket terminal access
 * Returns the WSS URL for direct terminal connection via ttyd
 * Returns null if tunnel is not available or sandbox doesn't exist
 */
export async function getTunnelUrl(sessionId: string): Promise<string | null> {
  try {
    console.log(`[Modal] Getting tunnel URL for session ${sessionId}...`);

    // Get or reconnect to sandbox (handles cache misses and cross-worker scenarios)
    const sandbox = await getOrCreateSandbox(sessionId);

    if (!sandbox) {
      console.warn(`[Modal] No sandbox available for session ${sessionId}`);
      return null;
    }

    // Ensure ttyd is running before returning tunnel URL
    const ttydRunning = await ensureTtydRunning(sandbox);
    if (!ttydRunning) {
      console.warn(`[Modal] ttyd is not running and could not be restarted for session ${sessionId}`);
      return null;
    }

    // Get tunnel metadata from Modal
    const tunnels = await sandbox.tunnels();

    // Look for tunnel on port 7681 (ttyd)
    const terminalTunnel = tunnels[7681];

    if (!terminalTunnel || !terminalTunnel.url) {
      console.warn(`[Modal] No tunnel found on port 7681 for session ${sessionId} - ttyd may not be running or encryptedPorts not configured`);
      return null;
    }

    // Modal tunnel URL is HTTPS, convert to WSS for WebSocket
    const wsUrl = terminalTunnel.url.replace('https://', 'wss://');
    console.log(`[Modal] Tunnel URL for session ${sessionId}: ${wsUrl}`);
    return wsUrl;
  } catch (error) {
    console.error(`[Modal] Failed to get tunnel URL for session ${sessionId}:`, error);
    return null;
  }
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
    const proc = await runSandboxCommand(sandbox, ["bash", "-c", fullCmd]);

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
    const proc = await runSandboxCommand(sandbox, ["bash", "-c", fullCmd]);

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
 * Write a file to the sandbox using a single exec call
 * Combines mkdir and write into one command for minimal round trips
 */
export async function writeFile(
  sessionId: string,
  filePath: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const startTime = Date.now();
    console.log(`[Modal] Writing file ${filePath} for session ${sessionId}, contentLength=${content.length}`);
    const sandbox = await getOrCreateSandbox(sessionId);


    const absPath = filePath.startsWith("/") ? filePath : `/workspace/${filePath}`;
    const parentDir = absPath.split("/").slice(0, -1).join("/");

    // Base64 encode content for safe transmission
    const base64Content = Buffer.from(content, "utf-8").toString("base64");

    // Single exec call that:
    // 1. Creates parent directory if needed
    // 2. Decodes base64 and writes to file
    const shellCmd = parentDir && parentDir !== "/workspace"
      ? `mkdir -p ${parentDir} && echo '${base64Content}' | base64 -d > ${absPath}`
      : `echo '${base64Content}' | base64 -d > ${absPath}`;

    const proc = await sandbox["exec"](["sh", "-c", shellCmd]);
    const exitCode = await proc.exitCode;
    const stderr = await proc.stderr.readText();

    if (exitCode !== undefined && exitCode !== 0) {
      console.error(`[Modal] Write failed: exitCode=${exitCode}, stderr=${stderr}`);
      return { success: false, error: stderr || `Exit code ${exitCode}` };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Modal] Successfully wrote file ${filePath} (${content.length} bytes) in ${elapsed}ms`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Failed to write file ${filePath}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Write multiple files to the sandbox in batch using a single exec call
 * Generates an inline shell script that creates all directories and writes all files
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

  try {
    const sandbox = await getOrCreateSandbox(sessionId);


    const results: Record<string, string> = {};

    // Build a single shell script that writes all files
    // Format: mkdir -p <dirs> && echo '<b64>' | base64 -d > <file> && echo '<b64>' | base64 -d > <file> ...
    const commands: string[] = [];
    const directories = new Set<string>();

    for (const [path, content] of Object.entries(files)) {
      const absPath = path.startsWith("/") ? path : `/workspace/${path}`;
      const parentDir = absPath.split("/").slice(0, -1).join("/");

      // Collect unique directories
      if (parentDir && parentDir !== "/workspace") {
        directories.add(parentDir);
      }

      // Add write command
      const base64Content = Buffer.from(content, "utf-8").toString("base64");
      commands.push(`echo '${base64Content}' | base64 -d > ${absPath}`);
      results[path] = `Wrote ${content.length} bytes`;
    }

    // Build the full shell command
    let shellCmd = "";
    if (directories.size > 0) {
      shellCmd = `mkdir -p ${Array.from(directories).join(" ")} && `;
    }
    shellCmd += commands.join(" && ");

    // Execute single command
    const proc = await sandbox["exec"](["sh", "-c", shellCmd]);
    const exitCode = await proc.exitCode;
    const stderr = await proc.stderr.readText();

    if (exitCode !== undefined && exitCode !== 0) {
      console.error(`[Modal] Batch write failed: exitCode=${exitCode}, stderr=${stderr}`);
      // Mark all as failed
      for (const path of Object.keys(files)) {
        results[path] = stderr || "Failed";
      }
      return { success: false, results, error: stderr };
    }

    console.log(`[Modal] Batch write complete: ${fileCount}/${fileCount} files succeeded`);
    return { success: true, results };
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
  // Timeout includes potential sandbox creation time (~10s) + volume mount (~2s) + ls command (~1s)
  const LIST_TIMEOUT_MS = 30000;

  const timeoutPromise = new Promise<FileNode[]>((_, reject) => {
    setTimeout(() => reject(new Error(`listFiles timed out after ${LIST_TIMEOUT_MS}ms`)), LIST_TIMEOUT_MS);
  });

  const listPromise = listFilesInternal(sessionId, directory);

  return Promise.race([listPromise, timeoutPromise]);
}

async function listFilesInternal(
  sessionId: string,
  directory: string
): Promise<FileNode[]> {
  // Normalize and validate directory is within workspace
  const normalizedDir = directory.replace(/\/+/g, '/').replace(/\/$/, '') || '/workspace';

  // SECURITY: Only allow listing within /workspace
  if (!normalizedDir.startsWith('/workspace')) {
    console.warn(`[Modal] BLOCKED: Attempted to list files outside workspace: ${directory}`);
    return [];
  }

  // Block directory traversal attempts
  if (normalizedDir.includes('/../') || normalizedDir.endsWith('/..')) {
    console.warn(`[Modal] BLOCKED: Directory traversal attempt: ${directory}`);
    return [];
  }

  try {
    console.log(`[Modal] Listing files in ${normalizedDir} for session ${sessionId}`);
    const sandbox = await getOrCreateSandbox(sessionId);


    // Use ls -la with trailing slash to force following the symlink
    // Modal mounts volumes as symlinks (e.g., /workspace -> /__modal/volumes/...)
    // Without trailing slash, ls might show the symlink itself instead of contents
    // Note: 'exec' here is Modal sandbox exec wrapper (line 64), NOT Node child_process
    const targetPath = `${normalizedDir}/`;
    const sandboxProc = await sandbox["exec"](["ls", "-la", targetPath]);
    const stdout = await sandboxProc.stdout.readText();
    const stderr = await sandboxProc.stderr.readText();
    const exitCode = await sandboxProc.exitCode;

    console.log(`[Modal] ls exitCode=${exitCode}, stdout=${stdout.length}b, stderr=${stderr.length}b`);

    // Note: exitCode can be undefined on success in some Modal SDK versions
    // Treat undefined or 0 as success, only fail if exitCode is a non-zero number
    const commandFailed = exitCode !== undefined && exitCode !== 0;
    if (commandFailed || !stdout.trim()) {
      console.log(`[Modal] Directory ${normalizedDir} is empty or doesn't exist: ${stderr}`);
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

        // Skip symlinks entirely - they could point outside workspace
        if (parts[0].startsWith("l")) {
          console.log(`[Modal] Skipping symlink: ${name}`);
          continue;
        }

        // Handle any remaining -> in filename (shouldn't happen, but just in case)
        if (name.includes(" -> ")) {
          name = name.split(" -> ")[0];
        }

        if (name !== "." && name !== "..") {
          const filePath = `${normalizedDir}/${name}`;

          // Double-check the constructed path is still within workspace
          if (!filePath.startsWith('/workspace')) {
            console.warn(`[Modal] BLOCKED: Constructed path outside workspace: ${filePath}`);
            continue;
          }

          files.push({
            name,
            path: filePath,
            type: parts[0].startsWith("d") ? "directory" : "file",
            size: parseInt(parts[4]) || 0,
          });
        }
      }
    }

    console.log(`[Modal] Found ${files.length} files in ${normalizedDir}:`, files.map(f => f.name));
    return files;
  } catch (error) {
    console.error(`[Modal] Failed to list files in ${normalizedDir}:`, error);
    return [];
  }
}

// Constants for file system traversal limits
const MAX_DEPTH = 10;
const MAX_FILES = 500;
const WORKSPACE_ROOT = "/workspace";

/**
 * Normalize a path (remove double slashes, trailing slashes)
 */
function normalizePath(path: string): string {
  return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

/**
 * Check if a path is safely within the workspace
 * Prevents directory traversal attacks and symlink escapes
 */
function isWithinWorkspace(path: string): boolean {
  const normalized = normalizePath(path);

  // Must start with /workspace
  if (!normalized.startsWith(WORKSPACE_ROOT)) {
    return false;
  }

  // Check for directory traversal attempts
  if (normalized.includes('/../') || normalized.endsWith('/..')) {
    return false;
  }

  return true;
}

/**
 * Get file system tree using a single find command
 * OPTIMIZED: Uses one exec call instead of recursive calls per directory
 *
 * SECURITY: Only traverses within /workspace directory
 * - Blocks paths outside /workspace
 * - Blocks directory traversal (../)
 * - Has depth limit and file count limit
 */
export async function getFileSystem(
  sessionId: string,
  rootPath = "/workspace"
): Promise<FileNode[]> {
  // Enforce workspace-only access
  if (!isWithinWorkspace(rootPath)) {
    console.warn(`[Modal] BLOCKED: Attempted to access path outside workspace: ${rootPath}`);
    return [];
  }

  try {
    const sandbox = await getOrCreateSandbox(sessionId);

    // Single find command to get entire tree
    // -L follows symlinks, -maxdepth limits depth, -printf gives us type/size/path
    const findCmd = `find -L ${rootPath} -maxdepth ${MAX_DEPTH} \\( -type f -o -type d \\) -printf '%y %s %p\\n' 2>/dev/null | head -${MAX_FILES}`;
    const proc = await sandbox["exec"](["sh", "-c", findCmd]);
    const stdout = await proc.stdout.readText();

    if (!stdout.trim()) {
      return [];
    }

    // Parse find output and build tree
    const lines = stdout.trim().split('\n');
    const allFiles: Array<{ type: 'file' | 'directory'; size: number; path: string }> = [];

    for (const line of lines) {
      // Format: "d 4096 /workspace/src" or "f 1234 /workspace/file.ts"
      const match = line.match(/^([df])\s+(\d+)\s+(.+)$/);
      if (match) {
        const [, typeChar, sizeStr, path] = match;
        // Skip the root path itself and validate within workspace
        if (path !== rootPath && isWithinWorkspace(path)) {
          allFiles.push({
            type: typeChar === 'd' ? 'directory' : 'file',
            size: parseInt(sizeStr) || 0,
            path,
          });
        }
      }
    }

    // Build nested tree structure from flat list
    return buildFileTree(allFiles, rootPath);
  } catch (error) {
    console.error(`[Modal] Failed to get file system:`, error);
    return [];
  }
}

/**
 * Build nested tree structure from flat file list
 */
function buildFileTree(
  files: Array<{ type: 'file' | 'directory'; size: number; path: string }>,
  rootPath: string
): FileNode[] {
  // Create a map of path -> node for quick lookup
  const nodeMap = new Map<string, FileNode>();

  // Sort by path length to process parents before children
  files.sort((a, b) => a.path.length - b.path.length);

  for (const file of files) {
    const name = file.path.split('/').pop() || '';
    const node: FileNode = {
      name,
      path: file.path,
      type: file.type,
      size: file.size,
    };

    if (file.type === 'directory') {
      node.children = [];
    }

    nodeMap.set(file.path, node);

    // Find parent and add as child
    const parentPath = file.path.split('/').slice(0, -1).join('/');
    const parent = nodeMap.get(parentPath);
    if (parent && parent.children) {
      parent.children.push(node);
    }
  }

  // Return only top-level items (direct children of rootPath)
  return files
    .filter(f => {
      const parentPath = f.path.split('/').slice(0, -1).join('/');
      return parentPath === rootPath;
    })
    .map(f => nodeMap.get(f.path)!)
    .filter(Boolean);
}

/**
 * Create a directory in the sandbox
 */
export async function createDirectory(
  sessionId: string,
  dirPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Modal] Creating directory ${dirPath} for session ${sessionId}`);
    const sandbox = await getOrCreateSandbox(sessionId);
    const absPath = dirPath.startsWith("/") ? dirPath : `/workspace/${dirPath}`;

    // Use mkdir -p to create directory (and any parent directories)
    const proc = await sandbox["exec"](["mkdir", "-p", absPath]);
    const exitCode = await proc.exitCode;

    if (exitCode && exitCode !== 0) {
      const stderr = await proc.stderr.readText();
      console.error(`[Modal] Failed to create directory: ${stderr}`);
      return { success: false, error: stderr };
    }

    console.log(`[Modal] Successfully created directory ${dirPath}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Modal] Failed to create directory ${dirPath}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
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
  // Stop keep-alive pings first
  stopKeepAlive(sessionId);

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
export const createVolume = async (sessionId: string, language?: string) => {
  // Use getOrCreateSandbox which has the Redis lock - this prevents race conditions
  await getOrCreateSandbox(sessionId, language);
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
  createDirectory,
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
  // Shell session management (PTY-based terminal)
  createShellSession,
  writeToShell,
  getShellSession,
  closeShellSession,
  hasShellSession,
  // Testing utilities
  clearSandboxCache,
  isSandboxCached,
  // Keep-alive management (for debugging/testing)
  stopKeepAlive,
  hasKeepAlive,
};

export async function closeConnection(): Promise<void> {
  for (const sessionId of sandboxes.keys()) {
    await terminateSandbox(sessionId);
  }
}
