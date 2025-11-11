import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

// Validation schema for assessment creation
const createAssessmentSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  role: z.string().min(1),
  seniority: z.enum(["JUNIOR", "MID", "SENIOR", "LEAD", "PRINCIPAL"]),
  techStack: z.array(z.string()).min(1, "At least one technology required"),
  duration: z.number().min(30).max(240), // 30 minutes to 4 hours
  enableCoding: z.boolean().default(true),
  enableTerminal: z.boolean().default(true),
  enableAI: z.boolean().default(true),
});

const listAssessmentsSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  role: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * POST /api/assessments
 * Create a new assessment
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createAssessmentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Get user's organization
    const userOrg = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
      include: { organization: true },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "User not associated with any organization" },
        { status: 400 }
      );
    }

    // Create assessment
    const assessment = await prisma.assessment.create({
      data: {
        organizationId: userOrg.organizationId,
        createdById: session.user.id,
        title: data.title,
        description: data.description,
        role: data.role,
        seniority: data.seniority,
        duration: data.duration,
        techStack: data.techStack,
        enableCoding: data.enableCoding,
        enableTerminal: data.enableTerminal,
        enableAI: data.enableAI,
        status: "DRAFT",
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        assessment: {
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
          role: assessment.role,
          seniority: assessment.seniority,
          duration: assessment.duration,
          techStack: assessment.techStack,
          status: assessment.status,
          enableCoding: assessment.enableCoding,
          enableTerminal: assessment.enableTerminal,
          enableAI: assessment.enableAI,
          createdBy: assessment.createdBy,
          createdAt: assessment.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating assessment:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/assessments
 * List assessments with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      status: searchParams.get("status") || undefined,
      role: searchParams.get("role") || undefined,
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "20",
    };

    const validationResult = listAssessmentsSchema.safeParse(queryParams);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { status, role, page, limit } = validationResult.data;

    // Get user's organization
    const userOrg = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "User not associated with any organization" },
        { status: 400 }
      );
    }

    // Build where clause
    const where: any = {
      organizationId: userOrg.organizationId,
    };

    if (status) {
      where.status = status;
    }

    if (role) {
      where.role = role;
    }

    // Get total count for pagination
    const total = await prisma.assessment.count({ where });

    // Get assessments with pagination
    const assessments = await prisma.assessment.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        candidates: {
          select: {
            id: true,
            status: true,
            overallScore: true,
          },
        },
        _count: {
          select: {
            candidates: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate stats for each assessment
    const assessmentsWithStats = assessments.map((assessment) => {
      const candidateCount = assessment._count.candidates;
      const completedCount = assessment.candidates.filter(
        (c) => c.status === "COMPLETED" || c.status === "EVALUATED"
      ).length;
      const avgScore = assessment.candidates.length > 0
        ? assessment.candidates
            .filter((c) => c.overallScore !== null)
            .reduce((sum, c) => sum + (c.overallScore || 0), 0) /
          assessment.candidates.filter((c) => c.overallScore !== null).length
        : null;

      return {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        role: assessment.role,
        seniority: assessment.seniority,
        duration: assessment.duration,
        techStack: assessment.techStack,
        status: assessment.status,
        createdBy: assessment.createdBy,
        createdAt: assessment.createdAt,
        publishedAt: assessment.publishedAt,
        stats: {
          candidateCount,
          completedCount,
          completionRate:
            candidateCount > 0 ? completedCount / candidateCount : 0,
          avgScore: avgScore ? Math.round(avgScore) : null,
        },
      };
    });

    return NextResponse.json({
      assessments: assessmentsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error listing assessments:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
