import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { modalService as modal, sessionService as sessions } from "@/lib/services";
import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

// Request validation schema
const runTestsRequestSchema = z.object({
  code: z.string().min(1, "Code is required"),
  language: z.enum(["javascript", "typescript", "python", "go", "node.js"], {
    errorMap: () => ({ message: "Unsupported language" }),
  }),
  testCases: z.array(
    z.object({
      name: z.string(),
      input: z.string(),
      expectedOutput: z.string(),
      hidden: z.boolean().optional(),
    })
  ).optional(), // Make testCases optional - will fetch from DB if not provided
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
    console.log("[RunTests] Request body:", JSON.stringify(body, null, 2));

    const validationResult = runTestsRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error("[RunTests] Validation error:", JSON.stringify(validationResult.error.errors, null, 2));
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

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch question details for AI evaluation or test cases
    let questionDetails = null;
    let resolvedTestCases = testCases;

    if (questionId) {
      questionDetails = await prisma.generatedQuestion.findUnique({
        where: { id: questionId },
        select: {
          title: true,
          description: true,
          requirements: true,
          difficulty: true,
          testCases: true
        },
      });

      // For backend questions, use AI evaluation instead of tests
      const isBackendQuestion = questionDetails?.requirements?.some((req: string) =>
        req.toLowerCase().includes('api') ||
        req.toLowerCase().includes('endpoint') ||
        req.toLowerCase().includes('rest') ||
        req.toLowerCase().includes('http') ||
        req.toLowerCase().includes('auth')
      ) || false;

      if (isBackendQuestion && questionDetails) {
        console.log('[RunTests] Detected backend question, using AI evaluation');
        return await evaluateWithAI({
          id,
          code,
          language,
          fileName,
          questionDetails,
          sessionRecording: candidate.sessionRecording,
        });
      }

      // For traditional algorithm questions, use test cases
      if (questionDetails && Array.isArray(questionDetails.testCases)) {
        resolvedTestCases = questionDetails.testCases.map((tc: any) => {
          const expectedValue = tc.expectedOutput || tc.expected;
          return {
            name: tc.name || "",
            input: typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input),
            expectedOutput: typeof expectedValue === 'object' ? JSON.stringify(expectedValue) : String(expectedValue),
            hidden: tc.hidden || false,
          };
        });
      }
    }

    // Validate that we have test cases for traditional problems
    if (!resolvedTestCases || resolvedTestCases.length === 0) {
      return NextResponse.json(
        { error: "No test cases found for this question" },
        { status: 400 }
      );
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
        testCount: resolvedTestCases.length,
        language,
        fileName: fileToWrite,
        timestamp: new Date().toISOString(),
      },
    });

    // Execute tests in Modal sandbox
    const executionResult = await modal.executeCode(
      id, // session ID (candidate ID)
      code,
      resolvedTestCases.map(tc => ({
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
        expectedOutput: resolvedTestCases.find(tc => tc.name === tr.name)?.expectedOutput || "",
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
 * AI-based code evaluation for real-world scenarios
 */
async function evaluateWithAI(params: {
  id: string;
  code: string;
  language: string;
  fileName: string | undefined;
  questionDetails: any;
  sessionRecording: any;
}) {
  const { id, code, language, fileName, questionDetails, sessionRecording } = params;

  try {
    console.log('[AI Evaluation] Starting evaluation for:', questionDetails.title);

    // Create or get session recording
    let recording = sessionRecording;
    if (!recording) {
      recording = await prisma.sessionRecording.create({
        data: {
          candidateId: id,
          status: "ACTIVE",
        },
      });
    }

    const evaluationStart = Date.now();

    // Use Claude to evaluate the code
    const evaluation = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Evaluate this backend code implementation:

**Task:** ${questionDetails.title}
**Difficulty:** ${questionDetails.difficulty}

**Requirements:**
${questionDetails.requirements.join('\n- ')}

**Candidate's Code:**
\`\`\`${language}
${code}
\`\`\`

Evaluate on a scale of 0-10 for each criterion:
1. **Requirement Coverage**: Does it implement all requirements?
2. **Code Quality**: Clean, readable, maintainable code?
3. **Security**: Proper validation, authentication, error handling?
4. **Best Practices**: Follows ${language} and backend conventions?
5. **Completeness**: Production-ready or needs major work?

Return ONLY valid JSON (no markdown):
{
  "scores": {
    "requirements": 0-10,
    "quality": 0-10,
    "security": 0-10,
    "practices": 0-10,
    "completeness": 0-10
  },
  "overallScore": 0-100,
  "passed": boolean (true if overallScore >= 70),
  "feedback": "Detailed feedback on what to improve",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}`
      }]
    });

    const evaluationTime = Date.now() - evaluationStart;

    // Parse AI response
    const content = evaluation.content[0];
    let aiResult: {
      scores: Record<string, number>;
      overallScore: number;
      passed: boolean;
      feedback: string;
      strengths: string[];
      improvements: string[];
    };

    if (content.type === "text") {
      // Extract JSON from response (handle markdown code blocks)
      const text = content.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI response did not contain valid JSON");
      }
    } else {
      throw new Error("Unexpected content type from AI");
    }

    console.log('[AI Evaluation] Result:', aiResult.overallScore, '/', 100);

    // Record code snapshot
    await prisma.codeSnapshot.create({
      data: {
        sessionId: recording.id,
        fileId: fileName || "main",
        fileName: fileName || "main",
        language,
        contentHash: hashCode(code),
        fullContent: code,
      },
    });

    // Record AI evaluation as test results
    const criteriaResults = Object.entries(aiResult.scores).map(([criterion, score]: [string, any]) => ({
      name: criterion,
      passed: score >= 7,
      output: `Score: ${score}/10`,
      expectedOutput: "7/10 or higher",
      duration: evaluationTime / Object.keys(aiResult.scores).length,
    }));

    // Return formatted response compatible with existing UI
    return NextResponse.json({
      passed: criteriaResults.filter(r => r.passed).length,
      failed: criteriaResults.filter(r => !r.passed).length,
      total: criteriaResults.length,
      results: criteriaResults,
      executionTime: evaluationTime,
      // Additional AI feedback
      aiEvaluation: {
        overallScore: aiResult.overallScore,
        passed: aiResult.passed,
        feedback: aiResult.feedback,
        strengths: aiResult.strengths,
        improvements: aiResult.improvements,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('[AI Evaluation] Error:', error);
    return NextResponse.json(
      {
        error: "AI evaluation failed",
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
