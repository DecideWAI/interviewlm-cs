import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { name, description } = await req.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    // Get user with organization
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMember: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get user's organization (first one if they have multiple)
    const organizationMember = user.organizationMember[0];
    if (!organizationMember) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 }
      );
    }

    // Check if user has permission to update (OWNER or ADMIN)
    if (!["OWNER", "ADMIN"].includes(organizationMember.role)) {
      return NextResponse.json(
        { error: "You don't have permission to update organization settings" },
        { status: 403 }
      );
    }

    // Update organization
    const updatedOrganization = await prisma.organization.update({
      where: { id: organizationMember.organizationId },
      data: {
        name,
        description: description || null,
      },
    });

    return NextResponse.json({
      message: "Organization updated successfully",
      organization: {
        id: updatedOrganization.id,
        name: updatedOrganization.name,
        description: updatedOrganization.description,
        slug: updatedOrganization.slug,
      },
    });
  } catch (error) {
    console.error("Organization setup error:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    );
  }
}
