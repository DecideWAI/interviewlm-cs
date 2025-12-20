import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, ValidationError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { recordEvent } from "@/lib/services/sessions";
import prisma from "@/lib/prisma";

// Request validation schema
const answerRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  questionId: z.string().min(1, "Question ID is required"),
  selectedOption: z.string().optional(),
  customAnswer: z.string().optional(),
}).refine(
  (data) => data.selectedOption || data.customAnswer,
  { message: "Either selectedOption or customAnswer is required" }
);

/**
 * POST /api/interview/[id]/chat/answer
 * Submit an answer to an agent's clarifying question
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: candidateId } = await params;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  // Parse and validate request body
  const body = await request.json();
  const validationResult = answerRequestSchema.safeParse(body);

  if (!validationResult.success) {
    throw new ValidationError(validationResult.error.errors[0].message);
  }

  const { sessionId, questionId, selectedOption, customAnswer } = validationResult.data;

  // Verify the session exists and belongs to this candidate
  const sessionRecording = await prisma.sessionRecording.findFirst({
    where: {
      id: sessionId,
      candidateId,
    },
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

  if (!sessionRecording) {
    throw new ValidationError("Session not found");
  }

  // Check authorization
  const isOrgMember = sessionRecording.candidate.organization.members.length > 0;
  const isSelfInterview = sessionRecording.candidate.email === session.user.email;

  if (!isOrgMember && !isSelfInterview) {
    throw new AuthorizationError("Access denied to this interview session");
  }

  // Record the answer event
  await recordEvent(
    sessionId,
    "agent.question_answered",
    "USER",
    {
      questionId,
      selectedOption: selectedOption || null,
      customAnswer: customAnswer || null,
      responseTimestamp: Date.now(),
    },
    { checkpoint: true }
  );

  logger.info("[Chat Answer] Question answered", {
    candidateId,
    sessionId,
    questionId,
    hasSelectedOption: !!selectedOption,
    hasCustomAnswer: !!customAnswer,
  });

  // Return the answer text to be sent to the agent
  const answerText = selectedOption || customAnswer || "";

  return NextResponse.json({
    success: true,
    questionId,
    answerText,
  });
});
