import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, NotFoundError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

/**
 * Stream checkpoint data structure
 */
interface StreamCheckpointData {
  messageId: string;
  userMessage: string;
  partialResponse: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
    result?: string;
  }>;
  status: 'streaming' | 'completed' | 'failed';
  lastCheckpointAt: number;
  questionId: string;
}

// Checkpoint event type used in SessionEvent
const CHECKPOINT_EVENT_TYPE = 'stream_checkpoint';

// Maximum age for valid checkpoints (5 minutes)
const MAX_CHECKPOINT_AGE_MS = 5 * 60 * 1000;

/**
 * GET /api/interview/[id]/chat/checkpoint
 * Retrieve the latest active stream checkpoint for recovery
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: candidateId } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  logger.debug('[Checkpoint] Fetching checkpoint', { candidateId });

  // Get candidate and verify authorization
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

  // No session recording means no checkpoints
  if (!candidate.sessionRecording) {
    logger.info('[Checkpoint] No session recording found', { candidateId });
    return success({ checkpoint: null });
  }

  // Find the latest stream checkpoint
  const checkpoint = await prisma.sessionEvent.findFirst({
    where: {
      sessionId: candidate.sessionRecording.id,
      type: CHECKPOINT_EVENT_TYPE,
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  if (!checkpoint) {
    logger.info('[Checkpoint] No checkpoint found', { candidateId });
    return success({ checkpoint: null });
  }

  const checkpointData = checkpoint.data as unknown as StreamCheckpointData;

  // Only return checkpoint if it's still streaming and not too old
  const checkpointAge = Date.now() - checkpointData.lastCheckpointAt;

  if (checkpointData.status !== 'streaming' || checkpointAge > MAX_CHECKPOINT_AGE_MS) {
    logger.info('[Checkpoint] Checkpoint expired or completed', {
      candidateId,
      status: checkpointData.status,
      ageMs: checkpointAge,
    });
    return success({ checkpoint: null });
  }

  logger.info('[Checkpoint] Active checkpoint found', {
    candidateId,
    sessionId: candidate.sessionRecording.id,
    messageId: checkpointData.messageId,
    partialResponseLength: checkpointData.partialResponse?.length || 0,
    ageMs: checkpointAge,
  });

  return success({
    checkpoint: {
      id: checkpoint.id,
      messageId: checkpointData.messageId,
      userMessage: checkpointData.userMessage,
      partialResponse: checkpointData.partialResponse,
      toolCalls: checkpointData.toolCalls || [],
      status: checkpointData.status,
      lastCheckpointAt: checkpointData.lastCheckpointAt,
      questionId: checkpointData.questionId,
    },
  });
});

/**
 * DELETE /api/interview/[id]/chat/checkpoint
 * Clear all checkpoints for a session (called after successful stream completion)
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: candidateId } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  logger.debug('[Checkpoint] Clearing checkpoints', { candidateId });

  // Get candidate and verify authorization
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

  if (!candidate.sessionRecording) {
    return success({ deleted: 0 });
  }

  // Delete all stream checkpoints for this session
  const result = await prisma.sessionEvent.deleteMany({
    where: {
      sessionId: candidate.sessionRecording.id,
      type: CHECKPOINT_EVENT_TYPE,
    },
  });

  logger.info('[Checkpoint] Checkpoints cleared', {
    candidateId,
    sessionId: candidate.sessionRecording.id,
    deleted: result.count,
  });

  return success({ deleted: result.count });
});

/**
 * POST /api/interview/[id]/chat/checkpoint
 * Create or update a stream checkpoint (called periodically during streaming)
 *
 * This endpoint is typically called by the streaming route internally,
 * but is also exposed for manual recovery scenarios.
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: candidateId } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  const body = await request.json();
  const {
    messageId,
    userMessage,
    partialResponse,
    toolCalls = [],
    status = 'streaming',
    questionId,
  } = body as Partial<StreamCheckpointData>;

  if (!messageId || !userMessage || !questionId) {
    return NextResponse.json(
      { error: "Missing required fields: messageId, userMessage, questionId" },
      { status: 400 }
    );
  }

  logger.debug('[Checkpoint] Creating/updating checkpoint', { candidateId, messageId });

  // Get candidate and verify authorization
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

  if (!candidate.sessionRecording) {
    throw new NotFoundError("Session recording");
  }

  const checkpointData: StreamCheckpointData = {
    messageId,
    userMessage,
    partialResponse: partialResponse || '',
    toolCalls: toolCalls || [],
    status: status as 'streaming' | 'completed' | 'failed',
    lastCheckpointAt: Date.now(),
    questionId,
  };

  // Upsert the checkpoint - one checkpoint per messageId
  const existingCheckpoint = await prisma.sessionEvent.findFirst({
    where: {
      sessionId: candidate.sessionRecording.id,
      type: CHECKPOINT_EVENT_TYPE,
      data: {
        path: ['messageId'],
        equals: messageId,
      },
    },
  });

  let checkpoint;
  if (existingCheckpoint) {
    // Update existing checkpoint
    checkpoint = await prisma.sessionEvent.update({
      where: { id: existingCheckpoint.id },
      data: {
        timestamp: new Date(),
        data: checkpointData as any,
        checkpoint: true,
      },
    });
  } else {
    // Create new checkpoint
    checkpoint = await prisma.sessionEvent.create({
      data: {
        sessionId: candidate.sessionRecording.id,
        type: CHECKPOINT_EVENT_TYPE,
        data: checkpointData as any,
        checkpoint: true,
      },
    });
  }

  logger.info('[Checkpoint] Checkpoint saved', {
    candidateId,
    messageId,
    status,
    partialResponseLength: partialResponse?.length || 0,
  });

  return success({ checkpoint: { id: checkpoint.id, ...checkpointData } });
});
