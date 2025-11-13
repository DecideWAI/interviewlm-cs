/**
 * Integration Tests for Run Tests API
 */

import { POST } from "@/app/api/interview/[id]/run-tests/route";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

jest.mock("@/lib/prisma");
jest.mock("@/lib/auth-helpers", () => ({
  getSession: jest.fn(),
}));

import { getSession } from "@/lib/auth-helpers";

describe("POST /api/interview/[id]/run-tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSession as jest.Mock).mockResolvedValue({
      user: { id: "user-1" },
    });
  });

  const createRequest = (body: any) =>
    ({ json: async () => body } as NextRequest);

  const createParams = (id: string) => Promise.resolve({ id });

  it("should execute tests successfully", async () => {
    const mockCandidate = {
      id: "cand-123",
      organization: { members: [{ userId: "user-1" }] },
      sessionRecording: { id: "session-123" },
    };

    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
    (prisma.testResult.create as jest.Mock).mockResolvedValue({});
    (prisma.codeSnapshot.create as jest.Mock).mockResolvedValue({});

    const request = createRequest({
      code: "function add(a, b) { return a + b; }",
      language: "javascript",
      testCases: [
        {
          name: "test_add",
          input: "[2, 3]",
          expectedOutput: "5",
        },
      ],
    });

    const response = await POST(request, { params: createParams("cand-123") });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("passed");
    expect(data).toHaveProperty("failed");
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("results");
  });

  it("should return 401 if not authenticated", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);

    const request = createRequest({
      code: "code",
      language: "javascript",
      testCases: [],
    });

    const response = await POST(request, { params: createParams("cand-123") });
    expect(response.status).toBe(401);
  });

  it("should validate request body", async () => {
    const request = createRequest({
      code: "code",
      language: "invalid-language",
      testCases: [],
    });

    const response = await POST(request, { params: createParams("cand-123") });
    expect(response.status).toBe(400);
  });

  it("should record test results and code snapshot", async () => {
    const mockCandidate = {
      id: "cand-123",
      organization: { members: [{ userId: "user-1" }] },
      sessionRecording: { id: "session-123" },
    };

    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
    (prisma.testResult.create as jest.Mock).mockResolvedValue({});
    (prisma.codeSnapshot.create as jest.Mock).mockResolvedValue({});

    const request = createRequest({
      code: "code",
      language: "python",
      testCases: [{ name: "test1", input: "1", expectedOutput: "1" }],
      fileName: "solution.py",
    });

    await POST(request, { params: createParams("cand-123") });

    expect(prisma.testResult.create).toHaveBeenCalled();
    expect(prisma.codeSnapshot.create).toHaveBeenCalled();
  });
});
