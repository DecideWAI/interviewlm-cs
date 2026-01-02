import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { withErrorHandling, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { relaxedRateLimit } from "@/lib/middleware/rate-limit";

export const POST = withErrorHandling(async (
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

  logger.info('[Interview Start] Token received', { token: token.substring(0, 8) + '...' });

    // Find candidate by invitation token
    const candidate = await prisma.candidate.findFirst({
      where: {
        invitationToken: token,
      },
      include: {
        assessment: true,
        sessionRecording: true,
      },
    });

    if (!candidate) {
      throw new NotFoundError("Invitation link");
    }

    // Check if invitation has expired
    const now = new Date();
    if (candidate.invitationExpiresAt && candidate.invitationExpiresAt < now) {
      logger.warn('[Interview Start] Expired invitation', { candidateId: candidate.id, expiredAt: candidate.invitationExpiresAt });
      throw new ValidationError("Invitation has expired");
    }

    // Check if already completed
    if (candidate.status === "COMPLETED" || candidate.status === "EVALUATED" || candidate.status === "HIRED" || candidate.status === "REJECTED") {
      logger.warn('[Interview Start] Interview already completed', { candidateId: candidate.id, status: candidate.status });
      throw new ValidationError("Interview already completed");
    }

    // If already has a session, return that session ID
    if (candidate.sessionRecording) {
      logger.info('[Interview Start] Resuming existing session', {
        candidateId: candidate.id,
        sessionId: candidate.sessionRecording.id,
      });

      return success({
        sessionId: candidate.sessionRecording.id,
        candidateId: candidate.id,
        message: "Resuming existing session",
      });
    }

    // Create a new interview session recording
    const sessionRecording = await prisma.sessionRecording.create({
      data: {
        candidateId: candidate.id,
        status: "ACTIVE",
      },
    });

    // Update candidate status
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    logger.info('[Interview Start] New session created', {
      candidateId: candidate.id,
      sessionId: sessionRecording.id,
      assessmentId: candidate.assessmentId,
    });

    return success({
      sessionId: sessionRecording.id,
      candidateId: candidate.id,
      message: "Interview session created successfully",
    });
});
