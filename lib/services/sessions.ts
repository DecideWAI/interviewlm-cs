/**
 * Session Recording Service
 *
 * Manages interview session recordings, including real-time event capture,
 * Claude interactions, code snapshots, and test results.
 *
 * Uses the unified event store with event origins (USER, AI, SYSTEM).
 */

import prisma from "@/lib/prisma";
import { z } from "zod";
import * as diff from "diff";
import * as crypto from "crypto";
import { uploadSessionRecording } from "./s3";
import {
  eventStore,
  getCategoryFromEventType,
  isCheckpointEvent,
  type EventType,
  type EventOrigin,
} from "./event-store";
import type {
  SessionRecording,
  SessionStatus,
} from "@/lib/prisma-types";

// Validation schemas
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

type ClaudeMessage = z.infer<typeof claudeMessageSchema>;
type CodeSnapshotData = z.infer<typeof codeSnapshotSchema>;
type TestResultData = z.infer<typeof testResultSchema>;

// Note: Event batching is now handled by the unified event store.
// The old eventBuffers map has been removed in favor of eventStore.emitBatched()

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

    // Emit session.start event to unified event store
    await eventStore.emit({
      sessionId: session.id,
      eventType: "session.start",
      category: "session",
      origin: "SYSTEM",
      data: {
        candidateId,
        assessmentId: "", // Will be set when assessment is known
      },
    });

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
 * Record a session event to the unified event store
 *
 * @param sessionId - Session identifier
 * @param eventType - Event type (e.g., "code.edit", "chat.user_message")
 * @param origin - Who triggered the event: USER, AI, or SYSTEM
 * @param data - Event payload data
 * @param options - Additional options (questionIndex, filePath, checkpoint, useBatch)
 * @returns Created session event log ID
 *
 * @example
 * ```typescript
 * await recordEvent(
 *   sessionId,
 *   "code.edit",
 *   "USER",
 *   { key: "a", timestamp: Date.now() },
 *   { filePath: "main.ts" }
 * );
 * ```
 */
export async function recordEvent(
  sessionId: string,
  eventType: EventType,
  origin: EventOrigin,
  data: Record<string, unknown>,
  options?: {
    questionIndex?: number;
    filePath?: string;
    checkpoint?: boolean;
    useBatch?: boolean;
  }
): Promise<string> {
  try {
    const category = getCategoryFromEventType(eventType);

    const emitOptions = {
      sessionId,
      eventType,
      category,
      origin,
      data,
      questionIndex: options?.questionIndex,
      filePath: options?.filePath,
      checkpoint: options?.checkpoint ?? isCheckpointEvent(eventType),
    };

    // Emit to unified event store (use batched for high-frequency events)
    let eventId: string;
    if (options?.useBatch) {
      eventStore.emitBatched(emitOptions);
      eventId = "batched"; // Batched events don't return IDs immediately
    } else {
      eventId = await eventStore.emit(emitOptions);
    }

    // Update event count on session
    await prisma.sessionRecording.update({
      where: { id: sessionId },
      data: {
        eventCount: { increment: 1 },
      },
    });

    return eventId;

  } catch (error) {
    console.error("Error recording event:", error);
    throw new Error(
      `Event recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record a Claude AI interaction to the unified event store
 *
 * @param sessionId - Session identifier
 * @param message - Claude message data
 * @param metadata - Additional metadata (questionIndex, promptQuality)
 * @returns Event log ID
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
  metadata?: { promptQuality?: number; questionIndex?: number }
): Promise<string> {
  try {
    // Validate message
    claudeMessageSchema.parse(message);

    // Determine event type and origin based on role
    const eventType: EventType = message.role === "user"
      ? "chat.user_message"
      : "chat.assistant_message";
    const origin: EventOrigin = message.role === "user" ? "USER" : "AI";

    // Emit to unified event store
    const eventId = await eventStore.emit({
      sessionId,
      eventType,
      category: "chat",
      origin,
      data: {
        role: message.role,
        content: message.content,
        model: message.model,
        inputTokens: message.inputTokens,
        outputTokens: message.outputTokens,
        latency: message.latency,
        stopReason: message.stopReason,
        promptQuality: metadata?.promptQuality,
      },
      questionIndex: metadata?.questionIndex,
    });

    return eventId;

  } catch (error) {
    console.error("Error recording Claude interaction:", error);
    throw new Error(
      `Claude interaction recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record a code snapshot to the unified event store
 *
 * @param sessionId - Session identifier
 * @param snapshot - Code snapshot data
 * @param origin - Who triggered the snapshot: USER (candidate edit), AI (agent code), SYSTEM (auto-save)
 * @param previousContent - Previous file content for diff calculation
 * @param options - Additional options (questionIndex)
 * @returns Event log ID
 *
 * @example
 * ```typescript
 * await recordCodeSnapshot(
 *   sessionId,
 *   { fileId: "file_1", fileName: "main.ts", language: "typescript", content: "..." },
 *   "USER",
 *   previousContent
 * );
 * ```
 */
export async function recordCodeSnapshot(
  sessionId: string,
  snapshot: CodeSnapshotData,
  origin: EventOrigin,
  previousContent?: string,
  options?: { questionIndex?: number }
): Promise<string> {
  try {
    // Validate snapshot
    codeSnapshotSchema.parse(snapshot);

    // Calculate content hash
    const contentHash = crypto
      .createHash("sha256")
      .update(snapshot.content)
      .digest("hex");

    // Calculate line change metrics
    let linesAdded = 0;
    let linesDeleted = 0;

    if (previousContent) {
      const changes = diff.diffLines(previousContent, snapshot.content);

      // Count added/deleted lines
      changes.forEach((change) => {
        if (change.added) {
          linesAdded += change.count || 0;
        } else if (change.removed) {
          linesDeleted += change.count || 0;
        }
      });
    }

    // Emit to unified event store as a checkpoint event
    const eventId = await eventStore.emit({
      sessionId,
      eventType: "code.snapshot",
      category: "code",
      origin,
      data: {
        fileId: snapshot.fileId,
        fileName: snapshot.fileName,
        path: snapshot.fileName, // Standardize on 'path' for replay compatibility
        language: snapshot.language,
        content: snapshot.content, // Include fullContent for offline replay
        contentHash,
        linesAdded,
        linesDeleted,
      },
      questionIndex: options?.questionIndex,
      filePath: snapshot.fileName,
      checkpoint: true,
    });

    return eventId;

  } catch (error) {
    console.error("Error recording code snapshot:", error);
    throw new Error(
      `Code snapshot recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record test execution result to the unified event store
 *
 * @param sessionId - Session identifier
 * @param testResult - Test result data
 * @param options - Additional options (questionIndex)
 * @returns Event log ID
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
  testResult: TestResultData,
  options?: { questionIndex?: number }
): Promise<string> {
  try {
    // Validate test result
    testResultSchema.parse(testResult);

    // Emit to unified event store as a checkpoint event
    // Origin is SYSTEM because test results come from the test runner
    const eventId = await eventStore.emit({
      sessionId,
      eventType: "test.result",
      category: "test",
      origin: "SYSTEM",
      data: {
        testName: testResult.testName,
        passed: testResult.passed,
        output: testResult.output,
        error: testResult.error,
        duration: testResult.duration,
      },
      questionIndex: options?.questionIndex,
      checkpoint: true,
    });

    return eventId;

  } catch (error) {
    console.error("Error recording test result:", error);
    throw new Error(
      `Test result recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Record test run completion event (aggregate of all test results)
 *
 * @param sessionId - Session identifier
 * @param results - Aggregate test results
 * @param options - Additional options (questionIndex)
 * @returns Event log ID
 *
 * @example
 * ```typescript
 * await recordTestRunComplete(sessionId, {
 *   passed: 3,
 *   failed: 1,
 *   total: 4,
 *   duration: 1500
 * });
 * ```
 */
export async function recordTestRunComplete(
  sessionId: string,
  results: {
    passed: number;
    failed: number;
    total: number;
    duration?: number;
  },
  options?: { questionIndex?: number }
): Promise<string> {
  try {
    // Emit to unified event store as a checkpoint event
    // Origin is SYSTEM because test results come from the test runner
    const eventId = await eventStore.emit({
      sessionId,
      eventType: "test.run_complete",
      category: "test",
      origin: "SYSTEM",
      data: {
        passed: results.passed,
        failed: results.failed,
        total: results.total,
        duration: results.duration,
      },
      questionIndex: options?.questionIndex,
      checkpoint: true,
    });

    return eventId;

  } catch (error) {
    console.error("Error recording test run completion:", error);
    throw new Error(
      `Test run completion recording failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Close and finalize a session
 * Flushes all buffered events from the event store and uploads to S3
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
    // Emit session completion event before flushing
    const endTime = new Date();
    await eventStore.emit({
      sessionId,
      eventType: "session.end",
      category: "session",
      origin: "SYSTEM",
      data: {
        reason: status === "COMPLETED" ? "completed" : "abandoned",
        finalStatus: status,
      },
    });

    // Flush any remaining buffered events from the event store
    await eventStore.flushBatch();

    // Get session data
    const session = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Calculate duration
    const duration = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 1000
    );

    // Get all events from the unified event store for S3 upload
    const events = await eventStore.getEvents(sessionId);

    // Upload events to S3
    let storagePath: string | undefined;
    let storageSize: number | undefined;

    if (events.length > 0) {
      const uploadResult = await uploadSessionRecording(
        sessionId,
        events.map((e) => ({
          timestamp: e.timestamp.toISOString(),
          type: e.eventType,
          sequenceNumber: e.sequenceNumber.toString(),
          category: e.category,
          data: e.data,
          checkpoint: e.checkpoint,
          questionIndex: e.questionIndex,
          filePath: e.filePath,
        })),
        {
          candidateId: session.candidateId,
          eventCount: String(events.length),
          duration: String(duration),
        }
      );

      storagePath = uploadResult.key;
      storageSize = uploadResult.compressedSize;
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
        eventCount: events.length,
      },
    });

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
 * Get session recording with all events from the unified event store
 *
 * @param sessionId - Session identifier
 * @returns Complete session recording with events
 */
export async function getSessionRecording(
  sessionId: string
): Promise<SessionRecording & {
  eventLogs: Awaited<ReturnType<typeof eventStore.getEvents>>;
}> {
  try {
    const session = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get all events from the unified event store
    const eventLogs = await eventStore.getEvents(sessionId);

    return {
      ...session,
      eventLogs,
    };

  } catch (error) {
    console.error("Error fetching session recording:", error);
    throw new Error(
      `Failed to fetch session: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get events filtered by category from the unified event store
 *
 * @param sessionId - Session identifier
 * @param category - Event category to filter by
 * @returns Events in the specified category
 */
export async function getSessionEventsByCategory(
  sessionId: string,
  category: "session" | "question" | "file" | "code" | "chat" | "terminal" | "test" | "evaluation"
) {
  return eventStore.getEvents(sessionId, { categories: [category] });
}

/**
 * Get events for a specific question
 *
 * @param sessionId - Session identifier
 * @param questionIndex - Question index (0-based)
 * @returns Events for the specified question
 */
export async function getQuestionEvents(
  sessionId: string,
  questionIndex: number
) {
  return eventStore.getEvents(sessionId, { questionIndex });
}

/**
 * Get comprehensive session statistics for analytics and evaluation
 * Now reads from the unified event store
 *
 * @param sessionId - Session identifier
 * @returns Detailed session statistics
 */
export async function getSessionStats(sessionId: string): Promise<{
  // Basic metrics
  eventCount: number;
  duration: number | null;

  // File change metrics
  fileChanges: {
    totalSnapshots: number;
    uniqueFiles: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    mostEditedFiles: Array<{ fileName: string; editCount: number }>;
  };

  // Claude interaction metrics
  claudeInteractions: {
    totalInteractions: number;
    totalTokensUsed: number;
    inputTokens: number;
    outputTokens: number;
    averageLatency: number | null;
    averagePromptQuality: number | null;
    interactionsByRole: {
      user: number;
      assistant: number;
      system: number;
    };
  };

  // Terminal activity metrics
  terminalActivity: {
    totalCommands: number;
    uniqueCommands: number;
    commandCategories: {
      test: number;
      git: number;
      fileOps: number;
      package: number;
      other: number;
    };
  };

  // Test execution metrics
  testExecution: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate: number;
    averageDuration: number | null;
    firstPassTime: number | null; // Seconds from session start
  };

  // Activity timeline
  activityTimeline: {
    firstEventTime: Date | null;
    lastEventTime: Date | null;
    totalActiveTime: number | null; // Seconds of actual activity
  };
}> {
  try {
    const session = await prisma.sessionRecording.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get all events from the unified event store
    const allEvents = await eventStore.getEvents(sessionId);

    // Filter events by category for analysis
    const codeEvents = allEvents.filter((e) => e.category === "code");
    const chatEvents = allEvents.filter((e) => e.category === "chat");
    const terminalEvents = allEvents.filter((e) => e.category === "terminal");
    const testEvents = allEvents.filter((e) => e.category === "test");

    // File change metrics from code.snapshot events
    const codeSnapshots = codeEvents.filter((e) => e.eventType === "code.snapshot");
    const totalLinesAdded = codeSnapshots.reduce(
      (sum, snap) => sum + ((snap.data as any)?.linesAdded || 0),
      0
    );
    const totalLinesDeleted = codeSnapshots.reduce(
      (sum, snap) => sum + ((snap.data as any)?.linesDeleted || 0),
      0
    );

    // Count edits per file
    const fileEditCounts = new Map<string, number>();
    codeSnapshots.forEach((snap) => {
      const fileName = (snap.data as any)?.fileName || snap.filePath;
      if (fileName) {
        const count = fileEditCounts.get(fileName) || 0;
        fileEditCounts.set(fileName, count + 1);
      }
    });

    const mostEditedFiles = Array.from(fileEditCounts.entries())
      .map(([fileName, editCount]) => ({ fileName, editCount }))
      .sort((a, b) => b.editCount - a.editCount)
      .slice(0, 5);

    // Claude interaction metrics from chat events
    const totalInputTokens = chatEvents.reduce(
      (sum, event) => sum + ((event.data as any)?.inputTokens || 0),
      0
    );
    const totalOutputTokens = chatEvents.reduce(
      (sum, event) => sum + ((event.data as any)?.outputTokens || 0),
      0
    );

    const eventsWithLatency = chatEvents.filter(
      (e) => (e.data as any)?.latency !== null && (e.data as any)?.latency !== undefined
    );
    const averageLatency = eventsWithLatency.length > 0
      ? eventsWithLatency.reduce((sum, e) => sum + ((e.data as any)?.latency || 0), 0) / eventsWithLatency.length
      : null;

    const eventsWithQuality = chatEvents.filter(
      (e) => (e.data as any)?.promptQuality !== null && (e.data as any)?.promptQuality !== undefined
    );
    const averagePromptQuality = eventsWithQuality.length > 0
      ? eventsWithQuality.reduce((sum, e) => sum + ((e.data as any)?.promptQuality || 0), 0) / eventsWithQuality.length
      : null;

    const interactionsByRole = {
      user: chatEvents.filter((e) => (e.data as any)?.role === "user").length,
      assistant: chatEvents.filter((e) => (e.data as any)?.role === "assistant").length,
      system: chatEvents.filter((e) => (e.data as any)?.role === "system").length,
    };

    // Terminal activity metrics
    const terminalInputEvents = terminalEvents.filter((e) => e.eventType === "terminal.command");
    const commands = terminalInputEvents.map((e) => (e.data as any)?.command).filter(Boolean) as string[];
    const uniqueCommands = new Set(commands).size;

    const commandCategories = {
      test: commands.filter((cmd) =>
        cmd.includes("test") || cmd.includes("jest") || cmd.includes("npm run test") || cmd.includes("pytest")
      ).length,
      git: commands.filter((cmd) => cmd.startsWith("git")).length,
      fileOps: commands.filter((cmd) =>
        cmd.startsWith("cat") || cmd.startsWith("ls") || cmd.startsWith("mkdir") ||
        cmd.startsWith("rm") || cmd.startsWith("cp") || cmd.startsWith("mv")
      ).length,
      package: commands.filter((cmd) =>
        cmd.includes("npm") || cmd.includes("pip") || cmd.includes("yarn") || cmd.includes("pnpm")
      ).length,
      other: 0,
    };
    commandCategories.other = commands.length - (
      commandCategories.test + commandCategories.git +
      commandCategories.fileOps + commandCategories.package
    );

    // Test execution metrics from test events
    const testCompletedEvents = testEvents.filter((e) => e.eventType === "test.result" || e.eventType === "test.run_complete");
    const passedTests = testCompletedEvents.filter((t) => (t.data as any)?.passed).length;
    const failedTests = testCompletedEvents.length - passedTests;
    const passRate = testCompletedEvents.length > 0
      ? (passedTests / testCompletedEvents.length) * 100
      : 0;

    const testsWithDuration = testCompletedEvents.filter(
      (t) => (t.data as any)?.duration !== null && (t.data as any)?.duration !== undefined
    );
    const averageTestDuration = testsWithDuration.length > 0
      ? testsWithDuration.reduce((sum, t) => sum + ((t.data as any)?.duration || 0), 0) / testsWithDuration.length
      : null;

    // Find first test pass
    const firstPassedTest = testCompletedEvents.find((t) => (t.data as any)?.passed);
    const firstPassTime = firstPassedTest && session.startTime
      ? Math.floor((new Date(firstPassedTest.timestamp).getTime() - session.startTime.getTime()) / 1000)
      : null;

    // Activity timeline
    const firstEventTime = allEvents.length > 0
      ? allEvents[0].timestamp
      : null;
    const lastEventTime = allEvents.length > 0
      ? allEvents[allEvents.length - 1].timestamp
      : null;

    // Calculate active time (time between events with gaps > 5 minutes considered idle)
    let totalActiveTime: number | null = null;
    if (allEvents.length > 1) {
      let activeSeconds = 0;
      for (let i = 1; i < allEvents.length; i++) {
        const gap = (new Date(allEvents[i].timestamp).getTime() -
                     new Date(allEvents[i - 1].timestamp).getTime()) / 1000;
        // Only count gaps < 5 minutes as active time
        if (gap < 300) {
          activeSeconds += gap;
        }
      }
      totalActiveTime = activeSeconds;
    }

    return {
      // Basic metrics
      eventCount: allEvents.length,
      duration: session.duration,

      // File change metrics
      fileChanges: {
        totalSnapshots: codeSnapshots.length,
        uniqueFiles: fileEditCounts.size,
        totalLinesAdded,
        totalLinesDeleted,
        mostEditedFiles,
      },

      // Claude interaction metrics
      claudeInteractions: {
        totalInteractions: chatEvents.length,
        totalTokensUsed: totalInputTokens + totalOutputTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        averageLatency,
        averagePromptQuality,
        interactionsByRole,
      },

      // Terminal activity metrics
      terminalActivity: {
        totalCommands: commands.length,
        uniqueCommands,
        commandCategories,
      },

      // Test execution metrics
      testExecution: {
        totalTests: testCompletedEvents.length,
        passedTests,
        failedTests,
        passRate,
        averageDuration: averageTestDuration,
        firstPassTime,
      },

      // Activity timeline
      activityTimeline: {
        firstEventTime,
        lastEventTime,
        totalActiveTime,
      },
    };

  } catch (error) {
    console.error("Error fetching session stats:", error);
    throw new Error(
      `Failed to fetch session stats: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Note: The following deprecated functions have been removed:
// - flushEventBuffer (replaced by eventStore.flushBatch)
// - startPeriodicFlush (event store handles its own batching)
// - stopPeriodicFlush (event store handles its own cleanup)

/**
 * Add a file path to the tracked files list for a session
 * Used to track files created by user, LLM, or during initialization
 *
 * @param sessionId - Session recording ID
 * @param filePath - Path of the file to track
 * @returns Updated tracked files list
 */
export async function addTrackedFile(
  sessionId: string,
  filePath: string
): Promise<string[]> {
  const session = await prisma.sessionRecording.findUnique({
    where: { id: sessionId },
    select: { trackedFiles: true },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const currentFiles = (session.trackedFiles as string[]) || [];

  // Avoid duplicates
  if (currentFiles.includes(filePath)) {
    return currentFiles;
  }

  const updatedFiles = [...currentFiles, filePath];

  await prisma.sessionRecording.update({
    where: { id: sessionId },
    data: { trackedFiles: updatedFiles },
  });

  return updatedFiles;
}

/**
 * Add multiple file paths to the tracked files list for a session
 *
 * @param sessionId - Session recording ID
 * @param filePaths - Array of file paths to track
 * @returns Updated tracked files list
 */
export async function addTrackedFiles(
  sessionId: string,
  filePaths: string[]
): Promise<string[]> {
  const session = await prisma.sessionRecording.findUnique({
    where: { id: sessionId },
    select: { trackedFiles: true },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const currentFiles = (session.trackedFiles as string[]) || [];
  const newFiles = filePaths.filter((path) => !currentFiles.includes(path));

  if (newFiles.length === 0) {
    return currentFiles;
  }

  const updatedFiles = [...currentFiles, ...newFiles];

  await prisma.sessionRecording.update({
    where: { id: sessionId },
    data: { trackedFiles: updatedFiles },
  });

  return updatedFiles;
}

/**
 * Get the list of tracked files for a session
 *
 * @param sessionId - Session recording ID
 * @returns Array of tracked file paths
 */
export async function getTrackedFiles(sessionId: string): Promise<string[]> {
  const session = await prisma.sessionRecording.findUnique({
    where: { id: sessionId },
    select: { trackedFiles: true },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  return (session.trackedFiles as string[]) || [];
}

/**
 * Remove a file path from the tracked files list
 *
 * @param sessionId - Session recording ID
 * @param filePath - Path of the file to remove
 * @returns Updated tracked files list
 */
export async function removeTrackedFile(
  sessionId: string,
  filePath: string
): Promise<string[]> {
  const session = await prisma.sessionRecording.findUnique({
    where: { id: sessionId },
    select: { trackedFiles: true },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const currentFiles = (session.trackedFiles as string[]) || [];
  const updatedFiles = currentFiles.filter((path) => path !== filePath);

  await prisma.sessionRecording.update({
    where: { id: sessionId },
    data: { trackedFiles: updatedFiles },
  });

  return updatedFiles;
}
