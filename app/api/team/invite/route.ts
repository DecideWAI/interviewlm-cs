import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendTeamInviteEmail } from "@/lib/services/email";
import crypto from "crypto";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { created } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";
import { withTransaction } from "@/lib/utils/db-helpers";

// Request validation schema
const inviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
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
  const { email, role } = inviteSchema.parse(body);

  // Get current user with organization
  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      organizationMember: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (!currentUser || !currentUser.organizationMember[0]) {
    throw new NotFoundError("Organization membership");
  }

  const organizationMembership = currentUser.organizationMember[0];
  const organization = organizationMembership.organization;

  // Check if current user has permission to invite (OWNER or ADMIN)
  if (!["OWNER", "ADMIN"].includes(organizationMembership.role)) {
    throw new AuthorizationError("You don't have permission to invite team members");
  }

  // Check if user being invited already exists
  let invitedUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Check if already a member
  if (invitedUser) {
    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: invitedUser.id,
        },
      },
    });

    if (existingMembership) {
      throw new ValidationError("User is already a member of this organization");
    }
  }

  // Create membership with atomic transaction
  const { membership, inviteToken, expiresAt } = await withTransaction(async (tx) => {
    // If user doesn't exist, create a placeholder user
    if (!invitedUser) {
      invitedUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name: email.split("@")[0],
          // No password - they'll set it when they verify their email
        },
      });
    }

    // Create organization membership
    const membership = await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: invitedUser!.id,
        role,
        // joinedAt will be null until they accept the invitation
      },
    });

    // Generate invitation token
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(inviteToken)
      .digest("hex");

    // Store invitation token (expires in 7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await tx.verificationToken.create({
      data: {
        identifier: `team-invite:${invitedUser!.id}:${organization.id}`,
        token: hashedToken,
        expires: expiresAt,
      },
    });

    return { membership, inviteToken, expiresAt };
  });

  // Send invitation email
  const inviteUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/team/accept-invite?token=${inviteToken}`;

  try {
    await sendTeamInviteEmail({
      to: email,
      inviterName: currentUser.name || "Someone",
      organizationName: organization.name,
      role,
      inviteUrl,
      expiresAt,
    });

    logger.info('Team invite email sent', {
      inviterId: currentUser.id,
      organizationId: organization.id,
      inviteeEmail: email,
      role,
    });
  } catch (emailError) {
    logger.error("Failed to send team invite email", emailError as Error, {
      inviterId: currentUser.id,
      organizationId: organization.id,
      inviteeEmail: email,
    });
    // Don't fail the invite if email fails
  }

  logger.info('Team member invited', {
    inviterId: currentUser.id,
    organizationId: organization.id,
    membershipId: membership.id,
    inviteeEmail: email,
    role,
  });

  return created({
    message: "Team member invited successfully",
    member: {
      id: membership.id,
      email: invitedUser!.email,
      role: membership.role,
      invitedAt: membership.invitedAt,
    },
  });
});
