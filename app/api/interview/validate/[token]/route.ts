import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withErrorHandling, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { relaxedRateLimit } from "@/lib/middleware/rate-limit";

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) => {
  const { token } = await params;

  // Apply relaxed rate limiting (public endpoint for candidates)
  const rateLimited = await relaxedRateLimit(req);
  if (rateLimited) return rateLimited;

  if (!token) {
    throw new ValidationError("Invalid invitation token");
  }

  logger.debug('[Validate Token] Validating invitation', { token: token.substring(0, 8) + '...' });

    // Find candidate by invitation token
    const candidate = await prisma.candidate.findFirst({
      where: {
        invitationToken: token,
      },
      include: {
        assessment: {
          include: {
            organization: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
        sessionRecording: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundError("Invitation link");
    }

    // Check if invitation has expired
    const now = new Date();
    const isExpired = candidate.invitationExpiresAt && candidate.invitationExpiresAt < now;

    // Check if already completed (use type assertion since Prisma client may be out of sync)
    const status = candidate.status as string;
    const isCompleted = status === "COMPLETED" || status === "EVALUATED";

    // Check if already in progress
    const isInProgress = candidate.status === "IN_PROGRESS";

    // Can start if: not expired, not completed, and either INVITED or IN_PROGRESS
    const canStart = !isExpired && !isCompleted;

    logger.info('[Validate Token] Token validated', {
      candidateId: candidate.id,
      status: candidate.status,
      isExpired,
      isCompleted,
      canStart,
    });

    return success({
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        status: candidate.status,
        invitedAt: candidate.invitedAt,
        invitationExpiresAt: candidate.invitationExpiresAt,
        deadlineAt: candidate.deadlineAt,
      },
      assessment: {
        id: candidate.assessment.id,
        title: candidate.assessment.title,
        description: candidate.assessment.description,
        role: candidate.assessment.role,
        seniority: candidate.assessment.seniority,
        duration: candidate.assessment.duration,
        techStack: candidate.assessment.techStack,
      },
      organization: {
        name: candidate.assessment.organization.name,
        slug: candidate.assessment.organization.slug,
      },
      isValid: true,
      isExpired,
      isCompleted,
      isInProgress,
      canStart,
      sessionId: candidate.sessionRecording?.id || undefined,
    });
});
