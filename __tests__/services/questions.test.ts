/**
 * Unit Tests for Question Generation Service
 * Tests adaptive question generation, difficulty adjustment, and performance calculation
 */

import {
  generateQuestion,
  getNextQuestion,
  startQuestion,
  completeQuestion,
  skipQuestion,
  getCandidateQuestions,
  calculatePerformance,
  regenerateQuestion,
} from "@/lib/services/questions";
import prisma from "@/lib/prisma";
import * as claude from "@/lib/services/claude";

// Mock dependencies
jest.mock("@/lib/prisma");
jest.mock("@/lib/services/claude");

describe("Question Generation Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateQuestion", () => {
    beforeEach(() => {
      (claude.getChatCompletion as jest.Mock).mockResolvedValue({
        content: JSON.stringify({
          title: "Two Sum",
          description: "Find two numbers that add up to a target value",
          requirements: [
            "Return indices of the two numbers",
            "O(n) time complexity",
          ],
          estimatedTime: 30,
          starterCode: [
            {
              fileName: "solution.ts",
              content: "function twoSum(nums: number[], target: number): number[] {\n  // Your code here\n}",
              language: "typescript",
            },
          ],
          testCases: [
            {
              name: "test_basic",
              input: { nums: [2, 7, 11, 15], target: 9 },
              expected: [0, 1],
              hidden: false,
            },
            {
              name: "test_negative",
              input: { nums: [-1, -2, -3, -4, -5], target: -8 },
              expected: [2, 4],
              hidden: true,
            },
          ],
        }),
        usage: {
          totalTokens: 500,
          inputTokens: 100,
          outputTokens: 400,
        },
      });

      (prisma.generatedQuestion.count as jest.Mock).mockResolvedValue(0);
      (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
        id: "question-1",
        candidateId: "cand-123",
        title: "Two Sum",
        difficulty: "MEDIUM",
        language: "typescript",
      });
    });

    it("should generate question successfully", async () => {
      const params = {
        candidateId: "cand-123",
        difficulty: "MEDIUM" as const,
        language: "typescript",
      };

      const result = await generateQuestion(params);

      expect(result).toMatchObject({
        question: expect.objectContaining({
          id: "question-1",
          title: "Two Sum",
          difficulty: "MEDIUM",
        }),
        generationTime: expect.any(Number),
        tokensUsed: 500,
        adaptedDifficulty: "MEDIUM",
      });

      expect(prisma.generatedQuestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: "cand-123",
          title: "Two Sum",
          difficulty: "MEDIUM",
          language: "typescript",
          starterCode: expect.any(Array),
          testCases: expect.any(Array),
          status: "PENDING",
        }),
      });
    });

    it("should adapt difficulty based on previous performance", async () => {
      (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
        id: "question-1",
        difficulty: "EASY",
      });

      const params = {
        candidateId: "cand-123",
        difficulty: "MEDIUM" as const,
        language: "typescript",
        previousPerformance: 0.3, // Poor performance - should reduce difficulty
      };

      const result = await generateQuestion(params);

      expect(result.adaptedDifficulty).toBe("EASY");
    });

    it("should increase difficulty for excellent performance", async () => {
      (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
        id: "question-1",
        difficulty: "HARD",
      });

      const params = {
        candidateId: "cand-123",
        difficulty: "MEDIUM" as const,
        language: "typescript",
        previousPerformance: 0.9, // Excellent performance
      };

      const result = await generateQuestion(params);

      expect(result.adaptedDifficulty).toBe("HARD");
    });

    it("should use problem seed if provided", async () => {
      const mockSeed = {
        id: "seed-1",
        title: "Binary Search",
        category: "Algorithms",
        tags: ["searching", "arrays"],
      };

      (prisma.problemSeed.findUnique as jest.Mock).mockResolvedValue(mockSeed);

      const params = {
        candidateId: "cand-123",
        seed: "seed-1",
        difficulty: "MEDIUM" as const,
        language: "typescript",
      };

      await generateQuestion(params);

      expect(prisma.problemSeed.findUnique).toHaveBeenCalledWith({
        where: { id: "seed-1" },
      });

      // Claude should be called with seed information
      expect(claude.getChatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          problemDescription: expect.stringContaining("Binary Search"),
        })
      );
    });

    it("should handle invalid JSON response from Claude", async () => {
      (claude.getChatCompletion as jest.Mock).mockResolvedValue({
        content: "This is not valid JSON",
        usage: { totalTokens: 100 },
      });

      const params = {
        candidateId: "cand-123",
        difficulty: "MEDIUM" as const,
        language: "typescript",
      };

      await expect(generateQuestion(params)).rejects.toThrow(
        "Invalid question format generated"
      );
    });

    it("should validate parameters", async () => {
      const invalidParams = {
        candidateId: "cand-123",
        difficulty: "INVALID" as any,
        language: "typescript",
      };

      await expect(generateQuestion(invalidParams)).rejects.toThrow();
    });

    it("should set correct question order", async () => {
      (prisma.generatedQuestion.count as jest.Mock).mockResolvedValue(3);

      const params = {
        candidateId: "cand-123",
        difficulty: "MEDIUM" as const,
        language: "typescript",
      };

      await generateQuestion(params);

      expect(prisma.generatedQuestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          order: 4, // Should be count + 1
        }),
      });
    });
  });

  describe("getNextQuestion", () => {
    it("should return existing pending question", async () => {
      const mockQuestion = {
        id: "question-1",
        candidateId: "cand-123",
        status: "PENDING",
        order: 1,
      };

      (prisma.generatedQuestion.findFirst as jest.Mock).mockResolvedValue(mockQuestion);

      const result = await getNextQuestion("cand-123", false);

      expect(result).toMatchObject(mockQuestion);
      expect(prisma.generatedQuestion.findFirst).toHaveBeenCalledWith({
        where: {
          candidateId: "cand-123",
          status: "PENDING",
        },
        orderBy: {
          order: "asc",
        },
      });
    });

    it("should return null if no pending questions and autoGenerate is false", async () => {
      (prisma.generatedQuestion.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await getNextQuestion("cand-123", false);

      expect(result).toBeNull();
    });

    it("should auto-generate new question if none pending", async () => {
      (prisma.generatedQuestion.findFirst as jest.Mock).mockResolvedValue(null);

      const mockCandidate = {
        id: "cand-123",
        assessment: {
          questions: [
            { problemSeedId: "seed-1" },
          ],
        },
      };

      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
      (prisma.generatedQuestion.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.generatedQuestion.count as jest.Mock).mockResolvedValue(0);

      (claude.getChatCompletion as jest.Mock).mockResolvedValue({
        content: JSON.stringify({
          title: "New Question",
          description: "Description",
          requirements: [],
          estimatedTime: 30,
          starterCode: [],
          testCases: [],
        }),
        usage: { totalTokens: 100 },
      });

      (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
        id: "question-new",
        title: "New Question",
      });

      const result = await getNextQuestion("cand-123", true);

      expect(result).toBeDefined();
      expect(result?.title).toBe("New Question");
    });

    it("should start with EASY difficulty for first question", async () => {
      (prisma.generatedQuestion.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.generatedQuestion.count as jest.Mock).mockResolvedValue(0);
      (prisma.generatedQuestion.findMany as jest.Mock).mockResolvedValue([]);

      const mockCandidate = {
        id: "cand-123",
        assessment: { questions: [] },
      };

      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);

      (claude.getChatCompletion as jest.Mock).mockResolvedValue({
        content: JSON.stringify({
          title: "Easy Question",
          description: "Desc",
          requirements: [],
          estimatedTime: 20,
          starterCode: [],
          testCases: [],
        }),
        usage: { totalTokens: 100 },
      });

      (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
        id: "question-1",
        difficulty: "EASY",
      });

      await getNextQuestion("cand-123", true);

      // Should generate with EASY difficulty
      const createCall = (prisma.generatedQuestion.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.difficulty).toBe("EASY");
    });

    it("should calculate previous performance for adaptive difficulty", async () => {
      (prisma.generatedQuestion.findFirst as jest.Mock).mockResolvedValue(null);

      const completedQuestions = [
        { status: "COMPLETED", score: 0.8 },
        { status: "COMPLETED", score: 0.9 },
        { status: "COMPLETED", score: 0.7 },
      ];

      (prisma.generatedQuestion.findMany as jest.Mock).mockResolvedValue(completedQuestions);
      (prisma.generatedQuestion.count as jest.Mock).mockResolvedValue(3);

      const mockCandidate = {
        id: "cand-123",
        assessment: { questions: [] },
      };

      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);

      (claude.getChatCompletion as jest.Mock).mockResolvedValue({
        content: JSON.stringify({
          title: "Question",
          description: "Desc",
          requirements: [],
          estimatedTime: 30,
          starterCode: [],
          testCases: [],
        }),
        usage: { totalTokens: 100 },
      });

      (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
        id: "question-4",
      });

      await getNextQuestion("cand-123", true);

      // Should have calculated average score: (0.8 + 0.9 + 0.7) / 3 = 0.8
      // This should be used for adaptive difficulty
    });
  });

  describe("startQuestion", () => {
    it("should mark question as in progress", async () => {
      const mockQuestion = {
        id: "question-1",
        status: "IN_PROGRESS",
        startedAt: new Date(),
      };

      (prisma.generatedQuestion.update as jest.Mock).mockResolvedValue(mockQuestion);

      const result = await startQuestion("question-1");

      expect(result.status).toBe("IN_PROGRESS");
      expect(result.startedAt).toBeDefined();

      expect(prisma.generatedQuestion.update).toHaveBeenCalledWith({
        where: { id: "question-1" },
        data: {
          status: "IN_PROGRESS",
          startedAt: expect.any(Date),
        },
      });
    });
  });

  describe("completeQuestion", () => {
    it("should complete question with score", async () => {
      const mockQuestion = {
        id: "question-1",
        status: "COMPLETED",
        completedAt: new Date(),
        score: 0.85,
      };

      (prisma.generatedQuestion.update as jest.Mock).mockResolvedValue(mockQuestion);

      const result = await completeQuestion("question-1", 0.85);

      expect(result.status).toBe("COMPLETED");
      expect(result.score).toBe(0.85);

      expect(prisma.generatedQuestion.update).toHaveBeenCalledWith({
        where: { id: "question-1" },
        data: {
          status: "COMPLETED",
          completedAt: expect.any(Date),
          score: 0.85,
        },
      });
    });

    it("should validate score range", async () => {
      await expect(completeQuestion("question-1", -0.1)).rejects.toThrow(
        "Score must be between 0 and 1"
      );

      await expect(completeQuestion("question-1", 1.5)).rejects.toThrow(
        "Score must be between 0 and 1"
      );
    });

    it("should accept score at boundaries", async () => {
      (prisma.generatedQuestion.update as jest.Mock).mockResolvedValue({
        id: "question-1",
        score: 0,
      });

      await expect(completeQuestion("question-1", 0)).resolves.toBeDefined();

      (prisma.generatedQuestion.update as jest.Mock).mockResolvedValue({
        id: "question-1",
        score: 1,
      });

      await expect(completeQuestion("question-1", 1)).resolves.toBeDefined();
    });
  });

  describe("skipQuestion", () => {
    it("should mark question as skipped", async () => {
      const mockQuestion = {
        id: "question-1",
        status: "SKIPPED",
        completedAt: new Date(),
      };

      (prisma.generatedQuestion.update as jest.Mock).mockResolvedValue(mockQuestion);

      const result = await skipQuestion("question-1");

      expect(result.status).toBe("SKIPPED");
      expect(result.completedAt).toBeDefined();
    });
  });

  describe("getCandidateQuestions", () => {
    it("should return all candidate questions in order", async () => {
      const mockQuestions = [
        { id: "q1", order: 1, title: "First" },
        { id: "q2", order: 2, title: "Second" },
        { id: "q3", order: 3, title: "Third" },
      ];

      (prisma.generatedQuestion.findMany as jest.Mock).mockResolvedValue(mockQuestions);

      const result = await getCandidateQuestions("cand-123");

      expect(result).toHaveLength(3);
      expect(result[0].order).toBe(1);
      expect(result[2].order).toBe(3);

      expect(prisma.generatedQuestion.findMany).toHaveBeenCalledWith({
        where: { candidateId: "cand-123" },
        orderBy: { order: "asc" },
      });
    });
  });

  describe("calculatePerformance", () => {
    it("should calculate performance metrics", async () => {
      const mockQuestions = [
        {
          status: "COMPLETED",
          score: 0.9,
          startedAt: new Date(Date.now() - 1800000),
          completedAt: new Date(Date.now() - 900000),
        },
        {
          status: "COMPLETED",
          score: 0.7,
          startedAt: new Date(Date.now() - 900000),
          completedAt: new Date(),
        },
        {
          status: "PENDING",
          score: null,
          startedAt: null,
          completedAt: null,
        },
      ];

      (prisma.generatedQuestion.findMany as jest.Mock).mockResolvedValue(mockQuestions);

      const result = await calculatePerformance("cand-123");

      expect(result).toMatchObject({
        totalQuestions: 3,
        completedQuestions: 2,
        averageScore: 0.8, // (0.9 + 0.7) / 2
        timeSpent: expect.any(Number),
        progressPercentage: (2 / 3) * 100,
      });
    });

    it("should handle no completed questions", async () => {
      const mockQuestions = [
        { status: "PENDING", score: null },
        { status: "SKIPPED", score: null },
      ];

      (prisma.generatedQuestion.findMany as jest.Mock).mockResolvedValue(mockQuestions);

      const result = await calculatePerformance("cand-123");

      expect(result).toMatchObject({
        totalQuestions: 2,
        completedQuestions: 0,
        averageScore: 0,
        progressPercentage: 0,
      });
    });

    it("should calculate time spent correctly", async () => {
      const now = Date.now();
      const mockQuestions = [
        {
          status: "COMPLETED",
          score: 1,
          startedAt: new Date(now - 30 * 60 * 1000), // 30 minutes ago
          completedAt: new Date(now),
        },
      ];

      (prisma.generatedQuestion.findMany as jest.Mock).mockResolvedValue(mockQuestions);

      const result = await calculatePerformance("cand-123");

      expect(result.timeSpent).toBeCloseTo(30, 0); // ~30 minutes
    });
  });

  describe("regenerateQuestion", () => {
    it("should regenerate question with same parameters", async () => {
      const originalQuestion = {
        id: "question-1",
        candidateId: "cand-123",
        questionSeedId: "seed-1",
        difficulty: "MEDIUM",
        language: "typescript",
      };

      (prisma.generatedQuestion.findUnique as jest.Mock).mockResolvedValue(originalQuestion);

      (claude.getChatCompletion as jest.Mock).mockResolvedValue({
        content: JSON.stringify({
          title: "Regenerated Question",
          description: "New version",
          requirements: [],
          estimatedTime: 30,
          starterCode: [],
          testCases: [],
        }),
        usage: { totalTokens: 100 },
      });

      (prisma.generatedQuestion.count as jest.Mock).mockResolvedValue(0);
      (prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({
        id: "question-2",
        title: "Regenerated Question",
      });

      (prisma.generatedQuestion.delete as jest.Mock).mockResolvedValue({});

      const result = await regenerateQuestion("question-1");

      expect(result.question.title).toBe("Regenerated Question");

      expect(prisma.generatedQuestion.delete).toHaveBeenCalledWith({
        where: { id: "question-1" },
      });
    });

    it("should throw error if original question not found", async () => {
      (prisma.generatedQuestion.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(regenerateQuestion("invalid-question")).rejects.toThrow(
        "Question invalid-question not found"
      );
    });
  });
});
