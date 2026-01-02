import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { CandidateProfile } from "@/types/analytics";
import { detectRedFlags, detectGreenFlags } from "@/lib/scoring";

// Validation schema for listing candidates
const listCandidatesSchema = z.object({
  assessmentId: z.string().optional(),
  status: z.string().optional(),
  role: z.string().optional(),
  seniority: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

/**
 * GET /api/candidates
 * List candidates with comprehensive assessment data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      assessmentId: searchParams.get("assessment_id") || searchParams.get("assessmentId") || undefined,
      status: searchParams.get("status") || undefined,
      role: searchParams.get("role") || undefined,
      seniority: searchParams.get("seniority") || undefined,
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "50",
    };

    const validationResult = listCandidatesSchema.safeParse(queryParams);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { assessmentId, status, role, seniority, page, limit } = validationResult.data;

    // Get user's organization
    const userOrg = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "User not associated with any organization" },
        { status: 400 }
      );
    }

    // Build where clause
    const where: any = {
      organizationId: userOrg.organizationId,
    };

    if (assessmentId) {
      where.assessmentId = assessmentId;
    }

    if (status) {
      // Map frontend status to Prisma enum
      const statusMap: Record<string, string> = {
        "assessment_sent": "INVITED",
        "assessment_in_progress": "IN_PROGRESS",
        "assessment_completed": "COMPLETED",
        "under_review": "EVALUATED",
        "hired": "HIRED",
        "rejected": "REJECTED",
      };
      where.status = statusMap[status] || status.toUpperCase();
    }

    // Get total count for pagination
    const total = await prisma.candidate.count({ where });

    // Fetch candidates with all related data
    const candidates = await prisma.candidate.findMany({
      where,
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            role: true,
            seniority: true,
            duration: true,
          },
        },
        sessionRecording: {
          include: {
            claudeInteractions: {
              select: {
                id: true,
                role: true,
                promptQuality: true,
                inputTokens: true,
                outputTokens: true,
                timestamp: true,
              },
            },
            testResults: {
              select: {
                id: true,
                passed: true,
                testName: true,
                duration: true,
                timestamp: true,
              },
            },
            codeSnapshots: {
              select: {
                id: true,
                linesAdded: true,
                linesDeleted: true,
                timestamp: true,
              },
            },
          },
        },
        generatedQuestions: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            status: true,
            score: true,
            order: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Filter by role if specified (since it's on assessment)
    let filteredCandidates = candidates;
    if (role) {
      filteredCandidates = candidates.filter(
        (c) => c.assessment.role.toLowerCase() === role.toLowerCase()
      );
    }
    if (seniority) {
      filteredCandidates = candidates.filter(
        (c) => c.assessment.seniority.toLowerCase() === seniority.toLowerCase()
      );
    }

    // Transform to CandidateProfile format with calculated metrics
    const candidateProfiles: CandidateProfile[] = filteredCandidates.map((candidate) => {
      const session = candidate.sessionRecording;
      const questions = candidate.generatedQuestions;

      // Calculate metrics from session data
      const timeUsed = session?.duration ? Math.round(session.duration / 60) : undefined; // Convert seconds to minutes
      const timeAllocated = candidate.assessment.duration;

      // Problems metrics
      const problemsAttempted = questions.filter(
        (q) => q.status === "IN_PROGRESS" || q.status === "COMPLETED"
      ).length;
      const problemsSolved = questions.filter((q) => q.status === "COMPLETED").length;
      const completionRate = problemsAttempted > 0 ? problemsSolved / problemsAttempted : 0;

      // Test results
      const testResults = session?.testResults || [];
      const testsPassed = testResults.filter((t) => t.passed).length;
      const testsFailed = testResults.filter((t) => !t.passed).length;

      // Claude interactions
      const interactions = session?.claudeInteractions || [];
      const claudeInteractions = interactions.filter((i) => i.role === "user").length;
      const avgPromptQuality = interactions.length > 0
        ? interactions
            .filter((i) => i.promptQuality !== null)
            .reduce((sum, i) => sum + (i.promptQuality || 0), 0) /
          interactions.filter((i) => i.promptQuality !== null).length
        : undefined;

      // AI acceptance rate (simplified - based on code snapshots after AI interactions)
      const codeSnapshots = session?.codeSnapshots || [];
      const aiAcceptanceRate = interactions.length > 0 && codeSnapshots.length > 0
        ? Math.min(1, codeSnapshots.length / interactions.length)
        : undefined;

      // AI usage pattern detection (simplified heuristic)
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

      // Overall score (weighted average or from DB)
      const overallScore = candidate.overallScore ||
        (technicalScore && aiCollaborationScore && codeQualityScore && problemSolvingScore
          ? Math.round(
              technicalScore * 0.35 +
              aiCollaborationScore * 0.25 +
              codeQualityScore * 0.25 +
              problemSolvingScore * 0.15
            )
          : undefined);

      // Detect flags using scoring utilities
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

      // Map status from Prisma enum to frontend status
      const statusMap: Record<string, any> = {
        "INVITED": "assessment_sent",
        "IN_PROGRESS": "assessment_in_progress",
        "COMPLETED": "assessment_completed",
        "EVALUATED": "under_review",
        "HIRED": "hired",
        "REJECTED": "rejected",
      };

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
        sessionId: session?.id,

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

      return candidateProfile;
    });

    return NextResponse.json({
      candidates: candidateProfiles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching candidates:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
