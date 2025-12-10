import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

/**
 * GET /api/evaluation/[sessionId]
 * Fetch the latest evaluation result for a session
 *
 * This endpoint is used:
 * - On page load to get existing evaluation if available
 * - After page reload to restore evaluation state
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch evaluation with authorization check
    const evaluation = await prisma.evaluation.findUnique({
      where: { sessionId },
      include: {
        candidate: {
          include: {
            organization: {
              include: {
                members: {
                  where: { userId: session.user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { error: "Evaluation not found", exists: false },
        { status: 404 }
      );
    }

    // Check authorization
    const isOrgMember = evaluation.candidate.organization.members.length > 0;
    const isSelfInterview = evaluation.candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Return evaluation data (transform to camelCase for frontend)
    return NextResponse.json({
      exists: true,
      evaluation: {
        id: evaluation.id,
        sessionId: evaluation.sessionId,
        candidateId: evaluation.candidateId,
        // Dimension scores
        codeQuality: {
          score: evaluation.codeQualityScore,
          evidence: evaluation.codeQualityEvidence,
          confidence: evaluation.codeQualityConfidence,
        },
        problemSolving: {
          score: evaluation.problemSolvingScore,
          evidence: evaluation.problemSolvingEvidence,
          confidence: evaluation.problemSolvingConfidence,
        },
        aiCollaboration: {
          score: evaluation.aiCollaborationScore,
          evidence: evaluation.aiCollaborationEvidence,
          confidence: evaluation.aiCollaborationConfidence,
        },
        communication: {
          score: evaluation.communicationScore,
          evidence: evaluation.communicationEvidence,
          confidence: evaluation.communicationConfidence,
        },
        // Overall
        overallScore: evaluation.overallScore,
        confidence: evaluation.confidence,
        // Bias detection
        biasFlags: evaluation.biasFlags,
        biasDetection: evaluation.biasDetection,
        fairnessReport: evaluation.fairnessReport,
        // Hiring recommendation
        hiringRecommendation: evaluation.hiringRecommendation,
        hiringConfidence: evaluation.hiringConfidence,
        hiringReasoning: evaluation.hiringReasoning,
        // Progressive scoring
        progressiveScoreResult: evaluation.progressiveScoreResult,
        expertiseLevel: evaluation.expertiseLevel,
        expertiseGrowth: evaluation.expertiseGrowth,
        expertiseGrowthTrend: evaluation.expertiseGrowthTrend,
        // Actionable report
        actionableReport: evaluation.actionableReport,
        // Metadata
        model: evaluation.model,
        evaluatedAt: evaluation.evaluatedAt,
        createdAt: evaluation.createdAt,
        updatedAt: evaluation.updatedAt,
      },
    });
  } catch (error) {
    console.error("[EvaluationGet] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
