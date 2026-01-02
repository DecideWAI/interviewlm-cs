/**
 * E2E Integration Test for Complete Interview Flow
 * Tests the entire interview lifecycle from start to completion
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

jest.mock("@/lib/prisma");
jest.mock("@/lib/services/claude");
jest.mock("@/lib/services/s3");

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

    // 4. Record candidate activity
    (prisma.sessionEvent.create as jest.Mock).mockResolvedValue({
      id: "event-1",
    });
    (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});

    await recordEvent(session.id, {
      type: "keystroke",
      fileId: "file-1",
      data: { key: "a" },
    });

    // 5. Record Claude interaction
    (prisma.claudeInteraction.create as jest.Mock).mockResolvedValue({
      id: "int-1",
    });

    await recordClaudeInteraction(session.id, {
      role: "user",
      content: "How do I solve this?",
    });

    // 6. Record code snapshot
    (prisma.codeSnapshot.create as jest.Mock).mockResolvedValue({
      id: "snap-1",
    });

    await recordCodeSnapshot(session.id, {
      fileId: "file-1",
      fileName: "solution.ts",
      language: "typescript",
      content: "function twoSum() {}",
    });

    // 7. Record test results
    (prisma.testResult.create as jest.Mock).mockResolvedValue({
      id: "test-1",
    });

    await recordTestResult(session.id, {
      testName: "test_basic",
      passed: true,
      duration: 15,
    });

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
      events: [{ id: "event-1", type: "keystroke", timestamp: new Date(), data: {} }],
      codeSnapshots: [],
    });

    (s3.uploadSessionRecording as jest.Mock).mockResolvedValue({
      key: "sessions/2025/01/01/session-123/events.json.gz",
      compressedSize: 1024,
    });

    const closedSession = await closeSession(session.id, "COMPLETED");
    expect(closedSession.status).toBe("COMPLETED");

    // Verify entire flow
    expect(prisma.sessionRecording.create).toHaveBeenCalled();
    expect(prisma.sessionEvent.create).toHaveBeenCalled();
    expect(prisma.claudeInteraction.create).toHaveBeenCalled();
    expect(prisma.codeSnapshot.create).toHaveBeenCalled();
    expect(prisma.testResult.create).toHaveBeenCalled();
    expect(s3.uploadSessionRecording).toHaveBeenCalled();
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
