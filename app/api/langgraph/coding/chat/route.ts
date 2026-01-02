/**
 * LangGraph Coding Chat Proxy
 * POST /api/langgraph/coding/chat - Proxy to Python LangGraph server
 *
 * Proxies requests to the Python LangGraph API for the coding agent.
 * Supports SSE streaming responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || "http://localhost:8080";

// Request validation schema
const chatRequestSchema = z.object({
  sessionId: z.string(),
  candidateId: z.string(),
  message: z.string().min(1, "Message is required"),
  helpfulnessLevel: z.enum(["consultant", "pair-programming", "full-copilot"]).optional(),
  problemStatement: z.string().optional(),
  codeContext: z.object({
    fileName: z.string().optional(),
    content: z.string().optional(),
    language: z.string().optional(),
  }).optional(),
});

/**
 * POST /api/langgraph/coding/chat
 * Proxies to Python LangGraph coding agent with SSE streaming
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
    const validationResult = chatRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { sessionId, candidateId, message, helpfulnessLevel, problemStatement, codeContext } = validationResult.data;

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
    const langGraphResponse = await fetch(`${LANGGRAPH_API_URL}/api/coding/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({
        session_id: sessionId,
        candidate_id: candidateId,
        message,
        helpfulness_level: helpfulnessLevel || "pair-programming",
        problem_statement: problemStatement,
        code_context: codeContext,
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

    // Stream the SSE response back to the client
    const reader = langGraphResponse.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { error: "No response body from LangGraph" },
        { status: 500 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          console.error("[LangGraph Proxy] Stream error:", error);
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[LangGraph Proxy] Error:", error);
    return NextResponse.json(
      { error: "Failed to proxy to LangGraph" },
      { status: 500 }
    );
  }
}
