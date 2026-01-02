/**
 * LangGraph Evaluation Proxy
 * POST /api/langgraph/evaluation/evaluate - Proxy to Python LangGraph server
 *
 * Proxies session evaluation requests to the Python LangGraph API.
 *
 * The evaluation agent uses agentic discovery - it will:
 * 1. Query the database for session metadata, interactions, and test results
 * 2. Explore the Modal workspace to read code files
 * 3. Analyze and score across all 4 dimensions
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || "http://localhost:8080";

// Request validation schema - only session_id and candidate_id required
const evaluationRequestSchema = z.object({
  sessionId: z.string(),
  candidateId: z.string(),
});

/**
 * POST /api/langgraph/evaluation/evaluate
 * Proxies session evaluation to Python LangGraph Evaluation Agent
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
    const validationResult = evaluationRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { sessionId, candidateId } = validationResult.data;

    // Verify candidate exists and user is org member (only admins can evaluate)
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
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Only org members can evaluate candidates
    if (candidate.organization.members.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Proxy to LangGraph API - agent discovers data via tools
    const langGraphResponse = await fetch(`${LANGGRAPH_API_URL}/api/evaluation/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        candidate_id: candidateId,
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
      candidateId: data.candidate_id,
      overallScore: data.overall_score,
      codeQuality: data.code_quality,
      problemSolving: data.problem_solving,
      aiCollaboration: data.ai_collaboration,
      communication: data.communication,
      confidence: data.confidence,
      biasFlags: data.bias_flags,
    });
  } catch (error) {
    console.error("[LangGraph Proxy] Error:", error);
    return NextResponse.json(
      { error: "Failed to proxy to LangGraph" },
      { status: 500 }
    );
  }
}
