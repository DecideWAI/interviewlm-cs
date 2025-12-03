/**
 * LangGraph Health Check
 * GET /api/langgraph/health - Check Python LangGraph server health
 */

import { NextResponse } from "next/server";

const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL || "http://localhost:8080";

/**
 * GET /api/langgraph/health
 * Checks if the Python LangGraph server is healthy
 */
export async function GET() {
  try {
    const response = await fetch(`${LANGGRAPH_API_URL}/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "unhealthy",
          langgraph: "unreachable",
          url: LANGGRAPH_API_URL,
        },
        { status: 503 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      status: "healthy",
      langgraph: "connected",
      langgraphStatus: data.status,
      langgraphVersion: data.version,
      url: LANGGRAPH_API_URL,
    });
  } catch (error) {
    console.error("[LangGraph Health] Error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        langgraph: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        url: LANGGRAPH_API_URL,
      },
      { status: 503 }
    );
  }
}
