import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 400 }
      );
    }

    // Find candidate by invitation token
    const candidate = await prisma.candidate.findFirst({
      where: {
        invitationToken: token,
      },
      include: {
        assessment: true,
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Invalid invitation link" },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    const now = new Date();
    if (candidate.invitationExpiresAt && candidate.invitationExpiresAt < now) {
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 }
      );
    }

    // Check if already completed
    if (candidate.status === "COMPLETED" || candidate.status === "SUBMITTED") {
      return NextResponse.json(
        { error: "Interview already completed" },
        { status: 400 }
      );
    }

    // If already has a session, return that session ID
    if (candidate.sessionId) {
      return NextResponse.json({
        sessionId: candidate.sessionId,
        message: "Resuming existing session",
      });
    }

    // Create a new interview session
    const sessionId = crypto.randomBytes(16).toString("hex");

    // Update candidate with session ID and status
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        sessionId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    return NextResponse.json({
      sessionId,
      message: "Interview session created successfully",
    });
  } catch (error) {
    console.error("Start interview error:", error);
    return NextResponse.json(
      { error: "Failed to start interview" },
      { status: 500 }
    );
  }
}
