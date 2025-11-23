import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

/**
 * GET /api/interview/[id]/chat/history
 * Retrieve chat history for a session
 *
 * Returns messages in the format expected by the AIChat component
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Get chat history from session recording
    if (!candidate.sessionRecording) {
      return NextResponse.json({ messages: [] });
    }

    // Fetch all interactions for this session, ordered by creation time
    const interactions = await prisma.claudeInteraction.findMany({
      where: {
        sessionId: candidate.sessionRecording.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        inputTokens: true,
        outputTokens: true,
      },
    });

    // Transform to frontend message format
    const messages = interactions.map((interaction) => ({
      id: interaction.id,
      role: interaction.role as "user" | "assistant",
      content: interaction.content,
      timestamp: interaction.createdAt,
      tokenUsage:
        interaction.inputTokens || interaction.outputTokens
          ? {
              inputTokens: interaction.inputTokens || 0,
              outputTokens: interaction.outputTokens || 0,
            }
          : undefined,
    }));

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Chat history API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
      { status: 500 }
    );
  }
}
