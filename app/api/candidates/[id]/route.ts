import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { CandidateProfile } from "@/types/analytics";
import { detectRedFlags, detectGreenFlags } from "@/lib/scoring";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

/**
 * GET /api/candidates/[id]
 * Get detailed candidate profile with comprehensive assessment data
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  const session = await getSession();

  if (!session?.user?.id) {
    throw new AuthorizationError();
  }

  logger.debug('[Candidate Detail] Fetching candidate', {
    candidateId: id,
    userId: session.user.id,
  });

  // Get user's organization
  const userOrg = await prisma.organizationMember.findFirst({
    where: { userId: session.user.id },
  });

  if (!userOrg) {
    throw new ValidationError("User not associated with any organization");
  }

  // Fetch candidate with all related data
  const candidate = await logger.time(
    'fetchCandidateDetails',
    () => prisma.candidate.findFirst({
      where: {
        id,
        organizationId: userOrg.organizationId,
      },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            role: true,
            seniority: true,
            duration: true,
            description: true,
          },
        },
        sessionRecording: {
          include: {
            claudeInteractions: {
              orderBy: { timestamp: "asc" },
            },
            testResults: {
              orderBy: { timestamp: "asc" },
            },
            codeSnapshots: {
              orderBy: { timestamp: "asc" },
            },
            events: {
              orderBy: { timestamp: "asc" },
              take: 100, // Limit events to avoid huge payload
            },
          },
        },
        generatedQuestions: {
          orderBy: { order: "asc" },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    { candidateId: id, organizationId: userOrg.organizationId }
  );

  if (!candidate) {
    throw new NotFoundError("Candidate");
  }

  const sessionData = candidate.sessionRecording;
  const questions = candidate.generatedQuestions;

  // Calculate comprehensive metrics
  const timeUsed = sessionData?.duration ? Math.round(sessionData.duration / 60) : undefined;
  const timeAllocated = candidate.assessment.duration;

  // Problems metrics
  const problemsAttempted = questions.filter(
    (q) => q.status === "IN_PROGRESS" || q.status === "COMPLETED"
  ).length;
  const problemsSolved = questions.filter((q) => q.status === "COMPLETED").length;
  const completionRate = problemsAttempted > 0 ? problemsSolved / problemsAttempted : 0;

  // Test results
  const testResults = sessionData?.testResults || [];
  const testsPassed = testResults.filter((t) => t.passed).length;
  const testsFailed = testResults.filter((t) => !t.passed).length;

  // Claude interactions
  const interactions = sessionData?.claudeInteractions || [];
  const claudeInteractions = interactions.filter((i) => i.role === "user").length;
  const avgPromptQuality = interactions.length > 0
    ? interactions
        .filter((i) => i.promptQuality !== null)
        .reduce((sum, i) => sum + (i.promptQuality || 0), 0) /
      interactions.filter((i) => i.promptQuality !== null).length
    : undefined;

  // Code metrics
  const codeSnapshots = sessionData?.codeSnapshots || [];
  const totalLinesAdded = codeSnapshots.reduce((sum, s) => sum + s.linesAdded, 0);
  const totalLinesDeleted = codeSnapshots.reduce((sum, s) => sum + s.linesDeleted, 0);

  // AI acceptance rate
  const aiAcceptanceRate = interactions.length > 0 && codeSnapshots.length > 0
    ? Math.min(1, codeSnapshots.length / interactions.length)
    : undefined;

  // AI usage pattern detection
  let aiUsagePattern: "goal-oriented" | "trial-and-error" | "copy-paste" | "ai-avoidant" = "ai-avoidant";
  if (claudeInteractions > 0) {
    if (avgPromptQuality && avgPromptQuality >= 4.0) {
      aiUsagePattern = "goal-oriented";
    } else if (claudeInteractions > 15) {
      aiUsagePattern = "trial-and-error";
    } else {
      aiUsagePattern = "copy-paste";
    }
  }

  // Calculate scores
  const technicalScore = candidate.codingScore ||
    (questions.length > 0
      ? questions
          .filter((q) => q.score !== null)
          .reduce((sum, q) => sum + (q.score || 0), 0) / questions.filter((q) => q.score !== null).length
      : undefined);

  const aiCollaborationScore = avgPromptQuality ? avgPromptQuality * 20 : undefined; // Convert 1-5 to 0-100

  const codeQualityScore = testsPassed > 0
    ? Math.round((testsPassed / (testsPassed + testsFailed)) * 100)
    : undefined;

  const problemSolvingScore = candidate.problemSolvingScore ||
    (problemsAttempted > 0 ? Math.round((problemsSolved / problemsAttempted) * 100) : undefined);

  // Overall score
  const overallScore = candidate.overallScore ||
    (technicalScore && aiCollaborationScore && codeQualityScore && problemSolvingScore
      ? Math.round(
          technicalScore * 0.35 +
          aiCollaborationScore * 0.25 +
          codeQualityScore * 0.25 +
          problemSolvingScore * 0.15
        )
      : undefined);

  // Detect flags
  const redFlags = detectRedFlags({
    avgPromptQuality,
    testsPassed,
    testsFailed,
    completionRate,
    claudeInteractions,
  } as any);

  const greenFlags = detectGreenFlags({
    overallScore,
    avgPromptQuality,
    testsPassed,
    testsFailed,
    aiAcceptanceRate,
  } as any);

  // Top strengths and areas for improvement
  const topStrengths: string[] = [];
  const areasForImprovement: string[] = [];

  if (overallScore && overallScore >= 90) topStrengths.push("Exceptional overall performance");
  if (technicalScore && technicalScore >= 90) topStrengths.push("Strong technical skills");
  if (aiCollaborationScore && aiCollaborationScore >= 80) topStrengths.push("Excellent AI collaboration");
  if (codeQualityScore && codeQualityScore >= 90) topStrengths.push("High code quality");
  if (problemsSolved === problemsAttempted && problemsAttempted > 0) topStrengths.push("Perfect completion rate");

  if (completionRate < 0.7) areasForImprovement.push("Low problem completion rate");
  if (avgPromptQuality && avgPromptQuality < 3.0) areasForImprovement.push("AI prompt quality needs improvement");
  if (codeQualityScore && codeQualityScore < 70) areasForImprovement.push("Code quality and testing");

  // Map status
  const statusMap: Record<string, any> = {
    "INVITED": "assessment_sent",
    "IN_PROGRESS": "assessment_in_progress",
    "COMPLETED": "assessment_completed",
    "EVALUATED": "under_review",
    "HIRED": "hired",
    "REJECTED": "rejected",
  };

  // Build comprehensive candidate profile
  const candidateProfile: CandidateProfile = {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    appliedRole: candidate.assessment.role as any,
    targetSeniority: candidate.assessment.seniority.toLowerCase() as any,

    status: statusMap[candidate.status] || "invited",
    stage: candidate.status === "COMPLETED" || candidate.status === "EVALUATED" ? "assessment" : "assessment",
    assessmentCompleted: candidate.status === "COMPLETED" || candidate.status === "EVALUATED",

    assessmentId: candidate.assessmentId,
    sessionId: sessionData?.id,

    overallScore,
    technicalScore,
    aiCollaborationScore,
    codeQualityScore,
    problemSolvingScore,

    topStrengths,
    areasForImprovement,
    redFlags,
    greenFlags,

    timeUsed,
    timeAllocated,
    completionRate,
    problemsSolved,
    problemsAttempted,
    testsPassed,
    testsFailed,

    claudeInteractions,
    avgPromptQuality,
    aiAcceptanceRate,
    aiUsagePattern,

    appliedAt: candidate.createdAt.toISOString(),
    invitedAt: candidate.invitedAt?.toISOString(),
    assessmentStartedAt: candidate.startedAt?.toISOString(),
    assessmentCompletedAt: candidate.completedAt?.toISOString(),
    lastActivityAt: (candidate.completedAt || candidate.startedAt || candidate.invitedAt || candidate.createdAt).toISOString(),
  };

  // Additional detailed data for candidate detail view
  const detailedData = {
    candidate: candidateProfile,

    // Assessment details
    assessment: {
      id: candidate.assessment.id,
      title: candidate.assessment.title,
      description: candidate.assessment.description,
      role: candidate.assessment.role,
      seniority: candidate.assessment.seniority,
      duration: candidate.assessment.duration,
    },

    // Question breakdown
    questions: questions.map((q) => ({
      id: q.id,
      order: q.order,
      title: q.title,
      difficulty: q.difficulty,
      status: q.status,
      score: q.score,
    })),

    // Session timeline
    timeline: {
      events: sessionData?.events.map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp.toISOString(),
        data: e.data,
      })) || [],
      claudeInteractions: interactions.map((i) => ({
        id: i.id,
        role: i.role,
        timestamp: i.timestamp.toISOString(),
        promptQuality: i.promptQuality,
        inputTokens: i.inputTokens,
        outputTokens: i.outputTokens,
      })),
      testResults: testResults.map((t) => ({
        id: t.id,
        testName: t.testName,
        passed: t.passed,
        duration: t.duration,
        timestamp: t.timestamp.toISOString(),
      })),
    },

    // Code evolution
    codeEvolution: {
      totalSnapshots: codeSnapshots.length,
      totalLinesAdded,
      totalLinesDeleted,
      snapshots: codeSnapshots.slice(0, 20).map((s) => ({ // Limit to first 20
        id: s.id,
        fileName: s.fileName,
        language: s.language,
        linesAdded: s.linesAdded,
        linesDeleted: s.linesDeleted,
        timestamp: s.timestamp.toISOString(),
      })),
    },

    // Metadata
    metadata: {
      createdBy: candidate.createdBy,
      volumeId: candidate.volumeId,
      sessionDuration: sessionData?.duration,
      eventCount: sessionData?.eventCount,
    },
  };

  logger.info('[Candidate Detail] Profile computed', {
    candidateId: id,
    overallScore,
    technicalScore,
    aiCollaborationScore,
    problemsSolved,
    problemsAttempted,
    claudeInteractions,
    testsPassed,
    testsFailed,
    redFlagsCount: redFlags.length,
    greenFlagsCount: greenFlags.length,
  });

  return success(detailedData);
});
