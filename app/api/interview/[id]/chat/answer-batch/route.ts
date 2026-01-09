import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, ValidationError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { recordEvent } from "@/lib/services/sessions";
import prisma from "@/lib/prisma";

// Answer object schema - supports both single-select and multi-select
const answerSchema = z.object({
  selectedOption: z.string().optional(),
  selectedOptions: z.array(z.string()).optional(),
  customAnswer: z.string().optional(),
}).refine(
  (data) => data.selectedOption || (data.selectedOptions && data.selectedOptions.length > 0) || data.customAnswer,
  { message: "Either selectedOption, selectedOptions, or customAnswer is required for each question" }
);

// Request validation schema
const batchAnswerRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  batchId: z.string().min(1, "Batch ID is required"),
  answers: z.record(z.string(), answerSchema).refine(
    (answers) => Object.keys(answers).length >= 1,
    { message: "At least one answer is required" }
  ),
});

/**
 * POST /api/interview/[id]/chat/answer-batch
 * Submit answers to a batch of agent clarifying questions (ask_questions tool)
 * Supports both single-select and multi-select questions.
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
  const validationResult = batchAnswerRequestSchema.safeParse(body);

  if (!validationResult.success) {
    throw new ValidationError(validationResult.error.errors[0].message);
  }

  const { sessionId, batchId, answers } = validationResult.data;

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

  // Build answers array with structured data for each question
  const answersArray = Object.entries(answers).map(([questionId, answer]) => {
    // Build response text based on answer type
    let responseText = "";
    if (answer.selectedOptions && answer.selectedOptions.length > 0) {
      // Multi-select: join with commas
      responseText = answer.selectedOptions.join(", ");
      if (answer.customAnswer) {
        responseText += `, ${answer.customAnswer}`;
      }
    } else {
      responseText = answer.selectedOption || answer.customAnswer || "";
    }

    return {
      questionId,
      selectedOption: answer.selectedOption || null,
      selectedOptions: answer.selectedOptions || null,
      customAnswer: answer.customAnswer || null,
      responseText,
      isMultiSelect: !!(answer.selectedOptions && answer.selectedOptions.length > 0),
    };
  });

  // Record the batch answer event
  await recordEvent(
    sessionId,
    "agent.questions_answered",
    "USER",
    {
      batchId,
      answers: answersArray,
      answerCount: answersArray.length,
      responseTimestamp: Date.now(),
    },
    { checkpoint: true }
  );

  logger.info("[Chat Answer Batch] Questions answered", {
    candidateId,
    sessionId,
    batchId,
    answerCount: answersArray.length,
    questionIds: Object.keys(answers),
    hasMultiSelect: answersArray.some((a) => a.isMultiSelect),
  });

  return NextResponse.json({
    success: true,
    batchId,
    answerCount: answersArray.length,
  });
});
