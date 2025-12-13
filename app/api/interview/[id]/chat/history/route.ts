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

  // Fetch all chat interactions from event store, ordered by sequence number
  const chatEvents = await prisma.sessionEventLog.findMany({
    where: {
      sessionId: candidate.sessionRecording.id,
      category: "chat",
      eventType: { in: ["chat.user_message", "chat.assistant_message"] },
    },
    orderBy: {
      sequenceNumber: "asc",
    },
    select: {
      id: true,
      timestamp: true,
      data: true,
    },
  });

  // Transform to frontend message format
  const messages = chatEvents.map((event) => {
    const data = event.data as any;
    return {
      id: event.id,
      role: (data.role || "user") as "user" | "assistant",
      content: data.content || "",
      timestamp: event.timestamp,
      tokenUsage:
        data.inputTokens || data.outputTokens
          ? {
              inputTokens: data.inputTokens || 0,
              outputTokens: data.outputTokens || 0,
            }
          : undefined,
      metadata: data.metadata,
    };
  });

  logger.info('[Chat History] History retrieved', {
    candidateId: id,
    sessionId: candidate.sessionRecording.id,
    messageCount: messages.length,
  });

  return success({ messages });
});
