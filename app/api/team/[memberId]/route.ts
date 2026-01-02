import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

// Validation schema for role update
const updateRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER"], {
    errorMap: () => ({ message: "Invalid role. Must be OWNER, ADMIN, or MEMBER" }),
  }),
});

// Update team member
export const PATCH = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) => {
  const { memberId } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(req);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await auth();
  if (!session?.user?.email) {
    throw new AuthorizationError();
  }

  // Parse and validate request body
  const body = await req.json();
  const { role } = updateRoleSchema.parse(body);

  logger.info('[Team] Updating member role', {
    memberId,
    newRole: role,
    requestedBy: session.user.email,
  });

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMember: true,
      },
    });

    if (!currentUser || !currentUser.organizationMember[0]) {
      throw new NotFoundError("Organization");
    }

    const currentMembership = currentUser.organizationMember[0];

    // Check if current user has permission (OWNER or ADMIN)
    if (!["OWNER", "ADMIN"].includes(currentMembership.role)) {
      throw new AuthorizationError("You don't have permission to update team members");
    }

    // Get the membership being updated
    const membershipToUpdate = await prisma.organizationMember.findUnique({
      where: { id: memberId },
      include: {
        user: true,
      },
    });

    if (!membershipToUpdate) {
      throw new NotFoundError("Team member", memberId);
    }

    // Check if membership belongs to the same organization
    if (membershipToUpdate.organizationId !== currentMembership.organizationId) {
      throw new NotFoundError("Team member in your organization", memberId);
    }

    // Prevent changing own role
    if (membershipToUpdate.userId === currentUser.id) {
      throw new ValidationError("You cannot change your own role");
    }

    // Only OWNER can promote to OWNER or demote OWNER
    if ((role === "OWNER" || membershipToUpdate.role === "OWNER") && currentMembership.role !== "OWNER") {
      throw new AuthorizationError("Only organization owners can manage owner roles");
    }

    // Update the membership
    const updatedMembership = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: true,
      },
    });

    logger.info('[Team] Member role updated', {
      memberId,
      previousRole: membershipToUpdate.role,
      newRole: role,
      updatedBy: session.user.email,
    });

    return success({
      message: "Team member updated successfully",
      member: {
        id: updatedMembership.id,
        email: updatedMembership.user.email,
        name: updatedMembership.user.name,
        role: updatedMembership.role,
      },
    });
});

// Delete team member
export const DELETE = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) => {
  const { memberId } = await params;

  // Apply rate limiting
  const rateLimited = await standardRateLimit(req);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await auth();
  if (!session?.user?.email) {
    throw new AuthorizationError();
  }

  logger.info('[Team] Removing member', {
    memberId,
    requestedBy: session.user.email,
  });

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMember: true,
      },
    });

    if (!currentUser || !currentUser.organizationMember[0]) {
      throw new NotFoundError("Organization");
    }

    const currentMembership = currentUser.organizationMember[0];

    // Check if current user has permission (OWNER or ADMIN)
    if (!["OWNER", "ADMIN"].includes(currentMembership.role)) {
      throw new AuthorizationError("You don't have permission to remove team members");
    }

    // Get the membership being deleted
    const membershipToDelete = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!membershipToDelete) {
      throw new NotFoundError("Team member", memberId);
    }

    // Check if membership belongs to the same organization
    if (membershipToDelete.organizationId !== currentMembership.organizationId) {
      throw new NotFoundError("Team member in your organization", memberId);
    }

    // Prevent removing self
    if (membershipToDelete.userId === currentUser.id) {
      throw new ValidationError("You cannot remove yourself from the organization");
    }

    // Only OWNER can remove other OWNERS
    if (membershipToDelete.role === "OWNER" && currentMembership.role !== "OWNER") {
      throw new AuthorizationError("Only organization owners can remove other owners");
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
        throw new ValidationError("Cannot remove the last owner from the organization");
      }
    }

    // Delete the membership
    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    logger.info('[Team] Member removed', {
      memberId,
      role: membershipToDelete.role,
      removedBy: session.user.email,
      organizationId: currentMembership.organizationId,
    });

    return success({
      message: "Team member removed successfully",
    });
});
