import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

/**
 * GET /api/organization/current
 * Get current user's organization information
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

    // Get user's organization membership
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
            credits: true,
            subscriptionStatus: true,
            billingInterval: true,
            createdAt: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "No organization found for user" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      organization: membership.organization,
      role: membership.role,
    });
  } catch (error) {
    console.error("Error fetching current organization:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
