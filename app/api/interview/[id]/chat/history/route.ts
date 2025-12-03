import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, NotFoundError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

/**
 * GET /api/interview/[id]/chat/history
 * Retrieve chat history for a session
 *
 * Returns messages in the format expected by the AIChat component
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  logger.debug('[Chat History] Fetching history', { candidateId: id });

  // Get candidate and verify authorization
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
      sessionRecording: true,
    },
  });

  if (!candidate) {
    throw new NotFoundError("Interview session");
  }

  // Check authorization
  const isOrgMember = candidate.organization.members.length > 0;
  const isSelfInterview = candidate.email === session.user.email;

  if (!isOrgMember && !isSelfInterview) {
    throw new AuthorizationError("You do not have access to this interview session");
  }

  // Get chat history from session recording
  if (!candidate.sessionRecording) {
    logger.info('[Chat History] No session recording found', { candidateId: id });
    return success({ messages: [] });
  }

  // Fetch all interactions for this session, ordered by creation time
  const interactions = await prisma.claudeInteraction.findMany({
    where: {
      sessionId: candidate.sessionRecording.id,
    },
    orderBy: {
      timestamp: "asc",
    },
    select: {
      id: true,
      role: true,
      content: true,
      timestamp: true,
      inputTokens: true,
      outputTokens: true,
    },
  });

  // Transform to frontend message format
  const messages = interactions.map((interaction) => ({
    id: interaction.id,
    role: interaction.role as "user" | "assistant",
    content: interaction.content,
    timestamp: interaction.timestamp,
    tokenUsage:
      interaction.inputTokens || interaction.outputTokens
        ? {
            inputTokens: interaction.inputTokens || 0,
            outputTokens: interaction.outputTokens || 0,
          }
        : undefined,
  }));

  logger.info('[Chat History] History retrieved', {
    candidateId: id,
    sessionId: candidate.sessionRecording.id,
    messageCount: messages.length,
  });

  return success({ messages });
});
