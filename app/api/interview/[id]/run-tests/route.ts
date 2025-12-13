import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { modalService as modal, sessionService as sessions } from "@/lib/services";
import Anthropic from "@anthropic-ai/sdk";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { strictRateLimit } from "@/lib/middleware/rate-limit";

// Initialize Anthropic client with caching beta
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  defaultHeaders: {
    "anthropic-beta": "prompt-caching-2024-07-31",
  },
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
 * NOTE: Uses strict rate limiting (5 req/min) due to expensive code execution
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  // Await params (Next.js 15 requirement)
  const { id } = await params;

  // Apply STRICT rate limiting (expensive operation - code execution)
  const rateLimited = await strictRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  // Parse and validate request body
  const body = await request.json();
  logger.debug("[RunTests] Request received", { candidateId: id, language: body.language });

  const validationResult = runTestsRequestSchema.safeParse(body);

  if (!validationResult.success) {
    logger.warn("[RunTests] Validation failed", {
      candidateId: id,
      errors: validationResult.error.errors,
    });
    throw new ValidationError("Invalid request: " + validationResult.error.errors.map(e => e.message).join(", "));
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
    throw new NotFoundError("Interview session", id);
  }

  // Check authorization (user must be member of candidate's organization)
  // OR candidate is interviewing themselves (candidate.email === session.user.email)
  const isOrgMember = candidate.organization.members.length > 0;
  const isSelfInterview = candidate.email === session.user.email;

  if (!isOrgMember && !isSelfInterview) {
    throw new AuthorizationError("Access denied to this interview session");
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
        logger.info('[RunTests] Using AI evaluation for backend question', {
          candidateId: id,
          questionId,
        });
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
    throw new ValidationError("No test cases found for this question");
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
    throw new ValidationError("Sandbox not initialized. Please refresh the interview.");
  }

    // Write code to sandbox volume before running tests
    // IMPORTANT: Use candidateId (not volumeId) for sandbox lookup - Modal caches by candidateId
    const fileToWrite = fileName || `solution.${language === "python" ? "py" : "js"}`;
    await modal.writeFile(id, fileToWrite, code);

    // Record test_run_start event
    await sessions.recordEvent(
      sessionRecording.id,
      "test.run_start",
      "USER", // User triggered the test run
      {
        testCount: resolvedTestCases.length,
        language,
        fileName: fileToWrite,
        timestamp: new Date().toISOString(),
      }
    );

    // Execute tests in Modal sandbox with performance timing
    const executionResult = await logger.time(
      'executeCode',
      () => modal.executeCode(
        id, // session ID (candidate ID)
        code,
        resolvedTestCases.map(tc => ({
          name: tc.name,
          input: tc.input,
          expected: tc.expectedOutput,
          hidden: tc.hidden || false,
        }))
      ),
      { candidateId: id, testCount: resolvedTestCases.length, language }
    );

    const executionTime = Date.now() - executionStart;

    // Get next sequence number for events
    const lastEvent = await prisma.sessionEventLog.findFirst({
      where: { sessionId: sessionRecording.id },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });
    let nextSeq = (lastEvent?.sequenceNumber ?? BigInt(-1)) + BigInt(1);

    // Record test results to event store
    for (const result of executionResult.testResults) {
      await prisma.sessionEventLog.create({
        data: {
          sessionId: sessionRecording.id,
          sequenceNumber: nextSeq++,
          timestamp: new Date(),
          eventType: "test.result",
          category: "test",
          data: {
            testName: result.name,
            passed: result.passed,
            output: result.output || null,
            error: result.error || null,
            duration: result.duration,
          },
          checkpoint: false,
        },
      });
    }

    // Record code snapshot
    await prisma.sessionEventLog.create({
      data: {
        sessionId: sessionRecording.id,
        sequenceNumber: nextSeq++,
        timestamp: new Date(),
        eventType: "code.snapshot",
        category: "code",
        filePath: fileName || "main",
        data: {
          fileName: fileName || "main",
          language,
          contentHash: hashCode(code),
          fullContent: code,
        },
        checkpoint: false,
      },
    });

    // Log successful test execution
    logger.info('[RunTests] Tests executed', {
      candidateId: id,
      passed: executionResult.passedTests,
      failed: executionResult.failedTests,
      total: executionResult.totalTests,
      executionTime,
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

    return success(response);
});

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
    logger.info('[AI Evaluation] Starting evaluation', {
      candidateId: id,
      questionTitle: questionDetails.title,
      language,
    });

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

    // Use Claude to evaluate the code with performance timing
    const evaluation = await logger.time(
      'claudeEvaluation',
      () => anthropic.messages.create({
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
    }),
      { candidateId: id, questionTitle: questionDetails.title, language }
    );

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

    logger.info('[AI Evaluation] Evaluation completed', {
      candidateId: id,
      overallScore: aiResult.overallScore,
      passed: aiResult.passed,
      evaluationTime,
    });

    // Get next sequence number for event
    const lastEventForAI = await prisma.sessionEventLog.findFirst({
      where: { sessionId: recording.id },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });
    const nextSeqForAI = (lastEventForAI?.sequenceNumber ?? BigInt(-1)) + BigInt(1);

    // Record code snapshot
    await prisma.sessionEventLog.create({
      data: {
        sessionId: recording.id,
        sequenceNumber: nextSeqForAI,
        timestamp: new Date(),
        eventType: "code.snapshot",
        category: "code",
        filePath: fileName || "main",
        data: {
          fileName: fileName || "main",
          language,
          contentHash: hashCode(code),
          fullContent: code,
        },
        checkpoint: false,
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
    logger.error('[AI Evaluation] Error', error as Error, {
      candidateId: id,
      questionTitle: questionDetails.title,
    });
    throw error; // Re-throw to be handled by withErrorHandling
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
