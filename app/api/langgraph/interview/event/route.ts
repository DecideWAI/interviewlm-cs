/**
 * LangGraph Interview Event Proxy
 * POST /api/langgraph/interview/event - Proxy to Python LangGraph server
 *
 * Proxies interview event recording to the Python LangGraph API.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || "http://localhost:8080";

// Request validation schema
const eventRequestSchema = z.object({
  sessionId: z.string(),
  candidateId: z.string(),
  eventType: z.enum([
    "session-started",
    "ai-interaction",
    "code-changed",
    "test-run",
    "question-answered",
    "session-completed",
  ]),
  eventData: z.record(z.unknown()).optional(),
});

/**
 * POST /api/langgraph/interview/event
 * Proxies interview events to Python LangGraph Interview Agent
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validationResult = eventRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { sessionId, candidateId, eventType, eventData } = validationResult.data;

    // Verify candidate exists and belongs to authorized organization
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

    // Proxy to LangGraph API
    const langGraphResponse = await fetch(`${LANGGRAPH_API_URL}/api/interview/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        candidate_id: candidateId,
        event_type: eventType,
        event_data: eventData || {},
      }),
    });

    if (!langGraphResponse.ok) {
      const errorText = await langGraphResponse.text();
      console.error("[LangGraph Proxy] Error from LangGraph:", errorText);
      return NextResponse.json(
        { error: "LangGraph API error", details: errorText },
        { status: langGraphResponse.status }
      );
    }

    const data = await langGraphResponse.json();

    // Transform snake_case to camelCase for Next.js conventions
    return NextResponse.json({
      sessionId: data.session_id,
      irtTheta: data.irt_theta,
      currentDifficulty: data.current_difficulty,
      recommendedNextDifficulty: data.recommended_next_difficulty,
      aiDependencyScore: data.ai_dependency_score,
      questionsAnswered: data.questions_answered,
      strugglingIndicators: data.struggling_indicators,
    });
  } catch (error) {
    console.error("[LangGraph Proxy] Error:", error);
    return NextResponse.json(
      { error: "Failed to proxy to LangGraph" },
      { status: 500 }
    );
  }
}
