import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { createSupervisorAgent } from "@/lib/agents/supervisor-agent";
import { SessionData } from "@/lib/types/session-evaluation";

// Request validation schema
const workflowRequestSchema = z.object({
  task: z.string().min(1, "Task description is required"),
  sessionId: z.string().min(1, "Session ID is required"),
  candidateId: z.string().optional(),
  // Optional session data for evaluation
  sessionData: z
    .object({
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
    })
    .optional(),
});

/**
 * POST /api/supervisor
 * Run a multi-agent workflow through the Supervisor
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = workflowRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { task, sessionId, candidateId, sessionData } = validationResult.data;

    // If candidateId not provided, try to get from sessionId (assuming sessionId is candidate ID)
    let resolvedCandidateId = candidateId;
    if (!resolvedCandidateId) {
      // Check if sessionId is a valid candidate
      const candidate = await prisma.candidate.findUnique({
        where: { id: sessionId },
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

      if (candidate) {
        // Check authorization
        const isOrgMember = candidate.organization.members.length > 0;
        if (!isOrgMember) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        resolvedCandidateId = candidate.id;
      } else {
        resolvedCandidateId = sessionId; // Use sessionId as candidateId
      }
    }

    // Create Supervisor Agent
    const supervisor = createSupervisorAgent({
      sessionId,
      candidateId: resolvedCandidateId,
    });

    // Set session data if provided
    if (sessionData) {
      const fullSessionData: SessionData = {
        sessionId,
        candidateId: resolvedCandidateId,
        codeSnapshots: sessionData.codeSnapshots || [],
        testResults: sessionData.testResults || [],
        claudeInteractions: sessionData.claudeInteractions || [],
        terminalCommands: sessionData.terminalCommands,
      };
      supervisor.setSessionData(fullSessionData);
    }

    // Run workflow
    const result = await supervisor.runWorkflow(task);

    return NextResponse.json(
      {
        success: true,
        result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Supervisor API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
