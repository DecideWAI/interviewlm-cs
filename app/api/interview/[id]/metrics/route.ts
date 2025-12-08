import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import {
  InterviewAgent,
  createInterviewAgent,
  getSessionMetrics,
} from "@/lib/agents/interview-agent";
import { InterviewEventType } from "@/lib/types/interview-agent";

// Request validation schema for recording events
const eventRequestSchema = z.object({
  eventType: z.enum([
    "session-started",
    "ai-interaction",
    "code-changed",
    "test-run",
    "question-answered",
    "session-complete",
  ]),
  eventData: z.record(z.any()).default({}),
});

/**
 * GET /api/interview/[id]/metrics
 * Get current interview metrics for a session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify candidate exists and user has access
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
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get cached metrics
    const metrics = getSessionMetrics(id);

    if (!metrics) {
      return NextResponse.json(
        { error: "No metrics found for session" },
        { status: 404 }
      );
    }

    // Return summary metrics
    return NextResponse.json(
      {
        sessionId: metrics.sessionId,
        irtTheta: metrics.irtTheta,
        irtStandardError: metrics.irtStandardError,
        currentDifficulty: metrics.currentDifficulty,
        recommendedNextDifficulty: metrics.recommendedNextDifficulty,
        aiDependencyScore: metrics.aiDependencyScore,
        questionsAnswered: metrics.questionsAnswered,
        questionsCorrect: metrics.questionsCorrect,
        questionsIncorrect: metrics.questionsIncorrect,
        testFailureRate: metrics.testFailureRate,
        strugglingIndicators: metrics.strugglingIndicators,
        lastUpdated: metrics.lastUpdated,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Metrics GET API error:", error);
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
 * POST /api/interview/[id]/metrics
 * Record an interview event and get updated metrics
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = eventRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { eventType, eventData } = validationResult.data;

    // Verify candidate exists and user has access
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
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create or get Interview Agent for this session
    const agent = createInterviewAgent({
      sessionId: id,
      candidateId: candidate.id,
    });

    // Process the event
    const result = await agent.processEvent(
      eventType as InterviewEventType,
      eventData
    );

    // Return updated metrics
    return NextResponse.json(
      {
        success: true,
        eventType,
        metrics: {
          sessionId: result.metrics.sessionId,
          irtTheta: result.metrics.irtTheta,
          currentDifficulty: result.metrics.currentDifficulty,
          recommendedNextDifficulty: result.metrics.recommendedNextDifficulty,
          aiDependencyScore: result.metrics.aiDependencyScore,
          questionsAnswered: result.metrics.questionsAnswered,
          strugglingIndicators: result.metrics.strugglingIndicators,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Metrics POST API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
