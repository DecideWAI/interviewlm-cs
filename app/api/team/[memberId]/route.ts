import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/prisma";

// Update team member
export async function PATCH(
  req: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { memberId } = params;
    const { role } = await req.json();

    if (!role || typeof role !== "string") {
      return NextResponse.json(
        { error: "Role is required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["OWNER", "ADMIN", "MEMBER"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMember: true,
      },
    });

    if (!currentUser || !currentUser.organizationMember[0]) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const currentMembership = currentUser.organizationMember[0];

    // Check if current user has permission (OWNER or ADMIN)
    if (!["OWNER", "ADMIN"].includes(currentMembership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to update team members" },
        { status: 403 }
      );
    }

    // Get the membership being updated
    const membershipToUpdate = await prisma.organizationMember.findUnique({
      where: { id: memberId },
      include: {
        user: true,
      },
    });

    if (!membershipToUpdate) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    // Check if membership belongs to the same organization
    if (membershipToUpdate.organizationId !== currentMembership.organizationId) {
      return NextResponse.json(
        { error: "Team member not found in your organization" },
        { status: 404 }
      );
    }

    // Prevent changing own role
    if (membershipToUpdate.userId === currentUser.id) {
      return NextResponse.json(
        { error: "You cannot change your own role" },
        { status: 400 }
      );
    }

    // Only OWNER can promote to OWNER or demote OWNER
    if ((role === "OWNER" || membershipToUpdate.role === "OWNER") && currentMembership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only organization owners can manage owner roles" },
        { status: 403 }
      );
    }

    // Update the membership
    const updatedMembership = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: true,
      },
    });

    return NextResponse.json({
      message: "Team member updated successfully",
      member: {
        id: updatedMembership.id,
        email: updatedMembership.user.email,
        name: updatedMembership.user.name,
        role: updatedMembership.role,
      },
    });
  } catch (error) {
    console.error("Team member update error:", error);
    return NextResponse.json(
      { error: "Failed to update team member" },
      { status: 500 }
    );
  }
}

// Delete team member
export async function DELETE(
  req: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { memberId } = params;

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMember: true,
      },
    });

    if (!currentUser || !currentUser.organizationMember[0]) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const currentMembership = currentUser.organizationMember[0];

    // Check if current user has permission (OWNER or ADMIN)
    if (!["OWNER", "ADMIN"].includes(currentMembership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to remove team members" },
        { status: 403 }
      );
    }

    // Get the membership being deleted
    const membershipToDelete = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!membershipToDelete) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    // Check if membership belongs to the same organization
    if (membershipToDelete.organizationId !== currentMembership.organizationId) {
      return NextResponse.json(
        { error: "Team member not found in your organization" },
        { status: 404 }
      );
    }

    // Prevent removing self
    if (membershipToDelete.userId === currentUser.id) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    // Only OWNER can remove other OWNERS
    if (membershipToDelete.role === "OWNER" && currentMembership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only organization owners can remove other owners" },
        { status: 403 }
      );
    }

    // Prevent removing the last owner
    if (membershipToDelete.role === "OWNER") {
      const ownerCount = await prisma.organizationMember.count({
        where: {
          organizationId: currentMembership.organizationId,
          role: "OWNER",
        },
      });

      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner from the organization" },
          { status: 400 }
        );
      }
    }

    // Delete the membership
    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json({
      message: "Team member removed successfully",
    });
  } catch (error) {
    console.error("Team member delete error:", error);
    return NextResponse.json(
      { error: "Failed to remove team member" },
      { status: 500 }
    );
  }
}
