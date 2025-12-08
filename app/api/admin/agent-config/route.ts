/**
 * Admin API for Agent Configuration Management
 *
 * GET /api/admin/agent-config - List all agent configs
 * POST /api/admin/agent-config - Create or update agent config
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

// Request validation schemas
const createConfigSchema = z.object({
  organizationId: z.string().optional().nullable(),
  assessmentId: z.string().optional().nullable(),
  defaultBackend: z.enum(["CLAUDE_SDK", "LANGGRAPH"]),
  enableExperiments: z.boolean().default(false),
  fallbackBackend: z.enum(["CLAUDE_SDK", "LANGGRAPH"]).default("LANGGRAPH"),
  langGraphWeight: z.number().min(0).max(100).default(100),
  claudeSdkWeight: z.number().min(0).max(100).default(0),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

/**
 * GET /api/admin/agent-config
 * List all agent configs (optionally filtered by org)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    const configs = await prisma.agentConfig.findMany({
      where: organizationId
        ? { organizationId }
        : undefined,
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        experiments: {
          select: {
            id: true,
            name: true,
            status: true,
            controlSessions: true,
            treatmentSessions: true,
            controlAvgScore: true,
            treatmentAvgScore: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ configs });
  } catch (error) {
    console.error("[AgentConfig] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent configs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/agent-config
 * Create or update agent config
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = createConfigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Upsert config (create or update based on unique constraint)
    const config = await prisma.agentConfig.upsert({
      where: {
        organizationId_assessmentId: {
          organizationId: data.organizationId ?? null,
          assessmentId: data.assessmentId ?? null,
        },
      },
      create: {
        organizationId: data.organizationId,
        assessmentId: data.assessmentId,
        defaultBackend: data.defaultBackend,
        enableExperiments: data.enableExperiments,
        fallbackBackend: data.fallbackBackend,
        langGraphWeight: data.langGraphWeight,
        claudeSdkWeight: data.claudeSdkWeight,
        description: data.description,
        isActive: data.isActive,
        createdBy: session.user.id,
      },
      update: {
        defaultBackend: data.defaultBackend,
        enableExperiments: data.enableExperiments,
        fallbackBackend: data.fallbackBackend,
        langGraphWeight: data.langGraphWeight,
        claudeSdkWeight: data.claudeSdkWeight,
        description: data.description,
        isActive: data.isActive,
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error("[AgentConfig] POST error:", error);
    return NextResponse.json(
      { error: "Failed to save agent config" },
      { status: 500 }
    );
  }
}
