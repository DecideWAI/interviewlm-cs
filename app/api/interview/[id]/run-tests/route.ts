import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

// Request validation schema
const runTestsRequestSchema = z.object({
  code: z.string().min(1, "Code is required"),
  language: z.enum(["javascript", "typescript", "python", "go"], {
    errorMap: () => ({ message: "Unsupported language" }),
  }),
  testCases: z.array(
    z.object({
      name: z.string(),
      input: z.string(),
      expectedOutput: z.string(),
      hidden: z.boolean().optional(),
    })
  ),
  fileName: z.string().optional(),
  questionId: z.string().optional(),
});

// Test result type
interface TestCaseResult {
  name: string;
  passed: boolean;
  actualOutput?: string;
  expectedOutput: string;
  error?: string;
  duration?: number;
}

interface ExecutionResponse {
  passed: number;
  failed: number;
  total: number;
  results: TestCaseResult[];
  executionTime: number;
  error?: string;
}

/**
 * POST /api/interview/[id]/run-tests
 * Execute code in Modal AI Sandbox and return test results
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = runTestsRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { code, language, testCases, fileName, questionId } =
      validationResult.data;

    // Verify candidate exists and belongs to authorized organization
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        sessionRecording: true,
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization
    if (candidate.organization.members.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get or create session recording
    let sessionRecording = candidate.sessionRecording;
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId: id,
          status: "ACTIVE",
        },
      });
    }

    // Execute code in Modal sandbox
    const executionStart = Date.now();
    const executionResult = await executeInModalSandbox(
      code,
      language,
      testCases
    );
    const executionTime = Date.now() - executionStart;

    // Record test results to database
    const testResultPromises = executionResult.results.map((result) =>
      prisma.testResult.create({
        data: {
          sessionId: sessionRecording.id,
          testName: result.name,
          passed: result.passed,
          output: result.actualOutput || null,
          error: result.error || null,
          duration: result.duration || executionTime,
        },
      })
    );

    await Promise.all(testResultPromises);

    // Record code snapshot
    await prisma.codeSnapshot.create({
      data: {
        sessionId: sessionRecording.id,
        fileId: fileName || "main",
        fileName: fileName || "main",
        language,
        contentHash: hashCode(code),
        fullContent: code,
      },
    });

    // Return execution results
    const response: ExecutionResponse = {
      passed: executionResult.passed,
      failed: executionResult.failed,
      total: executionResult.total,
      results: executionResult.results,
      executionTime,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Run tests API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Execute code in Modal AI Sandbox
 * This is a placeholder that should be replaced with actual Modal integration
 */
async function executeInModalSandbox(
  code: string,
  language: string,
  testCases: Array<{
    name: string;
    input: string;
    expectedOutput: string;
    hidden?: boolean;
  }>
): Promise<{
  passed: number;
  failed: number;
  total: number;
  results: TestCaseResult[];
}> {
  // TODO: Replace with actual Modal sandbox execution
  // For now, this is a mock implementation

  const modalApiUrl = process.env.MODAL_API_URL || "https://modal.ai/api/execute";
  const modalApiKey = process.env.MODAL_API_KEY;

  if (!modalApiKey) {
    console.warn("MODAL_API_KEY not set, using mock execution");
    return mockExecution(code, language, testCases);
  }

  try {
    const response = await fetch(modalApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modalApiKey}`,
      },
      body: JSON.stringify({
        code,
        language,
        testCases,
        timeout: 30000, // 30 seconds
      }),
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Modal sandbox execution error:", error);
    // Fallback to mock execution
    return mockExecution(code, language, testCases);
  }
}

/**
 * Mock execution for development/testing
 */
function mockExecution(
  code: string,
  language: string,
  testCases: Array<{
    name: string;
    input: string;
    expectedOutput: string;
    hidden?: boolean;
  }>
): {
  passed: number;
  failed: number;
  total: number;
  results: TestCaseResult[];
} {
  const results: TestCaseResult[] = testCases.map((testCase) => {
    // Simple mock: randomly pass or fail tests
    const passed = Math.random() > 0.3; // 70% pass rate for demo

    return {
      name: testCase.name,
      passed,
      actualOutput: passed
        ? testCase.expectedOutput
        : "Mock output (different from expected)",
      expectedOutput: testCase.expectedOutput,
      error: passed ? undefined : "Mock execution error",
      duration: Math.floor(Math.random() * 100) + 50,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    passed,
    failed,
    total: testCases.length,
    results,
  };
}

/**
 * Simple hash function for code content
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}
