/**
 * Admin API for Agent Experiments Management
 *
 * GET /api/admin/agent-config/experiments - List experiments
 * POST /api/admin/agent-config/experiments - Create experiment
 * PATCH /api/admin/agent-config/experiments - Update experiment status
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { agentAssignmentService } from "@/lib/experiments";

// Request validation schemas
const createExperimentSchema = z.object({
  configId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  controlBackend: z.enum(["CLAUDE_SDK", "LANGGRAPH"]).default("LANGGRAPH"),
  treatmentBackend: z.enum(["CLAUDE_SDK", "LANGGRAPH"]).default("CLAUDE_SDK"),
  controlPercent: z.number().min(0).max(100).default(50),
  treatmentPercent: z.number().min(0).max(100).default(50),
  targetingRules: z
    .object({
      seniorityIn: z.array(z.string()).optional(),
      roleIn: z.array(z.string()).optional(),
      assessmentTypeIn: z.array(z.string()).optional(),
    })
    .optional(),
});

const updateExperimentSchema = z.object({
  id: z.string(),
  status: z.enum(["DRAFT", "RUNNING", "PAUSED", "COMPLETED", "CANCELLED"]),
});

/**
 * GET /api/admin/agent-config/experiments
 * List experiments with results
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get("configId");
    const status = searchParams.get("status");

    const experiments = await prisma.agentExperiment.findMany({
      where: {
        ...(configId && { configId }),
        ...(status && { status: status as any }),
      },
      include: {
        config: {
          select: {
            id: true,
            organizationId: true,
            assessmentId: true,
            description: true,
          },
        },
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Add detailed results for each experiment
    const experimentsWithResults = await Promise.all(
      experiments.map(async (exp) => {
        const results = await agentAssignmentService.getExperimentResults(exp.id);
        return {
          ...exp,
          results,
        };
      })
    );

    return NextResponse.json({ experiments: experimentsWithResults });
  } catch (error) {
    console.error("[Experiments] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch experiments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/agent-config/experiments
 * Create new experiment
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = createExperimentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify config exists
    const config = await prisma.agentConfig.findUnique({
      where: { id: data.configId },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Agent config not found" },
        { status: 404 }
      );
    }

    const experiment = await prisma.agentExperiment.create({
      data: {
        configId: data.configId,
        name: data.name,
        description: data.description,
        controlBackend: data.controlBackend,
        treatmentBackend: data.treatmentBackend,
        controlPercent: data.controlPercent,
        treatmentPercent: data.treatmentPercent,
        targetingRules: data.targetingRules || {},
        status: "DRAFT",
        createdBy: session.user.id,
      },
    });

    return NextResponse.json({ experiment });
  } catch (error) {
    console.error("[Experiments] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create experiment" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/agent-config/experiments
 * Update experiment status
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = updateExperimentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { id, status } = validationResult.data;

    // Determine timestamp updates based on status change
    const timestampUpdates: Record<string, Date | null> = {};
    if (status === "RUNNING") {
      timestampUpdates.startedAt = new Date();
    } else if (status === "COMPLETED" || status === "CANCELLED") {
      timestampUpdates.endedAt = new Date();
    }

    const experiment = await prisma.agentExperiment.update({
      where: { id },
      data: {
        status,
        ...timestampUpdates,
      },
    });

    // If starting experiment, ensure config has experiments enabled
    if (status === "RUNNING") {
      await prisma.agentConfig.update({
        where: { id: experiment.configId },
        data: { enableExperiments: true },
      });
    }

    return NextResponse.json({ experiment });
  } catch (error) {
    console.error("[Experiments] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update experiment" },
      { status: 500 }
    );
  }
}
