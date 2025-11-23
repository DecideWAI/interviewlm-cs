import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import {
  ActionableReportGenerator,
  type ActionableReport,
  type EvaluationData,
} from "@/lib/services/actionable-report";
import type { SeniorityLevel } from "@/types/assessment";

/**
 * GET /api/candidates/[id]/report
 * Generate comprehensive actionable report for a candidate
 *
 * Returns:
 * - Skills Gap Matrix
 * - Development Roadmap
 * - Interview Insights
 * - Hiring Recommendation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

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

    // Fetch candidate with evaluation data
    const candidate = await prisma.candidate.findFirst({
      where: {
        id,
        organizationId: userOrg.organizationId,
      },
      include: {
        assessment: {
          select: {
            title: true,
            role: true,
            seniority: true,
            questions: {
              include: {
                problemSeed: {
                  select: {
                    tags: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
        },
        generatedQuestions: {
          orderBy: { order: 'asc' },
        },
        sessions: {
          orderBy: { endedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Check if candidate has been evaluated
    const evaluation = candidate.evaluations[0];

    if (!evaluation) {
      return NextResponse.json(
        { error: "Candidate has not been evaluated yet" },
        { status: 400 }
      );
    }

    // Check if we have a cached actionable report
    if (evaluation.actionableReport) {
      const cachedReport = evaluation.actionableReport as ActionableReport & { candidateName?: string };
      cachedReport.candidateName = candidate.name;

      return NextResponse.json({
        report: cachedReport,
        metadata: {
          generatedAt: cachedReport.generatedAt || new Date().toISOString(),
          candidateId: candidate.id,
          candidateName: candidate.name,
          assessmentTitle: candidate.assessment.title,
          evaluatedAt: evaluation.evaluatedAt.toISOString(),
          cached: true,
        },
      });
    }

    // Build evaluation data for report generation (fallback for legacy evaluations)
    const evaluationData: EvaluationData = {
      sessionId: evaluation.sessionId,
      candidateId: candidate.id,
      role: candidate.assessment.role,
      seniority: candidate.assessment.seniority.toLowerCase() as SeniorityLevel,
      techStack: extractTechStack(candidate.assessment.questions),

      codeQuality: {
        score: evaluation.codeQualityScore,
        evidence: extractEvidence(evaluation.codeQualityEvidence),
        breakdown: (evaluation.codeQualityEvidence as any)?.breakdown,
      },
      problemSolving: {
        score: evaluation.problemSolvingScore,
        evidence: extractEvidence(evaluation.problemSolvingEvidence),
        breakdown: (evaluation.problemSolvingEvidence as any)?.breakdown,
      },
      aiCollaboration: {
        score: evaluation.aiCollaborationScore,
        evidence: extractEvidence(evaluation.aiCollaborationEvidence),
        breakdown: (evaluation.aiCollaborationEvidence as any)?.breakdown,
      },
      communication: {
        score: evaluation.communicationScore,
        evidence: extractEvidence(evaluation.communicationEvidence),
        breakdown: (evaluation.communicationEvidence as any)?.breakdown,
      },

      overallScore: evaluation.overallScore,
      expertiseLevel: evaluation.expertiseLevel || undefined,
      expertiseGrowthTrend: (evaluation.expertiseGrowthTrend as 'improving' | 'declining' | 'stable') || undefined,

      questionScores: candidate.generatedQuestions
        .filter((q: any) => q.score !== null)
        .map((q: any, idx: number) => ({
          questionNumber: idx + 1,
          score: q.score,
          difficulty: q.difficulty,
          topics: extractTopics(q),
        })),
    };

    // Generate actionable report
    const report = ActionableReportGenerator.generateReport(evaluationData);

    // Add candidate name to report
    const reportWithName: ActionableReport & { candidateName: string } = {
      ...report,
      candidateName: candidate.name,
    };

    return NextResponse.json({
      report: reportWithName,
      metadata: {
        generatedAt: new Date().toISOString(),
        candidateId: candidate.id,
        candidateName: candidate.name,
        assessmentTitle: candidate.assessment.title,
        evaluatedAt: evaluation.evaluatedAt.toISOString(),
      },
    });

  } catch (error) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Extract tech stack from assessment questions
 */
function extractTechStack(questions: any[]): string[] {
  const techStack = new Set<string>();

  for (const q of questions) {
    if (q.problemSeed?.tags) {
      q.problemSeed.tags.forEach((tag: string) => techStack.add(tag));
    }
    if (q.problemSeed?.category) {
      techStack.add(q.problemSeed.category);
    }
  }

  return Array.from(techStack);
}

/**
 * Extract evidence strings from evaluation evidence JSON
 */
function extractEvidence(evidenceJson: any): string[] {
  if (!evidenceJson) return [];

  if (Array.isArray(evidenceJson)) {
    return evidenceJson.map((e: any) =>
      typeof e === 'string' ? e : e.description || e.observation || JSON.stringify(e)
    ).slice(0, 5);
  }

  if (typeof evidenceJson === 'object') {
    if (evidenceJson.items && Array.isArray(evidenceJson.items)) {
      return evidenceJson.items.map((e: any) => e.description || e.text || JSON.stringify(e)).slice(0, 5);
    }
    if (evidenceJson.summary) {
      return [evidenceJson.summary];
    }
  }

  return [];
}

/**
 * Extract topics from a question
 */
function extractTopics(question: any): string[] {
  const topics: string[] = [];

  if (question.requirements && Array.isArray(question.requirements)) {
    topics.push(...question.requirements.slice(0, 3));
  }

  return topics;
}
