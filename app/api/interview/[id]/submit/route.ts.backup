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
    const validationResult = submitRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { finalCode, notes } = validationResult.data;

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
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization
    if (candidate.organization.members.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if already completed
    if (candidate.status === "COMPLETED" || candidate.status === "EVALUATED") {
      return NextResponse.json(
        { error: "Assessment already submitted" },
        { status: 400 }
      );
    }

    if (!candidate.sessionRecording) {
      return NextResponse.json(
        { error: "No session recording found" },
        { status: 400 }
      );
    }

    const sessionRecording = candidate.sessionRecording;

    // Run final test execution to ensure we have latest results
    let finalTestResults: any = null;
    const firstQuestion = candidate.generatedQuestions?.[0];
    if (candidate.volumeId && firstQuestion) {
      try {
        // Read final code from Modal volume
        const fileName = `solution.${firstQuestion.language === "python" ? "py" : "js"}`;
        const finalCodeContent = finalCode?.[fileName] || await modal.readFile(candidate.volumeId, fileName);

        // Run final tests
        const testCases = firstQuestion.testCases as Array<{
          name: string;
          input: string;
          expectedOutput: string;
          hidden?: boolean;
        }>;

        if (testCases && testCases.length > 0) {
          finalTestResults = await modal.executeCode(
            id,
            finalCodeContent,
            testCases.map(tc => ({
              name: tc.name,
              input: tc.input,
              expected: tc.expectedOutput,
              hidden: tc.hidden || false,
            }))
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
        console.error("Error running final tests:", error);
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

    // Return evaluation results
    return NextResponse.json(
      {
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
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Submit API error:", error);
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

    return key;
  } catch (error) {
    console.error("S3 upload error:", error);
    // Return empty string if upload fails (non-critical)
    return "";
  }
}
