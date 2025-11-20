/**
 * Tech Stack Validation API
 *
 * Validates that candidates are using the required technology stack
 * for incremental assessments.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { techStackValidator } from "@/lib/services/tech-stack-validator";
import type { RequiredTechStack } from "@/types/seed";

/**
 * GET /api/interview/[id]/tech-validation
 * Get tech stack compliance status for candidate
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;

    // Check authentication (allow candidate to check their own status)
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get candidate and assessment
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        assessment: {
          include: {
            questions: {
              include: {
                problemSeed: true,
              },
            },
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization (org member or candidate themselves)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get seed and check if it's incremental
    const assessmentQuestion = candidate.assessment.questions[0];
    if (!assessmentQuestion?.problemSeed) {
      return NextResponse.json(
        { error: "No seed found for assessment" },
        { status: 404 }
      );
    }

    const seed = assessmentQuestion.problemSeed;

    // Only validate for incremental seeds
    if (seed.seedType !== 'incremental') {
      return NextResponse.json(
        {
          compliant: true,
          message: "Tech validation only applies to incremental assessments",
          seedType: seed.seedType,
        },
        { status: 200 }
      );
    }

    // Get required tech from seed
    const requiredTech = seed.requiredTech as RequiredTechStack | null;

    if (!requiredTech) {
      return NextResponse.json(
        { error: "Seed missing required tech configuration" },
        { status: 400 }
      );
    }

    // Validate tech stack usage
    const validationResult = await techStackValidator.validateCandidateSession(
      candidateId,
      requiredTech
    );

    return NextResponse.json(
      {
        compliant: validationResult.compliant,
        score: validationResult.score,
        violations: validationResult.violations,
        detectedTech: validationResult.detectedTech,
        requiredTech,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Tech validation API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
