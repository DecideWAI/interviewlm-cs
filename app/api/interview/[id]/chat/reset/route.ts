import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

/**
 * POST /api/interview/[id]/chat/reset
 * Reset conversation history for a new question
 *
 * This ensures AI context doesn't bleed between questions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: candidateId } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { questionId } = body;

    // Get candidate and verify access
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

    // Get or create session recording
    let sessionRecording = candidate.sessionRecording;
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId,
          status: "ACTIVE",
        },
      });
    }

    // Get next sequence number
    const lastEvent = await prisma.sessionEventLog.findFirst({
      where: { sessionId: sessionRecording.id },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });
    const nextSeq = (lastEvent?.sequenceNumber ?? BigInt(-1)) + BigInt(1);

    // Record conversation reset event
    await prisma.sessionEventLog.create({
      data: {
        sessionId: sessionRecording.id,
        sequenceNumber: nextSeq,
        timestamp: new Date(),
        eventType: "chat.conversation_reset",
        category: "chat",
        data: {
          questionId,
          reason: "Moving to next question - conversation context cleared",
          timestamp: new Date().toISOString(),
        },
        checkpoint: true, // Mark as checkpoint for replay
      },
    });

    return NextResponse.json({
      success: true,
      message: "Conversation history reset successfully",
      sessionId: sessionRecording.id,
    });
  } catch (error) {
    console.error("Chat reset API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
