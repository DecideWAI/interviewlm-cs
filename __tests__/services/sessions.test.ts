/**
 * Unit Tests for Session Recording Service
 * Tests session lifecycle, event recording, Claude interactions, and code snapshots
 *
 * Note: These tests mock the unified event store (sessionEventLog)
 */

import {
  createSession,
  recordEvent,
  recordClaudeInteraction,
  recordCodeSnapshot,
  recordTestResult,
  closeSession,
  getSessionRecording,
  getSessionStats,
} from "@/lib/services/sessions";
import prisma from "@/lib/prisma";
import * as s3 from "@/lib/services/s3";
import { eventStore } from "@/lib/services/event-store";

// Mock dependencies
jest.mock("@/lib/prisma");
jest.mock("@/lib/services/s3");
jest.mock("@/lib/services/event-store", () => ({
  eventStore: {
    emit: jest.fn().mockResolvedValue("event-123"),
    emitBatched: jest.fn(),
    flushBatch: jest.fn().mockResolvedValue(undefined),
    getEvents: jest.fn().mockResolvedValue([]),
  },
  getCategoryFromEventType: jest.fn((eventType: string) => {
    const category = eventType.split(".")[0];
    return category;
  }),
  isCheckpointEvent: jest.fn((eventType: string) => {
    return ["session.start", "session.end", "question.start", "question.submit", "code.snapshot", "test.result"].includes(eventType);
  }),
}));

describe("Session Recording Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("createSession", () => {
    it("should create a new session successfully", async () => {
      const mockCandidate = {
        id: "cand-123",
        name: "Test Candidate",
        email: "test@example.com",
      };

      const mockSession = {
        id: "session-123",
        candidateId: "cand-123",
        status: "ACTIVE",
        startTime: new Date(),
        eventCount: 0,
      };

      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
      (prisma.sessionRecording.create as jest.Mock).mockResolvedValue(mockSession);

      const result = await createSession("cand-123");

      expect(result).toMatchObject({
        id: "session-123",
        candidateId: "cand-123",
        status: "ACTIVE",
      });

      expect(prisma.candidate.findUnique).toHaveBeenCalledWith({
        where: { id: "cand-123" },
      });

      expect(prisma.sessionRecording.create).toHaveBeenCalledWith({
        data: {
          candidateId: "cand-123",
          status: "ACTIVE",
          startTime: expect.any(Date),
        },
      });

      // Should emit session.start event
      expect(eventStore.emit).toHaveBeenCalledWith({
        sessionId: "session-123",
        eventType: "session.start",
        category: "session",
        origin: "SYSTEM",
        data: {
          candidateId: "cand-123",
          assessmentId: "",
        },
      });
    });

    it("should throw error if candidate not found", async () => {
      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(createSession("invalid-candidate")).rejects.toThrow(
        "Candidate invalid-candidate not found"
      );
    });
  });

  describe("recordEvent", () => {
    const mockSessionId = "session-123";

    beforeEach(() => {
      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        eventCount: 1,
      });
    });

    it("should record a code.edit event", async () => {
      const result = await recordEvent(
        mockSessionId,
        "code.edit",
        "USER",
        { key: "a", timestamp: Date.now() },
        { filePath: "file-1" }
      );

      expect(result).toBe("event-123");

      expect(eventStore.emit).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        eventType: "code.edit",
        category: "code",
        origin: "USER",
        data: { key: "a", timestamp: expect.any(Number) },
        questionIndex: undefined,
        filePath: "file-1",
        checkpoint: false,
      });

      expect(prisma.sessionRecording.update).toHaveBeenCalledWith({
        where: { id: mockSessionId },
        data: {
          eventCount: { increment: 1 },
        },
      });
    });

    it("should record a checkpoint event", async () => {
      await recordEvent(
        mockSessionId,
        "code.snapshot",
        "SYSTEM",
        { contentHash: "abc123" },
        { checkpoint: true }
      );

      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpoint: true,
        })
      );
    });

    it("should use batched emit when useBatch option is true", async () => {
      const result = await recordEvent(
        mockSessionId,
        "code.edit",
        "USER",
        { key: "a" },
        { useBatch: true }
      );

      expect(result).toBe("batched");
      expect(eventStore.emitBatched).toHaveBeenCalled();
    });
  });

  describe("recordClaudeInteraction", () => {
    const mockSessionId = "session-123";

    it("should record assistant message with AI origin", async () => {
      const message = {
        role: "assistant" as const,
        content: "Here's how to solve the problem...",
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 150,
        outputTokens: 300,
        latency: 1200,
        stopReason: "end_turn",
      };

      await recordClaudeInteraction(mockSessionId, message);

      expect(eventStore.emit).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        eventType: "chat.assistant_message",
        category: "chat",
        origin: "AI",
        data: {
          role: "assistant",
          content: "Here's how to solve the problem...",
          model: "claude-sonnet-4-5-20250929",
          inputTokens: 150,
          outputTokens: 300,
          latency: 1200,
          stopReason: "end_turn",
          promptQuality: undefined,
        },
        questionIndex: undefined,
      });
    });

    it("should record user message with USER origin", async () => {
      const message = {
        role: "user" as const,
        content: "How do I solve this?",
      };

      await recordClaudeInteraction(mockSessionId, message, {
        promptQuality: 0.85,
        questionIndex: 0,
      });

      expect(eventStore.emit).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        eventType: "chat.user_message",
        category: "chat",
        origin: "USER",
        data: expect.objectContaining({
          role: "user",
          promptQuality: 0.85,
        }),
        questionIndex: 0,
      });
    });

    it("should validate message schema", async () => {
      const invalidMessage = {
        role: "invalid_role",
        content: "test",
      };

      await expect(
        recordClaudeInteraction(mockSessionId, invalidMessage as any)
      ).rejects.toThrow();
    });
  });

  describe("recordCodeSnapshot", () => {
    const mockSessionId = "session-123";

    it("should record code snapshot with content hash", async () => {
      const snapshot = {
        fileId: "file-1",
        fileName: "solution.js",
        language: "javascript",
        content: "function add(a, b) { return a + b; }",
      };

      await recordCodeSnapshot(mockSessionId, snapshot, "USER");

      expect(eventStore.emit).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        eventType: "code.snapshot",
        category: "code",
        origin: "USER",
        data: expect.objectContaining({
          fileId: "file-1",
          fileName: "solution.js",
          language: "javascript",
          contentHash: expect.any(String),
          linesAdded: 0,
          linesDeleted: 0,
        }),
        questionIndex: undefined,
        filePath: "solution.js",
        checkpoint: true,
      });
    });

    it("should calculate diff from previous content", async () => {
      const snapshot = {
        fileId: "file-1",
        fileName: "solution.js",
        language: "javascript",
        content: "function add(a, b) {\n  return a + b;\n}",
      };

      const previousContent = "function add(a, b) { return a+b; }";

      await recordCodeSnapshot(mockSessionId, snapshot, "USER", previousContent);

      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            linesAdded: expect.any(Number),
            linesDeleted: expect.any(Number),
          }),
        })
      );
    });

    it("should support AI origin for AI-generated code", async () => {
      const snapshot = {
        fileId: "file-1",
        fileName: "solution.js",
        language: "javascript",
        content: "// AI generated code",
      };

      await recordCodeSnapshot(mockSessionId, snapshot, "AI");

      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: "AI",
        })
      );
    });
  });

  describe("recordTestResult", () => {
    const mockSessionId = "session-123";

    it("should record passed test result with SYSTEM origin", async () => {
      const testResult = {
        testName: "test_add",
        passed: true,
        output: "5",
        duration: 15,
      };

      await recordTestResult(mockSessionId, testResult);

      expect(eventStore.emit).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        eventType: "test.result",
        category: "test",
        origin: "SYSTEM",
        data: {
          testName: "test_add",
          passed: true,
          output: "5",
          error: undefined,
          duration: 15,
        },
        questionIndex: undefined,
        checkpoint: true,
      });
    });

    it("should record failed test result with error", async () => {
      const testResult = {
        testName: "test_edge_case",
        passed: false,
        error: "Expected 0, got 1",
        duration: 12,
      };

      await recordTestResult(mockSessionId, testResult);

      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passed: false,
            error: "Expected 0, got 1",
          }),
        })
      );
    });
  });

  describe("closeSession", () => {
    const mockSessionId = "session-123";

    beforeEach(() => {
      const mockSession = {
        id: mockSessionId,
        candidateId: "cand-123",
        startTime: new Date(Date.now() - 1800000), // 30 minutes ago
        eventCount: 100,
      };

      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({
        ...mockSession,
        status: "COMPLETED",
        endTime: new Date(),
        duration: 1800,
      });

      (s3.uploadSessionRecording as jest.Mock).mockResolvedValue({
        key: "sessions/2025/01/01/session-123/events.json.gz",
        compressedSize: 1024,
      });

      (eventStore.getEvents as jest.Mock).mockResolvedValue([
        {
          id: "event-1",
          timestamp: new Date(),
          eventType: "code.edit",
          category: "code",
          data: {},
          checkpoint: false,
        },
      ]);
    });

    it("should close session and upload to S3", async () => {
      const result = await closeSession(mockSessionId, "COMPLETED");

      expect(result.status).toBe("COMPLETED");

      // Should emit session.end event
      expect(eventStore.emit).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        eventType: "session.end",
        category: "session",
        origin: "SYSTEM",
        data: {
          reason: "completed",
          finalStatus: "COMPLETED",
        },
      });

      // Should flush batch
      expect(eventStore.flushBatch).toHaveBeenCalled();

      // Should get events for S3 upload
      expect(eventStore.getEvents).toHaveBeenCalledWith(mockSessionId);

      expect(s3.uploadSessionRecording).toHaveBeenCalledWith(
        mockSessionId,
        expect.any(Array),
        expect.objectContaining({
          candidateId: "cand-123",
        })
      );

      expect(prisma.sessionRecording.update).toHaveBeenCalledWith({
        where: { id: mockSessionId },
        data: expect.objectContaining({
          status: "COMPLETED",
          endTime: expect.any(Date),
          duration: expect.any(Number),
          storagePath: expect.stringContaining("session-123"),
          storageSize: 1024,
        }),
      });
    });

    it("should handle sessions with no events", async () => {
      (eventStore.getEvents as jest.Mock).mockResolvedValue([]);

      const result = await closeSession(mockSessionId);

      expect(s3.uploadSessionRecording).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should throw error if session not found", async () => {
      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(closeSession("invalid-session")).rejects.toThrow(
        "Session invalid-session not found"
      );
    });
  });

  describe("getSessionRecording", () => {
    it("should retrieve session with events from event store", async () => {
      const mockSession = {
        id: "session-123",
        candidateId: "cand-123",
        status: "COMPLETED",
        startTime: new Date(),
        endTime: new Date(),
        duration: 1800,
      };

      const mockEvents = [
        { id: "event-1", eventType: "code.edit", category: "code", timestamp: new Date(), data: {} },
        { id: "event-2", eventType: "chat.user_message", category: "chat", timestamp: new Date(), data: {} },
      ];

      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (eventStore.getEvents as jest.Mock).mockResolvedValue(mockEvents);

      const result = await getSessionRecording("session-123");

      expect(result).toMatchObject({
        id: "session-123",
        eventLogs: expect.any(Array),
      });

      expect(eventStore.getEvents).toHaveBeenCalledWith("session-123");
    });

    it("should throw error if session not found", async () => {
      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(getSessionRecording("invalid-session")).rejects.toThrow(
        "Session invalid-session not found"
      );
    });
  });

  describe("getSessionStats", () => {
    it("should calculate session statistics from events", async () => {
      const mockSession = {
        id: "session-123",
        eventCount: 500,
        duration: 1800,
        startTime: new Date(Date.now() - 1800000),
      };

      const mockEvents = [
        { eventType: "code.snapshot", category: "code", timestamp: new Date(), data: { linesAdded: 10, linesDeleted: 2, fileName: "test.js" } },
        { eventType: "code.snapshot", category: "code", timestamp: new Date(), data: { linesAdded: 5, linesDeleted: 1, fileName: "test.js" } },
        { eventType: "chat.user_message", category: "chat", timestamp: new Date(), data: { role: "user", inputTokens: 100 } },
        { eventType: "chat.assistant_message", category: "chat", timestamp: new Date(), data: { role: "assistant", outputTokens: 200, latency: 1000 } },
        { eventType: "terminal.command", category: "terminal", timestamp: new Date(), data: { command: "npm test" } },
        { eventType: "test.result", category: "test", timestamp: new Date(), data: { passed: true, duration: 100 } },
        { eventType: "test.result", category: "test", timestamp: new Date(), data: { passed: false, duration: 50 } },
      ];

      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (eventStore.getEvents as jest.Mock).mockResolvedValue(mockEvents);

      const result = await getSessionStats("session-123");

      expect(result).toMatchObject({
        eventCount: mockEvents.length,
        duration: 1800,
        fileChanges: {
          totalSnapshots: 2,
          totalLinesAdded: 15,
          totalLinesDeleted: 3,
        },
        claudeInteractions: {
          totalInteractions: 2,
        },
        terminalActivity: {
          totalCommands: 1,
        },
        testExecution: {
          totalTests: 2,
          passedTests: 1,
          failedTests: 1,
        },
      });
    });
  });
});
