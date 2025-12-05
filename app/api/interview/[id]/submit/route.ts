import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { modalService as modal, sessionService as sessions } from "@/lib/services";
import {
  calculateOverallScore,
  calculateAICollaborationScore,
  detectRedFlags,
  detectGreenFlags,
  generateHiringRecommendation,
  calculatePercentileRank,
} from "@/lib/scoring";
import { CandidateProfile } from "@/types/analytics";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pako from "pako";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

// Request validation schema
const submitRequestSchema = z.object({
  finalCode: z.record(z.string()).optional(), // fileName -> code
  notes: z.string().optional(),
});

// Initialize S3 client for session storage
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * POST /api/interview/[id]/submit
 * Finalize assessment, calculate scores, and generate hiring recommendation
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  // Await params (Next.js 15 requirement)
  const { id } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  // Parse and validate request body
  const body = await request.json();
  const validationResult = submitRequestSchema.safeParse(body);

  if (!validationResult.success) {
    logger.warn('[Submit] Validation failed', {
      candidateId: id,
      errors: validationResult.error.errors,
    });
    throw new ValidationError("Invalid request: " + validationResult.error.errors.map(e => e.message).join(", "));
  }

  const { finalCode, notes } = validationResult.data;

  logger.info('[Submit] Starting submission', { candidateId: id, userId: session.user.id });

    // Fetch candidate with all related data
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
        assessment: true,
        sessionRecording: {
          include: {
            events: true,
            claudeInteractions: true,
            testResults: true,
            codeSnapshots: true,
          },
        },
        generatedQuestions: true,
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

    // Check if already completed
    if (candidate.status === "COMPLETED" || candidate.status === "EVALUATED") {
      throw new ValidationError("Assessment already submitted");
    }

    if (!candidate.sessionRecording) {
      throw new ValidationError("No session recording found");
    }

    const sessionRecording = candidate.sessionRecording;

    // Run final test execution to ensure we have latest results
    let finalTestResults: any = null;
    const firstQuestion = candidate.generatedQuestions?.[0];
    if (candidate.volumeId && firstQuestion) {
      try {
        // Read final code from Modal volume
        // IMPORTANT: Use candidateId (not volumeId) for sandbox lookup - Modal caches by candidateId
        const fileName = `solution.${firstQuestion.language === "python" ? "py" : "js"}`;
        let finalCodeContent = finalCode?.[fileName];
        if (!finalCodeContent) {
          const readResult = await modal.readFile(id, fileName);
          finalCodeContent = readResult.success ? readResult.content || '' : '';
        }

        // Run final tests
        const testCases = firstQuestion.testCases as Array<{
          name: string;
          input: string;
          expectedOutput: string;
          hidden?: boolean;
        }>;

        if (testCases && testCases.length > 0) {
          finalTestResults = await logger.time(
            'executeFinalTests',
            () => modal.executeCode(
              id,
              finalCodeContent,
              testCases.map(tc => ({
                name: tc.name,
                input: tc.input,
                expected: tc.expectedOutput,
                hidden: tc.hidden || false,
              }))
            ),
            { candidateId: id, testCount: testCases.length }
          );

          // Record final test results
          const testResultPromises = finalTestResults.testResults.map((result: any) =>
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
        }
      } catch (error) {
        logger.warn("Error running final tests", {
          candidateId: id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with submission even if final test execution fails
      }
    }

    // Calculate metrics
    const metrics = calculateSessionMetrics(candidate, sessionRecording, finalTestResults);

    // Build candidate profile for scoring
    const candidateProfile: CandidateProfile = {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      appliedRole: candidate.assessment.role as any,
      targetSeniority: mapSeniorityToType(candidate.assessment.seniority),
      status: "assessment_completed",
      stage: "assessment",
      assessmentId: candidate.assessmentId,
      sessionId: sessionRecording.id,
      assessmentCompleted: true,
      topStrengths: [],
      areasForImprovement: [],
      redFlags: [],
      greenFlags: [],
      appliedAt: candidate.createdAt.toISOString(),
      invitedAt: candidate.invitedAt.toISOString(),
      assessmentStartedAt: candidate.startedAt?.toISOString(),
      lastActivityAt: new Date().toISOString(),
      ...metrics,
    };

    // Detect flags
    const redFlags = detectRedFlags(candidateProfile);
    const greenFlags = detectGreenFlags(candidateProfile);
    candidateProfile.redFlags = redFlags;
    candidateProfile.greenFlags = greenFlags;

    // Calculate scores
    const seniority = mapSeniorityToType(candidate.assessment.seniority);
    const aiCollaborationScore = calculateAICollaborationScore(candidateProfile);
    candidateProfile.aiCollaborationScore = aiCollaborationScore.overall;

    // For now, use simple scoring for technical, code quality, and problem solving
    // These would be calculated from actual test results and code analysis
    candidateProfile.technicalScore = metrics.testsPassed
      ? (metrics.testsPassed / (metrics.testsPassed + (metrics.testsFailed || 0))) * 100
      : 50;
    candidateProfile.codeQualityScore = calculateCodeQualityScore(sessionRecording);
    candidateProfile.problemSolvingScore = metrics.completionRate
      ? metrics.completionRate * 100
      : 50;

    const overallScore = calculateOverallScore(candidateProfile, seniority);
    candidateProfile.overallScore = overallScore.overall;

    // Get all scores for percentile calculation
    const allCandidates = await prisma.candidate.findMany({
      where: {
        assessmentId: candidate.assessmentId,
        overallScore: { not: null },
      },
      select: { overallScore: true },
    });

    const allScores = allCandidates
      .map((c: any) => c.overallScore)
      .filter((s: any): s is number => s !== null);
    const percentileRank = calculatePercentileRank(
      overallScore.overall,
      allScores
    );

    // Generate hiring recommendation
    const recommendation = generateHiringRecommendation(
      candidateProfile,
      seniority,
      70, // team average - could be calculated from org data
      percentileRank
    );

    // Upload session recording to S3
    const storagePath = await uploadSessionToS3(
      candidate.id,
      sessionRecording,
      finalCode
    );

    // Update candidate with scores and completion status
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        overallScore: overallScore.overall,
        codingScore: candidateProfile.technicalScore,
        communicationScore: aiCollaborationScore.overall,
        problemSolvingScore: candidateProfile.problemSolvingScore,
        sessionData: {
          metrics,
          scores: {
            overall: overallScore,
            aiCollaboration: aiCollaborationScore,
            technical: candidateProfile.technicalScore,
            codeQuality: candidateProfile.codeQualityScore,
            problemSolving: candidateProfile.problemSolvingScore,
          },
          flags: {
            red: redFlags,
            green: greenFlags,
          },
          recommendation,
          percentileRank,
        } as any,
      },
    });

    // Create Evaluation record immediately (synchronous)
    // This ensures evaluation exists even if background worker isn't running
    const evaluation = await prisma.evaluation.create({
      data: {
        candidateId: id,
        sessionId: sessionRecording.id,

        // 4-dimension scores (0-100) - convert to Int
        codeQualityScore: Math.round(candidateProfile.codeQualityScore || 50),
        codeQualityEvidence: {
          snapshots: sessionRecording.codeSnapshots.length,
          iterativeDevelopment: sessionRecording.codeSnapshots.length > 0,
        },
        codeQualityConfidence: 0.7,

        problemSolvingScore: Math.round(candidateProfile.problemSolvingScore || 50),
        problemSolvingEvidence: {
          testsPassed: metrics.testsPassed || 0,
          testsFailed: metrics.testsFailed || 0,
          completionRate: metrics.completionRate || 0,
        },
        problemSolvingConfidence: 0.8,

        aiCollaborationScore: Math.round(aiCollaborationScore.overall),
        aiCollaborationEvidence: JSON.parse(JSON.stringify({
          interactions: metrics.claudeInteractions || 0,
          avgPromptQuality: metrics.avgPromptQuality || 3,
          breakdown: aiCollaborationScore,
        })),
        aiCollaborationConfidence: 0.75,

        communicationScore: Math.round(aiCollaborationScore.overall),
        communicationEvidence: {
          promptQuality: metrics.avgPromptQuality || 3,
          interactions: metrics.claudeInteractions || 0,
        },
        communicationConfidence: 0.7,

        // Overall metrics
        overallScore: Math.round(overallScore.overall),
        confidence: 0.75,

        // Hiring recommendation
        hiringRecommendation: recommendation.decision,
        hiringConfidence: recommendation.confidence,
        hiringReasoning: JSON.parse(JSON.stringify({
          recommendation,
          percentileRank,
          redFlags,
          greenFlags,
        })),

        evaluatedAt: new Date(),
      },
    });

    // Queue async comprehensive evaluation
    // This will re-analyze the session with the evaluation agent
    // and update scores with evidence-based analysis
    try {
      const { publishEvaluationAnalyze } = await import('@/lib/queues/publishers');
      await publishEvaluationAnalyze({
        sessionId: sessionRecording.id,
        candidateId: id,
        timestamp: new Date(),
        priority: 5, // Normal priority
      });
      logger.info(`[Submit] Queued evaluation`, { sessionId: sessionRecording.id, candidateId: id });
    } catch (error) {
      logger.warn('[Submit] Failed to queue evaluation', {
        sessionId: sessionRecording.id,
        candidateId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't fail submission if queue fails
    }

    // Record session_submit event
    await sessions.recordEvent(sessionRecording.id, {
      type: "session_submit",
      data: {
        finalCode,
        testsPassed: finalTestResults?.passed || 0,
        testsFailed: finalTestResults?.failed || 0,
        overallScore: overallScore.overall,
        aiCollaborationScore: aiCollaborationScore.overall,
        duration: metrics.timeUsed,
        timestamp: new Date().toISOString(),
      },
      checkpoint: true, // Mark as checkpoint for replay seeking
    });

    // Update session recording
    await prisma.sessionRecording.update({
      where: { id: sessionRecording.id },
      data: {
        status: "COMPLETED",
        endTime: new Date(),
        duration: metrics.timeUsed
          ? Math.floor(metrics.timeUsed * 60)
          : undefined,
        storagePath,
        storageSize: sessionRecording.events.length,
      },
    });

    logger.info('[Submit] Submission completed', {
      candidateId: id,
      sessionId: sessionRecording.id,
      overallScore: overallScore.overall,
      recommendation: recommendation.decision,
      testsPassed: finalTestResults?.passed,
      testsFailed: finalTestResults?.failed,
    });

    // Return evaluation results
    return success({
      success: true,
      evaluation: {
        overallScore: overallScore.overall,
        breakdown: overallScore.breakdown,
        aiCollaborationScore: aiCollaborationScore.overall,
        recommendation: recommendation.decision,
        confidence: recommendation.confidence,
        percentileRank,
        redFlags,
        greenFlags,
      },
      candidate: {
        id: updatedCandidate.id,
        name: updatedCandidate.name,
        email: updatedCandidate.email,
        status: updatedCandidate.status,
      },
    });
});

/**
 * Calculate session metrics from candidate and session data
 */
function calculateSessionMetrics(
  candidate: any,
  sessionRecording: any,
  finalTestResults?: any
): Partial<CandidateProfile> {
  const startTime = candidate.startedAt || sessionRecording.startTime;
  const endTime = new Date();
  const timeUsed = startTime
    ? (endTime.getTime() - startTime.getTime()) / (1000 * 60)
    : undefined;

  const claudeInteractions = sessionRecording.claudeInteractions.filter(
    (i: any) => i.role === "user"
  );

  // Use final test results if available, otherwise use session recording results
  let testsPassed = 0;
  let testsFailed = 0;

  if (finalTestResults) {
    testsPassed = finalTestResults.passedTests;
    testsFailed = finalTestResults.failedTests;
  } else {
    const testResults = sessionRecording.testResults;
    testsPassed = testResults.filter((t: any) => t.passed).length;
    testsFailed = testResults.filter((t: any) => !t.passed).length;
  }

  const avgPromptQuality =
    claudeInteractions.length > 0
      ? claudeInteractions.reduce(
        (sum: number, i: any) => sum + (i.promptQuality || 3),
        0
      ) / claudeInteractions.length
      : 3;

  return {
    timeUsed,
    timeAllocated: candidate.assessment.duration,
    claudeInteractions: claudeInteractions.length,
    avgPromptQuality,
    testsPassed,
    testsFailed,
    completionRate: testsPassed > 0 ? testsPassed / (testsPassed + testsFailed) : 0,
  };
}

/**
 * Calculate code quality score from session data
 */
function calculateCodeQualityScore(sessionRecording: any): number {
  const snapshots = sessionRecording.codeSnapshots;
  if (snapshots.length === 0) return 50;

  // Simple heuristic based on code evolution
  const totalSnapshots = snapshots.length;
  const testsCount = sessionRecording.testResults.length;

  // More snapshots = more iterative development (good)
  const snapshotScore = Math.min(totalSnapshots / 10, 1) * 30;

  // Tests written (good)
  const testScore = Math.min(testsCount / 5, 1) * 40;

  // Base score
  const baseScore = 30;

  return Math.min(100, baseScore + snapshotScore + testScore);
}

/**
 * Map Prisma Seniority enum to type system
 */
function mapSeniorityToType(seniority: string): "junior" | "mid" | "senior" | "staff" | "principal" {
  const seniorityMap: Record<string, "junior" | "mid" | "senior" | "staff" | "principal"> = {
    JUNIOR: "junior",
    MID: "mid",
    SENIOR: "senior",
    LEAD: "staff",
    PRINCIPAL: "principal",
  };
  return seniorityMap[seniority] || "mid";
}

/**
 * Upload session recording to S3
 */
async function uploadSessionToS3(
  candidateId: string,
  sessionRecording: any,
  finalCode?: Record<string, string>
): Promise<string> {
  try {
    const sessionData = {
      candidateId,
      sessionId: sessionRecording.id,
      startTime: sessionRecording.startTime,
      events: sessionRecording.events,
      claudeInteractions: sessionRecording.claudeInteractions,
      testResults: sessionRecording.testResults,
      codeSnapshots: sessionRecording.codeSnapshots,
      finalCode,
    };

    // Compress data
    const jsonString = JSON.stringify(sessionData);
    const compressed = pako.gzip(jsonString);

    // Upload to S3
    const key = `sessions/${candidateId}/${sessionRecording.id}.json.gz`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || "interviewlm-sessions",
      Key: key,
      Body: compressed,
      ContentType: "application/gzip",
      ContentEncoding: "gzip",
    });

    await s3Client.send(command);

    logger.info('[Submit] Session uploaded to S3', { candidateId, sessionId: sessionRecording.id, key });
    return key;
  } catch (error) {
    logger.warn("S3 upload error", {
      candidateId,
      sessionId: sessionRecording.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Return empty string if upload fails (non-critical)
    return "";
  }
}
