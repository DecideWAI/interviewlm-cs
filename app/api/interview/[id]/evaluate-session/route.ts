import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { createSessionEvaluationAgent } from "@/lib/agents/session-evaluation-agent";
import { SessionData } from "@/lib/types/session-evaluation";
import { getSessionMetrics } from "@/lib/agents/interview-agent";

// Request validation schema
const evaluateRequestSchema = z.object({
  // Optional overrides - if not provided, will fetch from database
  codeSnapshots: z
    .array(
      z.object({
        timestamp: z.string(),
        files: z.record(z.string()),
      })
    )
    .optional(),
  testResults: z
    .array(
      z.object({
        timestamp: z.string().optional(),
        passed: z.number(),
        failed: z.number(),
        total: z.number(),
        coverage: z.number().optional(),
      })
    )
    .optional(),
  claudeInteractions: z
    .array(
      z.object({
        candidateMessage: z.string(),
        assistantMessage: z.string().optional(),
        timestamp: z.string().optional(),
        toolsUsed: z.array(z.string()).optional(),
      })
    )
    .optional(),
  terminalCommands: z
    .array(
      z.object({
        command: z.string(),
        output: z.string().optional(),
        exitCode: z.number().optional(),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * POST /api/interview/[id]/evaluate-session
 * Run full session evaluation with 4 dimensions
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
    const validationResult = evaluateRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const requestData = validationResult.data;

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
    if (!isOrgMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build session data from request or database
    const sessionData: SessionData = {
      sessionId: id,
      candidateId: candidate.id,
      codeSnapshots: requestData.codeSnapshots || [],
      testResults: requestData.testResults || [],
      claudeInteractions: requestData.claudeInteractions || [],
      terminalCommands: requestData.terminalCommands,
    };

    // If no data provided, try to extract from session event log
    if (
      sessionData.codeSnapshots.length === 0 &&
      candidate.sessionRecording
    ) {
      // Fetch events from unified event store
      const events = await prisma.sessionEventLog.findMany({
        where: { sessionId: candidate.sessionRecording.id },
        orderBy: { sequenceNumber: "asc" },
      });

      // Extract code snapshots from events
      const codeSnapshots = events
        .filter((e) => e.eventType === "code.snapshot")
        .map((e) => ({
          timestamp: e.timestamp.toISOString(),
          files: (e.data as Record<string, unknown>)?.files as Record<string, string> || {},
        }));

      if (codeSnapshots.length > 0) {
        sessionData.codeSnapshots = codeSnapshots;
      }

      // Extract test results from events
      const testResults = events
        .filter((e) => e.eventType === "test.run_complete" || e.eventType === "test_run")
        .map((e) => {
          const data = e.data as Record<string, unknown>;
          return {
            timestamp: e.timestamp.toISOString(),
            passed: (data?.passed as number) || 0,
            failed: (data?.failed as number) || 0,
            total: (data?.total as number) || 0,
            coverage: data?.coverage as number | undefined,
          };
        });

      if (testResults.length > 0) {
        sessionData.testResults = testResults;
      }

      // Extract AI interactions from events (chat messages)
      const aiInteractions = events
        .filter((e) => e.category === "chat" && (e.eventType === "chat.user_message" || e.eventType === "chat.assistant_message"))
        .reduce((acc: any[], e) => {
          const data = e.data as Record<string, unknown>;
          if (data?.role === "user") {
            acc.push({
              candidateMessage: (data?.content as string) || "",
              assistantMessage: undefined,
              timestamp: e.timestamp.toISOString(),
              toolsUsed: undefined,
            });
          } else if (data?.role === "assistant" && acc.length > 0) {
            // Associate assistant message with previous user message
            const lastInteraction = acc[acc.length - 1];
            if (!lastInteraction.assistantMessage) {
              lastInteraction.assistantMessage = data?.content as string;
              const metadata = data?.metadata as Record<string, unknown>;
              lastInteraction.toolsUsed = metadata?.toolsUsed as string[] | undefined;
            }
          }
          return acc;
        }, []);

      if (aiInteractions.length > 0) {
        sessionData.claudeInteractions = aiInteractions;
      }

      // Extract terminal commands from events
      const terminalCommands = events
        .filter((e) => e.eventType === "terminal.input" || e.eventType === "terminal_input")
        .map((e) => {
          const data = e.data as Record<string, unknown>;
          return {
            command: (data?.command as string) || "",
            output: data?.output as string | undefined,
            exitCode: data?.exitCode as number | undefined,
            timestamp: e.timestamp.toISOString(),
          };
        });

      if (terminalCommands.length > 0) {
        sessionData.terminalCommands = terminalCommands;
      }
    }

    // Get interview metrics if available
    const interviewMetrics = getSessionMetrics(id);
    if (interviewMetrics) {
      sessionData.interviewMetrics = {
        aiDependencyScore: interviewMetrics.aiDependencyScore,
        irtTheta: interviewMetrics.irtTheta,
        strugglingIndicators: interviewMetrics.strugglingIndicators,
      };
    }

    // Create and run evaluation agent
    const agent = createSessionEvaluationAgent({
      sessionId: id,
      candidateId: candidate.id,
    });

    const result = await agent.evaluateSession(sessionData);

    // Return evaluation result
    return NextResponse.json(
      {
        success: true,
        result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Session evaluation API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
