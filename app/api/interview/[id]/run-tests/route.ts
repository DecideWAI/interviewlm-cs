import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { modal, sessions } from "@/lib/services";

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

    // Get volumeId from candidate
    if (!candidate.volumeId) {
      return NextResponse.json(
        { error: "Sandbox not initialized. Please refresh the interview." },
        { status: 400 }
      );
    }

    // Write code to sandbox volume before running tests
    const fileToWrite = fileName || `solution.${language === "python" ? "py" : "js"}`;
    await modal.writeFile(candidate.volumeId, fileToWrite, code);

    // Record test_run_start event
    await sessions.recordEvent(sessionRecording.id, {
      type: "test_run_start",
      data: {
        testCount: testCases.length,
        language,
        fileName: fileToWrite,
        timestamp: new Date().toISOString(),
      },
    });

    // Execute tests in Modal sandbox
    const executionResult = await modal.executeCode(
      id, // session ID (candidate ID)
      code,
      testCases.map(tc => ({
        name: tc.name,
        input: tc.input,
        expected: tc.expectedOutput,
        hidden: tc.hidden || false,
      }))
    );

    const executionTime = Date.now() - executionStart;

    // Record test results to database
    const testResultPromises = executionResult.testResults.map((result) =>
      prisma.testResult.create({
        data: {
          sessionId: sessionRecording.id,
          testName: result.name,
          passed: result.passed,
          output: result.output || null,
          error: result.error || null,
          duration: result.duration,
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
      passed: executionResult.passedTests,
      failed: executionResult.failedTests,
      total: executionResult.totalTests,
      results: executionResult.testResults.map(tr => ({
        name: tr.name,
        passed: tr.passed,
        actualOutput: tr.output,
        expectedOutput: testCases.find(tc => tc.name === tr.name)?.expectedOutput || "",
        error: tr.error,
        duration: tr.duration,
      })),
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
