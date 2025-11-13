/**
 * Unit Tests for Claude AI Service
 * Tests streaming, non-streaming chat, token tracking, and error handling
 */

import {
  streamChatCompletion,
  getChatCompletion,
  testConnection,
  CURRENT_MODEL,
} from "@/lib/services/claude";
import Anthropic from "@anthropic-ai/sdk";

// Mock the Anthropic SDK
jest.mock("@anthropic-ai/sdk");

describe("Claude AI Service", () => {
  let mockAnthropicInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mock environment
    process.env.ANTHROPIC_API_KEY = "test-api-key";

    // Create mock Anthropic instance
    mockAnthropicInstance = {
      messages: {
        create: jest.fn(),
        stream: jest.fn(),
      },
    };

    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () => mockAnthropicInstance
    );
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe("testConnection", () => {
    it("should return true on successful connection", async () => {
      mockAnthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: "text", text: "Hello!" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await testConnection();

      expect(result).toBe(true);
      expect(mockAnthropicInstance.messages.create).toHaveBeenCalledWith({
        model: CURRENT_MODEL,
        max_tokens: 50,
        messages: [{ role: "user", content: "Hello!" }],
      });
    });

    it("should return false on connection failure", async () => {
      mockAnthropicInstance.messages.create.mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await testConnection();

      expect(result).toBe(false);
    });

    it("should throw error if API key is missing", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(testConnection()).rejects.toThrow(
        "ANTHROPIC_API_KEY environment variable is not set"
      );
    });
  });

  describe("getChatCompletion", () => {
    const mockMessages = [
      { role: "user" as const, content: "How do I solve this problem?" },
    ];

    const mockContext = {
      problemTitle: "Two Sum",
      problemDescription: "Find two numbers that add up to target",
      language: "javascript",
      currentCode: "function twoSum(nums, target) {}",
    };

    it("should get complete chat response successfully", async () => {
      const mockResponse = {
        content: [
          { type: "text", text: "Here's how to solve it..." },
        ],
        usage: {
          input_tokens: 150,
          output_tokens: 300,
        },
        stop_reason: "end_turn",
      };

      mockAnthropicInstance.messages.create.mockResolvedValue(mockResponse);

      const result = await getChatCompletion(mockMessages, mockContext);

      expect(result).toMatchObject({
        content: "Here's how to solve it...",
        usage: {
          inputTokens: 150,
          outputTokens: 300,
          totalTokens: 450,
          estimatedCost: expect.any(Number),
        },
        stopReason: "end_turn",
        latency: expect.any(Number),
      });

      expect(mockAnthropicInstance.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: CURRENT_MODEL,
          max_tokens: 4096,
          temperature: 0.7,
          system: expect.stringContaining("Two Sum"),
          messages: mockMessages,
        })
      );
    });

    it("should calculate cost correctly", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Response" }],
        usage: {
          input_tokens: 1000000, // 1M tokens
          output_tokens: 1000000, // 1M tokens
        },
        stop_reason: "end_turn",
      };

      mockAnthropicInstance.messages.create.mockResolvedValue(mockResponse);

      const result = await getChatCompletion(mockMessages, mockContext);

      // Cost should be: (1M / 1M) * $3 + (1M / 1M) * $15 = $18
      expect(result.usage.estimatedCost).toBeCloseTo(18, 2);
    });

    it("should handle multiple text blocks in response", async () => {
      const mockResponse = {
        content: [
          { type: "text", text: "First part. " },
          { type: "text", text: "Second part." },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      };

      mockAnthropicInstance.messages.create.mockResolvedValue(mockResponse);

      const result = await getChatCompletion(mockMessages, mockContext);

      expect(result.content).toBe("First part. \nSecond part.");
    });

    it("should validate message format", async () => {
      const invalidMessages = [
        { role: "invalid", content: "test" }, // Invalid role
      ];

      await expect(
        getChatCompletion(invalidMessages as any, mockContext)
      ).rejects.toThrow();
    });

    it("should validate context format", async () => {
      const invalidContext = {
        problemTitle: "Test",
        // Missing required fields
      };

      await expect(
        getChatCompletion(mockMessages, invalidContext as any)
      ).rejects.toThrow();
    });

    it("should handle API errors gracefully", async () => {
      mockAnthropicInstance.messages.create.mockRejectedValue(
        new Error("Rate limit exceeded")
      );

      await expect(
        getChatCompletion(mockMessages, mockContext)
      ).rejects.toThrow("Claude API request failed: Rate limit exceeded");
    });

    it("should include test results in system prompt when provided", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Response" }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      };

      mockAnthropicInstance.messages.create.mockResolvedValue(mockResponse);

      const contextWithTests = {
        ...mockContext,
        testResults: "Test 1: PASSED\nTest 2: FAILED - Expected 5, got 3",
      };

      await getChatCompletion(mockMessages, contextWithTests);

      const callArgs = mockAnthropicInstance.messages.create.mock.calls[0][0];
      expect(callArgs.system).toContain("Recent Test Results:");
      expect(callArgs.system).toContain("Test 1: PASSED");
    });
  });

  describe("streamChatCompletion", () => {
    const mockMessages = [
      { role: "user" as const, content: "Explain this algorithm" },
    ];

    const mockContext = {
      problemTitle: "Binary Search",
      problemDescription: "Implement binary search",
      language: "python",
    };

    it("should stream chat completion chunks", async () => {
      const mockChunks = [
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Binary " },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "search " },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "works..." },
        },
      ];

      const mockFinalMessage = {
        usage: {
          input_tokens: 200,
          output_tokens: 150,
        },
        stop_reason: "end_turn",
      };

      // Create async iterator mock
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
        finalMessage: jest.fn().mockResolvedValue(mockFinalMessage),
      };

      mockAnthropicInstance.messages.stream.mockResolvedValue(mockStream);

      const chunks: any[] = [];
      for await (const chunk of streamChatCompletion(mockMessages, mockContext)) {
        chunks.push(chunk);
      }

      // Should have 3 content chunks + 1 completion chunk
      expect(chunks).toHaveLength(4);

      // Content chunks
      expect(chunks[0]).toEqual({ content: "Binary ", done: false });
      expect(chunks[1]).toEqual({ content: "search ", done: false });
      expect(chunks[2]).toEqual({ content: "works...", done: false });

      // Completion chunk
      expect(chunks[3]).toMatchObject({
        content: "",
        done: true,
        usage: {
          inputTokens: 200,
          outputTokens: 150,
          totalTokens: 350,
          estimatedCost: expect.any(Number),
        },
        stopReason: "end_turn",
      });
    });

    it("should filter non-text-delta chunks", async () => {
      const mockChunks = [
        { type: "message_start", message: {} },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello" },
        },
        { type: "content_block_stop" },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: " world" },
        },
      ];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
        finalMessage: jest.fn().mockResolvedValue({
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: "end_turn",
        }),
      };

      mockAnthropicInstance.messages.stream.mockResolvedValue(mockStream);

      const chunks: any[] = [];
      for await (const chunk of streamChatCompletion(mockMessages, mockContext)) {
        chunks.push(chunk);
      }

      // Should only have 2 text chunks + completion
      const contentChunks = chunks.filter((c) => !c.done);
      expect(contentChunks).toHaveLength(2);
      expect(contentChunks[0].content).toBe("Hello");
      expect(contentChunks[1].content).toBe(" world");
    });

    it("should handle streaming errors", async () => {
      mockAnthropicInstance.messages.stream.mockRejectedValue(
        new Error("Streaming failed")
      );

      const generator = streamChatCompletion(mockMessages, mockContext);

      await expect(generator.next()).rejects.toThrow(
        "Claude API streaming failed: Streaming failed"
      );
    });

    it("should validate messages before streaming", async () => {
      const invalidMessages = [
        { role: "wrong_role", content: "test" },
      ];

      const generator = streamChatCompletion(invalidMessages as any, mockContext);

      await expect(generator.next()).rejects.toThrow();
    });
  });

  describe("Token Cost Calculation", () => {
    it("should calculate cost for various token amounts", () => {
      const testCases = [
        { input: 0, output: 0, expected: 0 },
        { input: 100, output: 100, expected: 0.0018 }, // (100/1M)*3 + (100/1M)*15
        { input: 10000, output: 5000, expected: 0.105 }, // (10k/1M)*3 + (5k/1M)*15
        { input: 1000000, output: 1000000, expected: 18 }, // (1M/1M)*3 + (1M/1M)*15
      ];

      testCases.forEach(async ({ input, output, expected }) => {
        const mockResponse = {
          content: [{ type: "text", text: "Response" }],
          usage: {
            input_tokens: input,
            output_tokens: output,
          },
          stop_reason: "end_turn",
        };

        mockAnthropicInstance.messages.create.mockResolvedValue(mockResponse);

        const result = await getChatCompletion(
          [{ role: "user", content: "test" }],
          {
            problemTitle: "Test",
            problemDescription: "Test problem",
            language: "javascript",
          }
        );

        expect(result.usage.estimatedCost).toBeCloseTo(expected, 4);
      });
    });
  });

  describe("System Prompt Building", () => {
    it("should include all context in system prompt", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Response" }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      };

      mockAnthropicInstance.messages.create.mockResolvedValue(mockResponse);

      const fullContext = {
        problemTitle: "Palindrome Checker",
        problemDescription: "Check if a string is a palindrome",
        language: "typescript",
        starterCode: "function isPalindrome(s: string): boolean {}",
        currentCode: "function isPalindrome(s: string): boolean { return false; }",
        testResults: "Test 1: FAILED",
      };

      await getChatCompletion(
        [{ role: "user", content: "Help me" }],
        fullContext
      );

      const callArgs = mockAnthropicInstance.messages.create.mock.calls[0][0];
      const systemPrompt = callArgs.system;

      expect(systemPrompt).toContain("Palindrome Checker");
      expect(systemPrompt).toContain("Check if a string is a palindrome");
      expect(systemPrompt).toContain("typescript");
      expect(systemPrompt).toContain("Starter Code");
      expect(systemPrompt).toContain("Current Code");
      expect(systemPrompt).toContain("Recent Test Results");
      expect(systemPrompt).toContain("Test 1: FAILED");
    });

    it("should handle minimal context", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Response" }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      };

      mockAnthropicInstance.messages.create.mockResolvedValue(mockResponse);

      const minimalContext = {
        problemTitle: "Simple Problem",
        problemDescription: "Solve it",
        language: "javascript",
      };

      await getChatCompletion(
        [{ role: "user", content: "Help" }],
        minimalContext
      );

      const callArgs = mockAnthropicInstance.messages.create.mock.calls[0][0];
      const systemPrompt = callArgs.system;

      expect(systemPrompt).toContain("Simple Problem");
      expect(systemPrompt).toContain("Solve it");
      expect(systemPrompt).not.toContain("Starter Code");
      expect(systemPrompt).not.toContain("Current Code");
      expect(systemPrompt).not.toContain("Recent Test Results");
    });
  });
});
