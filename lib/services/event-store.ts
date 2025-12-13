/**
 * Unified Event Store Service
 *
 * Single source of truth for all session events. Enables:
 * - Perfect replay fidelity
 * - Comprehensive evaluation
 * - Rich analytics
 * - Point-in-time state reconstruction
 */

import prisma from "@/lib/prisma";

// ============================================================================
// Event Categories
// ============================================================================

export type EventCategory =
  | "session"
  | "question"
  | "file"
  | "code"
  | "chat"
  | "terminal"
  | "test"
  | "evaluation";

// ============================================================================
// Event Origin
// ============================================================================

/**
 * Who/what triggered the event
 * - USER: Candidate actions (typing, clicking, sending messages)
 * - AI: AI agent actions (tool calls, responses, code generation)
 * - SYSTEM: Platform actions (auto-save, timeouts, evaluations, checkpoints)
 */
export type EventOrigin = "USER" | "AI" | "SYSTEM";

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
  // Session lifecycle
  | "session.start"
  | "session.pause"
  | "session.resume"
  | "session.end"
  // Question lifecycle
  | "question.start"
  | "question.submit"
  | "question.evaluated"
  | "question.skip"
  // File operations
  | "file.create"
  | "file.update"
  | "file.rename"
  | "file.delete"
  // Code changes
  | "code.snapshot"
  | "code.edit"
  // Chat/AI interactions
  | "chat.user_message"
  | "chat.assistant_message"
  | "chat.assistant_chunk" // For streaming
  | "chat.tool_start"
  | "chat.tool_result"
  | "chat.reset"
  // Terminal
  | "terminal.command"
  | "terminal.output"
  | "terminal.clear"
  // Tests
  | "test.run_start"
  | "test.result"
  | "test.run_complete"
  // Evaluation
  | "evaluation.start"
  | "evaluation.complete"
  | "evaluation.final";

// ============================================================================
// Event Data Schemas
// ============================================================================

// Session events
export interface SessionStartData {
  candidateId: string;
  assessmentId: string;
  sandboxId?: string;
}

export interface SessionEndData {
  reason: "completed" | "timeout" | "abandoned" | "error";
  finalStatus: string;
}

// Question events
export interface QuestionStartData {
  questionId: string;
  title: string;
  difficulty: string;
  order: number;
  starterCode?: Array<{ fileName: string; content: string }>;
}

export interface QuestionSubmitData {
  code: string;
  testResults?: { passed: number; failed: number; total: number };
}

export interface QuestionEvaluatedData {
  score: number;
  passed: boolean;
  feedback: string;
  criteria?: Record<string, { score: number; feedback: string }>;
}

// File events
export interface FileCreateData {
  path: string;
  content: string;
  size: number;
  language?: string;
}

export interface FileUpdateData {
  path: string;
  content: string;
  contentHash?: string;
  diff?: string;
  linesAdded?: number;
  linesDeleted?: number;
}

export interface FileRenameData {
  oldPath: string;
  newPath: string;
}

export interface FileDeleteData {
  path: string;
}

// Code events
export interface CodeSnapshotData {
  path: string;
  content: string;
  contentHash?: string;
  linesAdded?: number;
  linesDeleted?: number;
}

// Chat events
export interface ChatUserMessageData {
  content: string;
  promptQuality?: number;
}

export interface ChatAssistantMessageData {
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latency?: number;
}

export interface ChatToolStartData {
  toolName: string;
  toolId: string;
  input: unknown;
}

export interface ChatToolResultData {
  toolName: string;
  toolId: string;
  output: unknown;
  isError: boolean;
}

export interface ChatResetData {
  reason: "question_transition" | "manual" | "error";
  questionIndex?: number;
}

// Terminal events
export interface TerminalCommandData {
  command: string;
  cwd?: string;
}

export interface TerminalOutputData {
  output: string;
  exitCode?: number;
  duration?: number;
}

// Test events
export interface TestRunStartData {
  testFile?: string;
  testCount?: number;
}

export interface TestResultData {
  testName: string;
  passed: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

export interface TestRunCompleteData {
  passed: number;
  failed: number;
  total: number;
  duration?: number;
}

// Evaluation events
export interface EvaluationCompleteData {
  score: number;
  criteria: Record<string, { score: number; maxScore: number; feedback: string }>;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export interface EvaluationFinalData {
  overallScore: number;
  recommendation: "strong_yes" | "yes" | "maybe" | "no" | "strong_no";
  dimensions: Record<string, number>;
}

// Union type for all event data
export type EventData =
  | SessionStartData
  | SessionEndData
  | QuestionStartData
  | QuestionSubmitData
  | QuestionEvaluatedData
  | FileCreateData
  | FileUpdateData
  | FileRenameData
  | FileDeleteData
  | CodeSnapshotData
  | ChatUserMessageData
  | ChatAssistantMessageData
  | ChatToolStartData
  | ChatToolResultData
  | ChatResetData
  | TerminalCommandData
  | TerminalOutputData
  | TestRunStartData
  | TestResultData
  | TestRunCompleteData
  | EvaluationCompleteData
  | EvaluationFinalData
  | Record<string, unknown>; // Fallback for flexibility

// ============================================================================
// Session Event Interface
// ============================================================================

export interface SessionEvent {
  id: string;
  sessionId: string;
  sequenceNumber: bigint;
  timestamp: Date;
  eventType: EventType;
  category: EventCategory;
  origin: EventOrigin;
  data: EventData;
  questionIndex?: number;
  filePath?: string;
  checkpoint: boolean;
}

// ============================================================================
// Session State (for replay)
// ============================================================================

export interface FileState {
  path: string;
  content: string;
  language?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  type?: string;
}

export interface SessionState {
  files: Map<string, FileState>;
  currentQuestion: number;
  chatMessages: ChatMessage[];
  terminalOutput: string[];
  testResults: { passed: number; failed: number; total: number } | null;
}

// ============================================================================
// Emit Options
// ============================================================================

export interface EmitEventOptions {
  sessionId: string;
  eventType: EventType;
  category: EventCategory;
  origin: EventOrigin;
  data: EventData;
  questionIndex?: number;
  filePath?: string;
  checkpoint?: boolean;
  timestamp?: Date;
}

// ============================================================================
// Query Options
// ============================================================================

export interface GetEventsOptions {
  fromSequence?: number;
  toSequence?: number;
  categories?: EventCategory[];
  eventTypes?: EventType[];
  questionIndex?: number;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Event Store Class
// ============================================================================

class EventStore {
  // In-memory sequence counters per session (for performance)
  private sequenceCounters = new Map<string, bigint>();

  // Batch buffer for high-frequency events
  private batchBuffer: Array<EmitEventOptions & { timestamp: Date }> = [];
  private batchFlushPromise: Promise<void> | null = null;
  private batchFlushTimeout: NodeJS.Timeout | null = null;

  // Configuration
  private readonly BATCH_FLUSH_INTERVAL_MS = 1000;
  private readonly BATCH_MAX_SIZE = 100;

  constructor() {
    // Auto-flush batch periodically
    if (typeof setInterval !== "undefined") {
      this.batchFlushTimeout = setInterval(
        () => this.flushBatch(),
        this.BATCH_FLUSH_INTERVAL_MS
      );
    }
  }

  /**
   * Emit a single event (immediate write)
   */
  async emit(options: EmitEventOptions): Promise<string> {
    const sequenceNumber = await this.getNextSequence(options.sessionId);
    const timestamp = options.timestamp ?? new Date();

    const event = await prisma.sessionEventLog.create({
      data: {
        sessionId: options.sessionId,
        sequenceNumber,
        timestamp,
        eventType: options.eventType,
        category: options.category,
        origin: options.origin,
        data: options.data as any,
        questionIndex: options.questionIndex,
        filePath: options.filePath,
        checkpoint: options.checkpoint ?? false,
      },
    });

    return event.id;
  }

  /**
   * Emit multiple events in a transaction
   */
  async emitMany(events: EmitEventOptions[]): Promise<string[]> {
    if (events.length === 0) return [];

    // Group by session to get sequences
    const bySession = new Map<string, EmitEventOptions[]>();
    for (const event of events) {
      const list = bySession.get(event.sessionId) || [];
      list.push(event);
      bySession.set(event.sessionId, list);
    }

    const ids: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const [sessionId, sessionEvents] of bySession) {
        const baseSequence = await this.getNextSequence(sessionId, sessionEvents.length);

        for (let i = 0; i < sessionEvents.length; i++) {
          const opt = sessionEvents[i];
          const event = await tx.sessionEventLog.create({
            data: {
              sessionId,
              sequenceNumber: baseSequence + BigInt(i),
              timestamp: opt.timestamp ?? new Date(),
              eventType: opt.eventType,
              category: opt.category,
              origin: opt.origin,
              data: opt.data as any,
              questionIndex: opt.questionIndex,
              filePath: opt.filePath,
              checkpoint: opt.checkpoint ?? false,
            },
          });
          ids.push(event.id);
        }
      }
    });

    return ids;
  }

  /**
   * Emit event to batch (for high-frequency events like code edits)
   * Batched events are flushed periodically or when batch is full
   */
  emitBatched(options: EmitEventOptions): void {
    this.batchBuffer.push({
      ...options,
      timestamp: options.timestamp ?? new Date(),
    });

    // Flush if batch is full
    if (this.batchBuffer.length >= this.BATCH_MAX_SIZE) {
      this.flushBatch();
    }
  }

  /**
   * Flush batched events to database
   */
  async flushBatch(): Promise<void> {
    if (this.batchBuffer.length === 0) return;

    // Avoid concurrent flushes
    if (this.batchFlushPromise) {
      await this.batchFlushPromise;
    }

    const events = [...this.batchBuffer];
    this.batchBuffer = [];

    this.batchFlushPromise = this.emitMany(events).then(() => {
      this.batchFlushPromise = null;
    });

    await this.batchFlushPromise;
  }

  /**
   * Get events for a session
   */
  async getEvents(
    sessionId: string,
    options?: GetEventsOptions
  ): Promise<SessionEvent[]> {
    const where: any = { sessionId };

    if (options?.fromSequence !== undefined) {
      where.sequenceNumber = { gte: options.fromSequence };
    }
    if (options?.toSequence !== undefined) {
      where.sequenceNumber = {
        ...where.sequenceNumber,
        lte: options.toSequence,
      };
    }
    if (options?.categories?.length) {
      where.category = { in: options.categories };
    }
    if (options?.eventTypes?.length) {
      where.eventType = { in: options.eventTypes };
    }
    if (options?.questionIndex !== undefined) {
      where.questionIndex = options.questionIndex;
    }

    const events = await prisma.sessionEventLog.findMany({
      where,
      orderBy: { sequenceNumber: "asc" },
      take: options?.limit,
      skip: options?.offset,
    });

    return events.map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      sequenceNumber: e.sequenceNumber,
      timestamp: e.timestamp,
      eventType: e.eventType as EventType,
      category: e.category as EventCategory,
      origin: e.origin as EventOrigin,
      data: e.data as EventData,
      questionIndex: e.questionIndex ?? undefined,
      filePath: e.filePath ?? undefined,
      checkpoint: e.checkpoint,
    }));
  }

  /**
   * Get checkpoints for quick seeking
   */
  async getCheckpoints(sessionId: string): Promise<SessionEvent[]> {
    return this.getEvents(sessionId, {
      // Only fetch checkpoint events
    }).then((events) => events.filter((e) => e.checkpoint));
  }

  /**
   * Get total event count for a session
   */
  async getEventCount(sessionId: string): Promise<number> {
    return prisma.sessionEventLog.count({
      where: { sessionId },
    });
  }

  /**
   * Get latest sequence number for a session
   */
  async getLatestSequence(sessionId: string): Promise<bigint> {
    const result = await prisma.sessionEventLog.findFirst({
      where: { sessionId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    return result?.sequenceNumber ?? BigInt(0);
  }

  /**
   * Get state at a specific sequence number (by replaying events)
   */
  async getStateAt(
    sessionId: string,
    sequenceNumber: number
  ): Promise<SessionState> {
    const events = await this.getEvents(sessionId, {
      toSequence: sequenceNumber,
    });
    return this.replayEvents(events);
  }

  /**
   * Get question boundaries (start indices for each question)
   */
  async getQuestionBoundaries(
    sessionId: string
  ): Promise<Array<{ questionIndex: number; sequenceNumber: bigint; title: string }>> {
    const events = await prisma.sessionEventLog.findMany({
      where: {
        sessionId,
        eventType: "question.start",
      },
      orderBy: { sequenceNumber: "asc" },
      select: {
        sequenceNumber: true,
        questionIndex: true,
        data: true,
      },
    });

    return events.map((e) => ({
      questionIndex: e.questionIndex ?? 0,
      sequenceNumber: e.sequenceNumber,
      title: (e.data as any)?.title ?? `Question ${e.questionIndex ?? 0 + 1}`,
    }));
  }

  /**
   * Replay events to build state
   */
  replayEvents(events: SessionEvent[]): SessionState {
    const state: SessionState = {
      files: new Map(),
      currentQuestion: 0,
      chatMessages: [],
      terminalOutput: [],
      testResults: null,
    };

    for (const event of events) {
      this.applyEvent(state, event);
    }

    return state;
  }

  /**
   * Apply single event to state
   */
  private applyEvent(state: SessionState, event: SessionEvent): void {
    const data = event.data as any;

    switch (event.eventType) {
      case "file.create":
      case "file.update":
      case "code.snapshot":
        if (data.path && data.content !== undefined) {
          state.files.set(data.path, {
            path: data.path,
            content: data.content,
            language: data.language,
          });
        }
        break;

      case "file.delete":
        if (data.path) {
          state.files.delete(data.path);
        }
        break;

      case "file.rename":
        if (data.oldPath && data.newPath) {
          const file = state.files.get(data.oldPath);
          if (file) {
            state.files.delete(data.oldPath);
            state.files.set(data.newPath, { ...file, path: data.newPath });
          }
        }
        break;

      case "question.start":
        state.currentQuestion = event.questionIndex ?? 0;
        state.chatMessages = []; // Reset chat for new question
        state.testResults = null;
        break;

      case "chat.user_message":
        state.chatMessages.push({
          role: "user",
          content: data.content,
          timestamp: event.timestamp,
        });
        break;

      case "chat.assistant_message":
        state.chatMessages.push({
          role: "assistant",
          content: data.content,
          timestamp: event.timestamp,
        });
        break;

      case "chat.tool_start":
        state.chatMessages.push({
          role: "system",
          content: `Using tool: ${data.toolName}`,
          timestamp: event.timestamp,
          type: "tool_start",
        });
        break;

      case "chat.tool_result":
        state.chatMessages.push({
          role: "system",
          content: data.isError
            ? `Tool error: ${JSON.stringify(data.output)}`
            : `Tool result: ${JSON.stringify(data.output).slice(0, 200)}`,
          timestamp: event.timestamp,
          type: data.isError ? "tool_error" : "tool_result",
        });
        break;

      case "chat.reset":
        state.chatMessages = [];
        break;

      case "terminal.output":
        state.terminalOutput.push(data.output || data.command || "");
        break;

      case "terminal.clear":
        state.terminalOutput = [];
        break;

      case "test.run_complete":
        state.testResults = {
          passed: data.passed ?? 0,
          failed: data.failed ?? 0,
          total: data.total ?? 0,
        };
        break;
    }
  }

  /**
   * Get next sequence number(s) for a session
   */
  private async getNextSequence(
    sessionId: string,
    count = 1
  ): Promise<bigint> {
    // Check cache first
    let current = this.sequenceCounters.get(sessionId);

    if (current === undefined) {
      // Load from database
      current = await this.getLatestSequence(sessionId);
      this.sequenceCounters.set(sessionId, current);
    }

    const next = current + BigInt(1);
    this.sequenceCounters.set(sessionId, current + BigInt(count));

    return next;
  }

  /**
   * Clear sequence counter cache for a session
   */
  clearSequenceCache(sessionId: string): void {
    this.sequenceCounters.delete(sessionId);
  }

  /**
   * Cleanup (for graceful shutdown)
   */
  async shutdown(): Promise<void> {
    if (this.batchFlushTimeout) {
      clearInterval(this.batchFlushTimeout);
    }
    await this.flushBatch();
  }
}

// Export singleton instance
export const eventStore = new EventStore();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine category from event type
 */
export function getCategoryFromEventType(eventType: EventType): EventCategory {
  const prefix = eventType.split(".")[0];
  const categoryMap: Record<string, EventCategory> = {
    session: "session",
    question: "question",
    file: "file",
    code: "code",
    chat: "chat",
    terminal: "terminal",
    test: "test",
    evaluation: "evaluation",
  };
  return categoryMap[prefix] ?? "session";
}

/**
 * Check if an event type should be a checkpoint
 */
export function isCheckpointEvent(eventType: EventType): boolean {
  const checkpointTypes: EventType[] = [
    "session.start",
    "session.end",
    "question.start",
    "question.submit",
    "question.evaluated",
    "file.create",
    "test.run_complete",
    "evaluation.complete",
    "evaluation.final",
  ];
  return checkpointTypes.includes(eventType);
}
