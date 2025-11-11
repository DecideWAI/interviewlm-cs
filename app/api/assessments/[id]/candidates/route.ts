import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { sendInvitationEmail } from "@/lib/services/email";
import crypto from "crypto";

// Validation schema for inviting a candidate
const inviteCandidateSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

// Validation schema for bulk invite
const bulkInviteSchema = z.object({
  candidates: z.array(inviteCandidateSchema).min(1).max(50),
  message: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

/**
 * POST /api/assessments/[id]/candidates
 * Invite candidate(s) to an assessment
 */
export async function POST(
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

    const { id: assessmentId } = await params;

    // Parse request body
    const body = await request.json();

    // Check if bulk invite or single invite
    const isBulk = Array.isArray(body.candidates);

    // Validate request
    const validationResult = isBulk
      ? bulkInviteSchema.safeParse(body)
      : inviteCandidateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    // Get assessment
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    // Verify assessment is published
    if (assessment.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Assessment must be published before inviting candidates" },
        { status: 400 }
      );
    }

    // Verify user has access
    const userOrg = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: assessment.organizationId,
      },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Process single or bulk invite
    const candidateData = isBulk
      ? (validationResult.data as any).candidates
      : [validationResult.data];

    const commonMessage = isBulk
      ? (validationResult.data as any).message
      : (validationResult.data as any).message;

    const commonDeadline = isBulk
      ? (validationResult.data as any).deadline
      : (validationResult.data as any).deadline;

    // Create candidates
    const createdCandidates = [];
    const errors = [];

    for (const candidateInfo of candidateData) {
      try {
        // Check if candidate with same email already invited to this assessment
        const existing = await prisma.candidate.findFirst({
          where: {
            assessmentId,
            email: candidateInfo.email,
          },
        });

        if (existing) {
          errors.push({
            email: candidateInfo.email,
            error: "Already invited to this assessment",
          });
          continue;
        }

        // Generate unique invitation token
        const invitationToken = crypto.randomBytes(32).toString("hex");

        // Set expiration (30 days from now, or custom deadline)
        const expiresAt = commonDeadline
          ? new Date(commonDeadline)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Create candidate
        const candidate = await prisma.candidate.create({
          data: {
            organizationId: assessment.organizationId,
            assessmentId,
            createdById: session.user.id,
            name: candidateInfo.name,
            email: candidateInfo.email,
            phone: candidateInfo.phone,
            status: "INVITED",
            invitedAt: new Date(),
            invitationToken,
            invitationSentAt: new Date(),
            invitationExpiresAt: expiresAt,
            deadlineAt: commonDeadline ? new Date(commonDeadline) : null,
          },
        });

        // Generate invitation link
        const invitationLink = `${process.env.NEXT_PUBLIC_URL || "https://interviewlm.com"}/interview/start/${invitationToken}`;

        // Send invitation email
        try {
          await sendInvitationEmail({
            to: candidate.email,
            candidateName: candidate.name,
            assessmentTitle: assessment.title,
            role: assessment.role,
            duration: assessment.duration,
            invitationLink,
            expiresAt,
            customMessage: commonMessage || candidateInfo.message,
            organizationName: assessment.organization.name,
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${candidate.email}:`, emailError);
          // Continue even if email fails - candidate is still created
        }

        createdCandidates.push({
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          status: candidate.status,
          invitedAt: candidate.invitedAt,
          invitationLink,
        });
      } catch (error) {
        console.error(`Error inviting candidate ${candidateInfo.email}:`, error);
        errors.push({
          email: candidateInfo.email,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        invited: createdCandidates,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: candidateData.length,
          successful: createdCandidates.length,
          failed: errors.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error inviting candidates:", error);
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
 * GET /api/assessments/[id]/candidates
 * Get candidates for an assessment
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

    const { id: assessmentId } = await params;

    // Get assessment
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const userOrg = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: assessment.organizationId,
      },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Get candidates
    const candidates = await prisma.candidate.findMany({
      where: { assessmentId },
      orderBy: { invitedAt: "desc" },
    });

    return NextResponse.json({
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: c.status,
        overallScore: c.overallScore,
        codingScore: c.codingScore,
        communicationScore: c.communicationScore,
        problemSolvingScore: c.problemSolvingScore,
        invitedAt: c.invitedAt,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
      })),
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
