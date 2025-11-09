/**
 * Integration Tests for Chat API
 * Tests streaming chat with Claude, authentication, and error handling
 */

import { POST } from "@/app/api/interview/[id]/chat/route";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

// Mock dependencies
jest.mock("@/lib/prisma");
jest.mock("@/lib/auth-helpers", () => ({
  getSession: jest.fn(),
}));
jest.mock("@anthropic-ai/sdk");

import { getSession } from "@/lib/auth-helpers";

describe("POST /api/interview/[id]/chat", () => {
  let mockAnthropicInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authenticated session
    (getSession as jest.Mock).mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    });

    // Mock Anthropic instance
    mockAnthropicInstance = {
      messages: {
        stream: jest.fn(),
      },
    };

    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () => mockAnthropicInstance
    );
  });

  const createRequest = (body: any, candidateId: string = "cand-123") => {
    return {
      json: async () => body,
    } as NextRequest;
  };

  const createParams = (id: string) => Promise.resolve({ id });

  it("should return 401 if not authenticated", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);

    const request = createRequest({ message: "Help me" });
    const response = await POST(request, { params: createParams("cand-123") });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid request body", async () => {
    const request = createRequest({ message: "" }); // Empty message

    const response = await POST(request, { params: createParams("cand-123") });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should return 404 if candidate not found", async () => {
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(null);

    const request = createRequest({ message: "Help me" });
    const response = await POST(request, { params: createParams("invalid-id") });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Interview session not found");
  });

  it("should return 403 if user not member of organization", async () => {
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue({
      id: "cand-123",
      organization: {
        members: [], // No members = not authorized
      },
    });

    const request = createRequest({ message: "Help me" });
    const response = await POST(request, { params: createParams("cand-123") });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Forbidden");
  });

  it("should stream chat response successfully", async () => {
    const mockCandidate = {
      id: "cand-123",
      organization: {
        members: [{ userId: "user-1" }],
      },
      sessionRecording: {
        id: "session-123",
      },
    };

    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
    (prisma.claudeInteraction.create as jest.Mock).mockResolvedValue({
      id: "interaction-1",
    });
    (prisma.claudeInteraction.update as jest.Mock).mockResolvedValue({});

    // Mock streaming response
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "message_start",
          message: { usage: { input_tokens: 100 } },
        };
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Here's " },
        };
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "how to solve it" },
        };
        yield {
          type: "message_delta",
          delta: { usage: { output_tokens: 50 } },
        };
      },
    };

    mockAnthropicInstance.messages.stream.mockResolvedValue(mockStream);

    const request = createRequest({
      message: "How do I solve this problem?",
      codeContext: {
        fileName: "solution.js",
        content: "function add(a, b) {}",
        language: "javascript",
      },
    });

    const response = await POST(request, { params: createParams("cand-123") });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Verify Claude interactions were recorded
    expect(prisma.claudeInteraction.create).toHaveBeenCalledTimes(2); // User + Assistant
  });

  it("should create session recording if not exists", async () => {
    const mockCandidate = {
      id: "cand-123",
      organization: {
        members: [{ userId: "user-1" }],
      },
      sessionRecording: null, // No existing session
    };

    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
    (prisma.sessionRecording.create as jest.Mock).mockResolvedValue({
      id: "new-session-123",
      candidateId: "cand-123",
      status: "ACTIVE",
    });

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello" },
        };
      },
    };

    mockAnthropicInstance.messages.stream.mockResolvedValue(mockStream);

    const request = createRequest({ message: "Help" });
    await POST(request, { params: createParams("cand-123") });

    expect(prisma.sessionRecording.create).toHaveBeenCalledWith({
      data: {
        candidateId: "cand-123",
        status: "ACTIVE",
      },
    });
  });

  it("should calculate prompt quality", async () => {
    const mockCandidate = {
      id: "cand-123",
      organization: {
        members: [{ userId: "user-1" }],
      },
      sessionRecording: { id: "session-123" },
    };

    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);

    let capturedInteraction: any;
    (prisma.claudeInteraction.create as jest.Mock).mockResolvedValue({
      id: "interaction-1",
    });
    (prisma.claudeInteraction.update as jest.Mock).mockImplementation((args) => {
      capturedInteraction = args;
      return Promise.resolve({});
    });

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Response" },
        };
      },
    };

    mockAnthropicInstance.messages.stream.mockResolvedValue(mockStream);

    const request = createRequest({
      message: "How do I implement this function to solve the problem?",
      codeContext: {
        content: "code here",
      },
    });

    await POST(request, { params: createParams("cand-123") });

    expect(prisma.claudeInteraction.update).toHaveBeenCalled();
    expect(capturedInteraction.data.promptQuality).toBeGreaterThan(0);
  });
});
