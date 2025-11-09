/**
 * Session Recording Service
 *
 * Manages interview session recordings, including real-time event capture,
 * Claude interactions, code snapshots, and test results.
 * Integrates with Prisma for database persistence and S3 for long-term storage.
 */

import prisma from "@/lib/prisma";
import { z } from "zod";
import * as diff from "diff";
import * as crypto from "crypto";
import {
  uploadSessionRecording,
  uploadCodeSnapshots,
} from "./s3";
import type {
  SessionRecording,
  SessionEvent,
  ClaudeInteraction,
  CodeSnapshot,
  TestResult,
  SessionStatus,
} from "@prisma/client";

// Validation schemas
const sessionEventDataSchema = z.object({
  type: z.string(),
  fileId: z.string().optional(),
  data: z.any(),
  checkpoint: z.boolean().optional(),
});

const claudeMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  model: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  latency: z.number().optional(),
  stopReason: z.string().optional(),
});

const codeSnapshotSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  language: z.string(),
  content: z.string(),
});

const testResultSchema = z.object({
  testName: z.string(),
  passed: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  duration: z.number().optional(),
});

type SessionEventData = z.infer<typeof sessionEventDataSchema>;
type ClaudeMessage = z.infer<typeof claudeMessageSchema>;
type CodeSnapshotData = z.infer<typeof codeSnapshotSchema>;
type TestResultData = z.infer<typeof testResultSchema>;

// In-memory buffer for batching events (optimization)
const eventBuffers = new Map<string, SessionEventData[]>();
const BUFFER_FLUSH_INTERVAL = 10000; // Flush every 10 seconds
const BUFFER_MAX_SIZE = 100; // Flush after 100 events

/**
 * Create a new session recording
 *
 * @param candidateId - Candidate identifier
 * @returns Created session recording
 *
 * @example
 * ```typescript
 * const session = await createSession("cand_abc123");
 * console.log("Session started:", session.id);
 * ```
 */
export async function createSession(candidateId: string): Promise<SessionRecording> {
  try {
    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    // Create session recording
    const session = await prisma.sessionRecording.create({
      data: {
        candidateId,
        status: "ACTIVE",
        startTime: new Date(),
      },
    });

    // Initialize event buffer
    eventBuffers.set(session.id, []);

    // Start periodic flush
    startPeriodicFlush(session.id);

    console.log(`Session ${session.id} created for candidate ${candidateId}`);

    return session;

  } catch (error) {
    console.error("Error creating session:", error);
    throw new Error(
      `Session creation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record a session event
 *
 * @param sessionId - Session identifier
 * @param event - Event data
 * @returns Created session event
 *
 * @example
 * ```typescript
 * await recordEvent(sessionId, {
 *   type: "keystroke",
 *   fileId: "file_1",
 *   data: { key: "a", timestamp: Date.now() }
 * });
 * ```
 */
export async function recordEvent(
  sessionId: string,
  event: SessionEventData
): Promise<SessionEvent> {
  try {
    // Validate event data
    sessionEventDataSchema.parse(event);

    // Add to buffer for batch insert
    const buffer = eventBuffers.get(sessionId) || [];
    buffer.push(event);
    eventBuffers.set(sessionId, buffer);

    // Flush if buffer is full
    if (buffer.length >= BUFFER_MAX_SIZE) {
      await flushEventBuffer(sessionId);
    }

    // Create event in database
    const sessionEvent = await prisma.sessionEvent.create({
      data: {
        sessionId,
        type: event.type,
        fileId: event.fileId,
        data: event.data,
        checkpoint: event.checkpoint || false,
        timestamp: new Date(),
      },
    });

    // Update event count
    await prisma.sessionRecording.update({
      where: { id: sessionId },
      data: {
        eventCount: { increment: 1 },
      },
    });

    return sessionEvent;

  } catch (error) {
    console.error("Error recording event:", error);
    throw new Error(
      `Event recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record a Claude AI interaction
 *
 * @param sessionId - Session identifier
 * @param message - Claude message data
 * @param metadata - Additional metadata
 * @returns Created Claude interaction record
 *
 * @example
 * ```typescript
 * await recordClaudeInteraction(sessionId, {
 *   role: "assistant",
 *   content: "Here's how to solve the problem...",
 *   model: "claude-sonnet-4-5-20250929",
 *   inputTokens: 150,
 *   outputTokens: 300,
 *   latency: 1200
 * });
 * ```
 */
export async function recordClaudeInteraction(
  sessionId: string,
  message: ClaudeMessage,
  metadata?: { promptQuality?: number }
): Promise<ClaudeInteraction> {
  try {
    // Validate message
    claudeMessageSchema.parse(message);

    const interaction = await prisma.claudeInteraction.create({
      data: {
        sessionId,
        role: message.role,
        content: message.content,
        model: message.model,
        inputTokens: message.inputTokens,
        outputTokens: message.outputTokens,
        latency: message.latency,
        stopReason: message.stopReason,
        promptQuality: metadata?.promptQuality,
        timestamp: new Date(),
      },
    });

    // Also record as session event for replay
    await recordEvent(sessionId, {
      type: "claude_interaction",
      data: {
        role: message.role,
        content: message.content,
        model: message.model,
      },
    });

    return interaction;

  } catch (error) {
    console.error("Error recording Claude interaction:", error);
    throw new Error(
      `Claude interaction recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record a code snapshot with diff from previous version
 *
 * @param sessionId - Session identifier
 * @param fileId - File identifier
 * @param content - Current file content
 * @param previousContent - Previous file content for diff
 * @returns Created code snapshot
 *
 * @example
 * ```typescript
 * await recordCodeSnapshot(
 *   sessionId,
 *   "file_1",
 *   "function add(a, b) { return a + b; }",
 *   "function add(a, b) { return a+b; }"
 * );
 * ```
 */
export async function recordCodeSnapshot(
  sessionId: string,
  snapshot: CodeSnapshotData,
  previousContent?: string
): Promise<CodeSnapshot> {
  try {
    // Validate snapshot
    codeSnapshotSchema.parse(snapshot);

    // Calculate content hash
    const contentHash = crypto
      .createHash("sha256")
      .update(snapshot.content)
      .digest("hex");

    // Calculate diff if previous content exists
    let diffFromPrevious = null;
    let linesAdded = 0;
    let linesDeleted = 0;

    if (previousContent) {
      const changes = diff.diffLines(previousContent, snapshot.content);
      diffFromPrevious = changes;

      // Count added/deleted lines
      changes.forEach((change) => {
        if (change.added) {
          linesAdded += change.count || 0;
        } else if (change.removed) {
          linesDeleted += change.count || 0;
        }
      });
    }

    const codeSnapshot = await prisma.codeSnapshot.create({
      data: {
        sessionId,
        fileId: snapshot.fileId,
        fileName: snapshot.fileName,
        language: snapshot.language,
        contentHash,
        fullContent: snapshot.content,
        diffFromPrevious: diffFromPrevious as any,
        linesAdded,
        linesDeleted,
        timestamp: new Date(),
      },
    });

    // Record as checkpoint event for fast seeking
    await recordEvent(sessionId, {
      type: "code_snapshot",
      fileId: snapshot.fileId,
      data: {
        fileName: snapshot.fileName,
        contentHash,
        linesAdded,
        linesDeleted,
      },
      checkpoint: true,
    });

    return codeSnapshot;

  } catch (error) {
    console.error("Error recording code snapshot:", error);
    throw new Error(
      `Code snapshot recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record test execution result
 *
 * @param sessionId - Session identifier
 * @param testResult - Test result data
 * @returns Created test result record
 *
 * @example
 * ```typescript
 * await recordTestResult(sessionId, {
 *   testName: "test_add_positive_numbers",
 *   passed: true,
 *   duration: 15
 * });
 * ```
 */
export async function recordTestResult(
  sessionId: string,
  testResult: TestResultData
): Promise<TestResult> {
  try {
    // Validate test result
    testResultSchema.parse(testResult);

    const result = await prisma.testResult.create({
      data: {
        sessionId,
        testName: testResult.testName,
        passed: testResult.passed,
        output: testResult.output,
        error: testResult.error,
        duration: testResult.duration,
        timestamp: new Date(),
      },
    });

    // Record as checkpoint event
    await recordEvent(sessionId, {
      type: "test_result",
      data: {
        testName: testResult.testName,
        passed: testResult.passed,
        duration: testResult.duration,
      },
      checkpoint: true,
    });

    return result;

  } catch (error) {
    console.error("Error recording test result:", error);
    throw new Error(
      `Test result recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Close and finalize a session
 * Flushes all buffered events and uploads to S3
 *
 * @param sessionId - Session identifier
 * @param status - Final session status
 * @returns Updated session recording
 *
 * @example
 * ```typescript
 * await closeSession(sessionId, "COMPLETED");
 * ```
 */
export async function closeSession(
  sessionId: string,
  status: SessionStatus = "COMPLETED"
): Promise<SessionRecording> {
  try {
    // Flush any remaining buffered events
    await flushEventBuffer(sessionId);

    // Get session data
    const session = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
      include: {
        events: {
          orderBy: { timestamp: "asc" },
        },
        codeSnapshots: {
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Calculate duration
    const endTime = new Date();
    const duration = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 1000
    );

    // Upload events to S3
    let storagePath: string | undefined;
    let storageSize: number | undefined;

    if (session.events.length > 0) {
      const uploadResult = await uploadSessionRecording(
        sessionId,
        session.events.map((e) => ({
          timestamp: e.timestamp.toISOString(),
          type: e.type,
          fileId: e.fileId || undefined,
          data: e.data,
          checkpoint: e.checkpoint,
        })),
        {
          candidateId: session.candidateId,
          eventCount: String(session.events.length),
          duration: String(duration),
        }
      );

      storagePath = uploadResult.key;
      storageSize = uploadResult.compressedSize;
    }

    // Upload code snapshots separately
    if (session.codeSnapshots.length > 0) {
      await uploadCodeSnapshots(sessionId, session.codeSnapshots);
    }

    // Update session with final state
    const updatedSession = await prisma.sessionRecording.update({
      where: { id: sessionId },
      data: {
        status,
        endTime,
        duration,
        storagePath,
        storageSize,
      },
    });

    // Clean up event buffer
    eventBuffers.delete(sessionId);

    console.log(`Session ${sessionId} closed with status ${status}`);

    return updatedSession;

  } catch (error) {
    console.error("Error closing session:", error);
    throw new Error(
      `Session closure failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get session recording with all related data
 *
 * @param sessionId - Session identifier
 * @returns Complete session recording
 */
export async function getSessionRecording(
  sessionId: string
): Promise<SessionRecording & {
  events: SessionEvent[];
  claudeInteractions: ClaudeInteraction[];
  codeSnapshots: CodeSnapshot[];
  testResults: TestResult[];
}> {
  try {
    const session = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
      include: {
        events: {
          orderBy: { timestamp: "asc" },
        },
        claudeInteractions: {
          orderBy: { timestamp: "asc" },
        },
        codeSnapshots: {
          orderBy: { timestamp: "asc" },
        },
        testResults: {
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return session;

  } catch (error) {
    console.error("Error fetching session recording:", error);
    throw new Error(
      `Failed to fetch session: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get session statistics for analytics
 *
 * @param sessionId - Session identifier
 * @returns Session statistics
 */
export async function getSessionStats(sessionId: string): Promise<{
  eventCount: number;
  claudeInteractionCount: number;
  totalTokensUsed: number;
  codeSnapshotCount: number;
  testResultCount: number;
  testsPassedCount: number;
  duration: number | null;
}> {
  try {
    const session = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
      include: {
        claudeInteractions: true,
        testResults: true,
      },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const totalTokensUsed = session.claudeInteractions.reduce(
      (sum, interaction) =>
        sum + (interaction.inputTokens || 0) + (interaction.outputTokens || 0),
      0
    );

    const testsPassedCount = session.testResults.filter((t) => t.passed).length;

    return {
      eventCount: session.eventCount,
      claudeInteractionCount: session.claudeInteractions.length,
      totalTokensUsed,
      codeSnapshotCount: await prisma.codeSnapshot.count({
        where: { sessionId },
      }),
      testResultCount: session.testResults.length,
      testsPassedCount,
      duration: session.duration,
    };

  } catch (error) {
    console.error("Error fetching session stats:", error);
    throw new Error(
      `Failed to fetch session stats: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Flush buffered events to database
 */
async function flushEventBuffer(sessionId: string): Promise<void> {
  const buffer = eventBuffers.get(sessionId);
  if (!buffer || buffer.length === 0) {
    return;
  }

  try {
    // Batch insert events
    await prisma.sessionEvent.createMany({
      data: buffer.map((event) => ({
        sessionId,
        type: event.type,
        fileId: event.fileId,
        data: event.data,
        checkpoint: event.checkpoint || false,
        timestamp: new Date(),
      })),
    });

    // Clear buffer
    eventBuffers.set(sessionId, []);

  } catch (error) {
    console.error("Error flushing event buffer:", error);
  }
}

/**
 * Start periodic buffer flush for a session
 */
function startPeriodicFlush(sessionId: string): void {
  const interval = setInterval(async () => {
    await flushEventBuffer(sessionId);
  }, BUFFER_FLUSH_INTERVAL);

  // Store interval reference for cleanup
  (global as any)[`flush_${sessionId}`] = interval;
}

/**
 * Stop periodic buffer flush
 */
function stopPeriodicFlush(sessionId: string): void {
  const interval = (global as any)[`flush_${sessionId}`];
  if (interval) {
    clearInterval(interval);
    delete (global as any)[`flush_${sessionId}`];
  }
}
