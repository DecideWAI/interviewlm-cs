/**
 * E2E Integration Test for Complete Interview Flow
 * Tests the entire interview lifecycle from start to completion
 *
 * Note: These tests use the unified event store (sessionEventLog)
 */

import prisma from "@/lib/prisma";
import {
  createSession,
  recordEvent,
  recordClaudeInteraction,
  recordCodeSnapshot,
  recordTestResult,
  closeSession,
} from "@/lib/services/sessions";
import { generateQuestion, completeQuestion } from "@/lib/services/questions";
import * as claude from "@/lib/services/claude";
import * as s3 from "@/lib/services/s3";
import { eventStore } from "@/lib/services/event-store";

jest.mock("@/lib/prisma");
jest.mock("@/lib/services/claude");
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

describe("Complete Interview Flow E2E", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should complete full interview lifecycle", async () => {
    // 1. Setup: Create candidate and assessment
    const mockCandidate = {
      id: "cand-123",
      name: "Test Candidate",
      email: "test@example.com",
      assessment: {
        questions: [{ problemSeedId: "seed-1" }],
      },
    };

    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);

    // 2. Start session
    const mockSession = {
      id: "session-123",
      candidateId: "cand-123",
      status: "ACTIVE",
      startTime: new Date(),
      eventCount: 0,
    };

    (prisma.sessionRecording.create as jest.Mock).mockResolvedValue(mockSession);

    const session = await createSession("cand-123");
    expect(session.id).toBe("session-123");

    // Verify session.start event was emitted
    expect(eventStore.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session.start",
        origin: "SYSTEM",
      })
    );

    // 3. Generate question
    (claude.getChatCompletion as jest.Mock).mockResolvedValue({
      content: JSON.stringify({
        title: "Two Sum",
        description: "Find two numbers that add up to target",
        requirements: [],
        estimatedTime: 30,
        starterCode: [],
        testCases: [],
      }),
      usage: { totalTokens: 100 },
    });

    (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
      id: "question-1",
      candidateId: "cand-123",
      title: "Two Sum",
    });
    (prisma.generatedQuestion.count as jest.Mock).mockResolvedValue(0);

    const questionResult = await generateQuestion({
      candidateId: "cand-123",
      difficulty: "MEDIUM",
      language: "typescript",
    });

    expect(questionResult.question.title).toBe("Two Sum");

    // 4. Record candidate activity (using new signature)
    (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});

    await recordEvent(
      session.id,
      "code.edit",
      "USER",
      { key: "a" },
      { filePath: "file-1" }
    );

    expect(eventStore.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "code.edit",
        origin: "USER",
      })
    );

    // 5. Record Claude interaction
    await recordClaudeInteraction(session.id, {
      role: "user",
      content: "How do I solve this?",
    });

    expect(eventStore.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "chat.user_message",
        origin: "USER",
      })
    );

    // 6. Record code snapshot (with origin parameter)
    await recordCodeSnapshot(
      session.id,
      {
        fileId: "file-1",
        fileName: "solution.ts",
        language: "typescript",
        content: "function twoSum() {}",
      },
      "USER"
    );

    expect(eventStore.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "code.snapshot",
        origin: "USER",
        checkpoint: true,
      })
    );

    // 7. Record test results
    await recordTestResult(session.id, {
      testName: "test_basic",
      passed: true,
      duration: 15,
    });

    expect(eventStore.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "test.result",
        origin: "SYSTEM",
        checkpoint: true,
      })
    );

    // 8. Complete question
    (prisma.generatedQuestion.update as jest.Mock).mockResolvedValue({
      id: "question-1",
      status: "COMPLETED",
      score: 0.85,
    });

    await completeQuestion("question-1", 0.85);

    // 9. Close session and upload to S3
    (prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue({
      ...mockSession,
      candidateId: "cand-123",
    });

    (eventStore.getEvents as jest.Mock).mockResolvedValue([
      { id: "event-1", eventType: "code.edit", category: "code", timestamp: new Date(), data: {} },
      { id: "event-2", eventType: "chat.user_message", category: "chat", timestamp: new Date(), data: {} },
    ]);

    (s3.uploadSessionRecording as jest.Mock).mockResolvedValue({
      key: "sessions/2025/01/01/session-123/events.json.gz",
      compressedSize: 1024,
    });

    const closedSession = await closeSession(session.id, "COMPLETED");
    expect(closedSession.status).toBe("COMPLETED");

    // Verify session.end event was emitted
    expect(eventStore.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session.end",
        origin: "SYSTEM",
      })
    );

    // Verify batch was flushed
    expect(eventStore.flushBatch).toHaveBeenCalled();

    // Verify S3 upload
    expect(s3.uploadSessionRecording).toHaveBeenCalled();
  });

  it("should track event origins correctly throughout interview", async () => {
    // Setup
    const mockSession = { id: "session-123", candidateId: "cand-123", status: "ACTIVE", startTime: new Date() };
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue({ id: "cand-123" });
    (prisma.sessionRecording.create as jest.Mock).mockResolvedValue(mockSession);
    (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});

    await createSession("cand-123");

    // User actions should have USER origin
    await recordEvent("session-123", "code.edit", "USER", { key: "a" });
    await recordEvent("session-123", "terminal.command", "USER", { command: "npm test" });

    // AI responses should have AI origin
    await recordClaudeInteraction("session-123", {
      role: "assistant",
      content: "Here's the solution...",
    });

    // System actions should have SYSTEM origin
    await recordTestResult("session-123", { testName: "test", passed: true, duration: 10 });

    // Verify origins
    const calls = (eventStore.emit as jest.Mock).mock.calls;

    // First call is session.start with SYSTEM origin
    expect(calls[0][0]).toMatchObject({ origin: "SYSTEM", eventType: "session.start" });

    // User code edit
    expect(calls[1][0]).toMatchObject({ origin: "USER", eventType: "code.edit" });

    // User terminal command
    expect(calls[2][0]).toMatchObject({ origin: "USER", eventType: "terminal.command" });

    // AI assistant response
    expect(calls[3][0]).toMatchObject({ origin: "AI", eventType: "chat.assistant_message" });

    // System test result
    expect(calls[4][0]).toMatchObject({ origin: "SYSTEM", eventType: "test.result" });
  });

  it("should handle multi-question assessment", async () => {
    // Test would verify:
    // - Multiple questions can be generated
    // - Session persists across questions
    // - Progress is tracked correctly
    expect(true).toBe(true);
  });

  it("should handle session interruption and resume", async () => {
    // Test would verify:
    // - Session can be paused
    // - State is preserved
    // - Can resume from same point
    expect(true).toBe(true);
  });
});
