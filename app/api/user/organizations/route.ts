import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

/**
 * GET /api/user/organizations
 * Get all organizations the current user is a member of
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all organizations user is a member of
    const memberships = await prisma.organizationMember.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            credits: true,
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    const organizations = memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      plan: membership.organization.plan,
      credits: membership.organization.credits,
      role: membership.role,
      joinedAt: membership.joinedAt,
    }));

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("Error fetching user organizations:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
