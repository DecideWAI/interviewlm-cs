import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";

/**
 * GET /api/user/active-organization
 * Get the active organization for the current user
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get active organization from cookie
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get("active_organization_id")?.value;

    // If no active org in cookie, get user's first organization
    if (!activeOrgId) {
      const firstMembership = await prisma.organizationMember.findFirst({
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

      if (!firstMembership) {
        return NextResponse.json(
          { error: "User is not a member of any organization" },
          { status: 404 }
        );
      }

      // Set cookie for future requests
      const response = NextResponse.json({
        organization: {
          id: firstMembership.organization.id,
          name: firstMembership.organization.name,
          slug: firstMembership.organization.slug,
          plan: firstMembership.organization.plan,
          credits: firstMembership.organization.credits,
          role: firstMembership.role,
        },
      });

      response.cookies.set("active_organization_id", firstMembership.organization.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: "/",
      });

      return response;
    }

    // Verify user has access to this organization
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: activeOrgId,
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
    });

    if (!membership) {
      // User no longer has access - clear cookie and return error
      const response = NextResponse.json(
        { error: "Access to organization denied" },
        { status: 403 }
      );
      response.cookies.delete("active_organization_id");
      return response;
    }

    return NextResponse.json({
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        plan: membership.organization.plan,
        credits: membership.organization.credits,
        role: membership.role,
      },
    });
  } catch (error) {
    console.error("Error fetching active organization:", error);
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
 * POST /api/user/active-organization
 * Set the active organization for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Verify user is a member of this organization
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId,
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
    });

    if (!membership) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 403 }
      );
    }

    // Set cookie
    const response = NextResponse.json({
      success: true,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        plan: membership.organization.plan,
        credits: membership.organization.credits,
        role: membership.role,
      },
    });

    response.cookies.set("active_organization_id", organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error setting active organization:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
