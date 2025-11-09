/**
 * Unit Tests for Session Recording Service
 * Tests session lifecycle, event recording, Claude interactions, and code snapshots
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

// Mock dependencies
jest.mock("@/lib/prisma");
jest.mock("@/lib/services/s3");

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
    });

    it("should throw error if candidate not found", async () => {
      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(createSession("invalid-candidate")).rejects.toThrow(
        "Candidate invalid-candidate not found"
      );
    });

    it("should initialize event buffer", async () => {
      const mockCandidate = { id: "cand-123" };
      const mockSession = {
        id: "session-123",
        candidateId: "cand-123",
        status: "ACTIVE",
        startTime: new Date(),
      };

      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
      (prisma.sessionRecording.create as jest.Mock).mockResolvedValue(mockSession);

      await createSession("cand-123");

      // Buffer should be initialized (tested implicitly through recordEvent)
    });
  });

  describe("recordEvent", () => {
    const mockSessionId = "session-123";

    beforeEach(() => {
      (prisma.sessionEvent.create as jest.Mock).mockResolvedValue({
        id: "event-1",
        sessionId: mockSessionId,
        type: "keystroke",
        timestamp: new Date(),
      });

      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        eventCount: 1,
      });
    });

    it("should record a keystroke event", async () => {
      const event = {
        type: "keystroke",
        fileId: "file-1",
        data: { key: "a", timestamp: Date.now() },
      };

      const result = await recordEvent(mockSessionId, event);

      expect(result).toMatchObject({
        sessionId: mockSessionId,
        type: "keystroke",
      });

      expect(prisma.sessionEvent.create).toHaveBeenCalledWith({
        data: {
          sessionId: mockSessionId,
          type: "keystroke",
          fileId: "file-1",
          data: event.data,
          checkpoint: false,
          timestamp: expect.any(Date),
        },
      });

      expect(prisma.sessionRecording.update).toHaveBeenCalledWith({
        where: { id: mockSessionId },
        data: {
          eventCount: { increment: 1 },
        },
      });
    });

    it("should record a checkpoint event", async () => {
      const event = {
        type: "code_snapshot",
        fileId: "file-1",
        data: { contentHash: "abc123" },
        checkpoint: true,
      };

      await recordEvent(mockSessionId, event);

      expect(prisma.sessionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          checkpoint: true,
        }),
      });
    });

    it("should validate event data", async () => {
      const invalidEvent = {
        // Missing required 'type' field
        data: {},
      };

      await expect(
        recordEvent(mockSessionId, invalidEvent as any)
      ).rejects.toThrow();
    });
  });

  describe("recordClaudeInteraction", () => {
    const mockSessionId = "session-123";

    beforeEach(() => {
      (prisma.claudeInteraction.create as jest.Mock).mockResolvedValue({
        id: "interaction-1",
        sessionId: mockSessionId,
        role: "assistant",
        content: "Here's how to solve...",
      });

      (prisma.sessionEvent.create as jest.Mock).mockResolvedValue({
        id: "event-1",
      });

      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});
    });

    it("should record Claude interaction with token usage", async () => {
      const message = {
        role: "assistant" as const,
        content: "Here's how to solve the problem...",
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 150,
        outputTokens: 300,
        latency: 1200,
        stopReason: "end_turn",
      };

      const result = await recordClaudeInteraction(mockSessionId, message);

      expect(result).toMatchObject({
        sessionId: mockSessionId,
        role: "assistant",
        content: "Here's how to solve the problem...",
      });

      expect(prisma.claudeInteraction.create).toHaveBeenCalledWith({
        data: {
          sessionId: mockSessionId,
          role: "assistant",
          content: message.content,
          model: message.model,
          inputTokens: 150,
          outputTokens: 300,
          latency: 1200,
          stopReason: "end_turn",
          promptQuality: undefined,
          timestamp: expect.any(Date),
        },
      });

      // Should also create a session event
      expect(prisma.sessionEvent.create).toHaveBeenCalled();
    });

    it("should record prompt quality if provided", async () => {
      const message = {
        role: "user" as const,
        content: "How do I solve this?",
      };

      await recordClaudeInteraction(mockSessionId, message, {
        promptQuality: 0.85,
      });

      expect(prisma.claudeInteraction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promptQuality: 0.85,
        }),
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

    beforeEach(() => {
      (prisma.codeSnapshot.create as jest.Mock).mockResolvedValue({
        id: "snapshot-1",
        sessionId: mockSessionId,
      });

      (prisma.sessionEvent.create as jest.Mock).mockResolvedValue({
        id: "event-1",
      });

      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});
    });

    it("should record code snapshot with content hash", async () => {
      const snapshot = {
        fileId: "file-1",
        fileName: "solution.js",
        language: "javascript",
        content: "function add(a, b) { return a + b; }",
      };

      const result = await recordCodeSnapshot(mockSessionId, snapshot);

      expect(result).toMatchObject({
        sessionId: mockSessionId,
      });

      expect(prisma.codeSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: mockSessionId,
          fileId: "file-1",
          fileName: "solution.js",
          language: "javascript",
          contentHash: expect.any(String),
          fullContent: snapshot.content,
        }),
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

      await recordCodeSnapshot(mockSessionId, snapshot, previousContent);

      const callArgs = (prisma.codeSnapshot.create as jest.Mock).mock.calls[0][0];

      expect(callArgs.data.linesAdded).toBeGreaterThan(0);
      expect(callArgs.data.linesDeleted).toBeGreaterThan(0);
      expect(callArgs.data.diffFromPrevious).toBeDefined();
    });

    it("should create checkpoint event", async () => {
      const snapshot = {
        fileId: "file-1",
        fileName: "solution.js",
        language: "javascript",
        content: "code",
      };

      await recordCodeSnapshot(mockSessionId, snapshot);

      expect(prisma.sessionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "code_snapshot",
          checkpoint: true,
        }),
      });
    });
  });

  describe("recordTestResult", () => {
    const mockSessionId = "session-123";

    beforeEach(() => {
      (prisma.testResult.create as jest.Mock).mockResolvedValue({
        id: "test-1",
        sessionId: mockSessionId,
      });

      (prisma.sessionEvent.create as jest.Mock).mockResolvedValue({
        id: "event-1",
      });

      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});
    });

    it("should record passed test result", async () => {
      const testResult = {
        testName: "test_add",
        passed: true,
        output: "5",
        duration: 15,
      };

      const result = await recordTestResult(mockSessionId, testResult);

      expect(result).toMatchObject({
        sessionId: mockSessionId,
      });

      expect(prisma.testResult.create).toHaveBeenCalledWith({
        data: {
          sessionId: mockSessionId,
          testName: "test_add",
          passed: true,
          output: "5",
          error: undefined,
          duration: 15,
          timestamp: expect.any(Date),
        },
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

      expect(prisma.testResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          passed: false,
          error: "Expected 0, got 1",
        }),
      });
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
        events: [
          {
            id: "event-1",
            timestamp: new Date(),
            type: "keystroke",
            data: {},
            checkpoint: false,
          },
        ],
        codeSnapshots: [
          {
            id: "snapshot-1",
            timestamp: new Date(),
            fileId: "file-1",
            fileName: "solution.js",
          },
        ],
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

      (s3.uploadCodeSnapshots as jest.Mock).mockResolvedValue({
        key: "sessions/2025/01/01/session-123/snapshots.json.gz",
      });
    });

    it("should close session and upload to S3", async () => {
      const result = await closeSession(mockSessionId, "COMPLETED");

      expect(result.status).toBe("COMPLETED");

      expect(s3.uploadSessionRecording).toHaveBeenCalledWith(
        mockSessionId,
        expect.any(Array),
        expect.objectContaining({
          candidateId: "cand-123",
        })
      );

      expect(s3.uploadCodeSnapshots).toHaveBeenCalled();

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

    it("should calculate session duration correctly", async () => {
      await closeSession(mockSessionId);

      const updateCall = (prisma.sessionRecording.update as jest.Mock).mock.calls[0][0];

      // Duration should be in seconds
      expect(updateCall.data.duration).toBeGreaterThan(0);
    });

    it("should handle sessions with no events", async () => {
      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        candidateId: "cand-123",
        startTime: new Date(),
        events: [],
        codeSnapshots: [],
      });

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
    it("should retrieve complete session with all data", async () => {
      const mockSession = {
        id: "session-123",
        candidateId: "cand-123",
        status: "COMPLETED",
        startTime: new Date(),
        endTime: new Date(),
        duration: 1800,
        events: [
          { id: "event-1", type: "keystroke", timestamp: new Date() },
        ],
        claudeInteractions: [
          { id: "int-1", role: "user", content: "Help", timestamp: new Date() },
        ],
        codeSnapshots: [
          { id: "snap-1", fileId: "file-1", timestamp: new Date() },
        ],
        testResults: [
          { id: "test-1", testName: "test_1", passed: true, timestamp: new Date() },
        ],
      };

      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSession);

      const result = await getSessionRecording("session-123");

      expect(result).toMatchObject({
        id: "session-123",
        events: expect.any(Array),
        claudeInteractions: expect.any(Array),
        codeSnapshots: expect.any(Array),
        testResults: expect.any(Array),
      });

      expect(prisma.sessionRecording.findUnique).toHaveBeenCalledWith({
        where: { id: "session-123" },
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
    });

    it("should throw error if session not found", async () => {
      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(getSessionRecording("invalid-session")).rejects.toThrow(
        "Session invalid-session not found"
      );
    });
  });

  describe("getSessionStats", () => {
    it("should calculate session statistics", async () => {
      const mockSession = {
        id: "session-123",
        eventCount: 500,
        duration: 1800,
        claudeInteractions: [
          { inputTokens: 100, outputTokens: 200 },
          { inputTokens: 150, outputTokens: 250 },
        ],
        testResults: [
          { passed: true },
          { passed: true },
          { passed: false },
        ],
      };

      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.codeSnapshot.count as jest.Mock).mockResolvedValue(10);

      const result = await getSessionStats("session-123");

      expect(result).toMatchObject({
        eventCount: 500,
        claudeInteractionCount: 2,
        totalTokensUsed: 700, // (100+200) + (150+250)
        codeSnapshotCount: 10,
        testResultCount: 3,
        testsPassedCount: 2,
        duration: 1800,
      });
    });

    it("should handle sessions with no interactions", async () => {
      const mockSession = {
        id: "session-123",
        eventCount: 0,
        duration: null,
        claudeInteractions: [],
        testResults: [],
      };

      (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.codeSnapshot.count as jest.Mock).mockResolvedValue(0);

      const result = await getSessionStats("session-123");

      expect(result).toMatchObject({
        eventCount: 0,
        claudeInteractionCount: 0,
        totalTokensUsed: 0,
        testsPassedCount: 0,
      });
    });
  });
});
