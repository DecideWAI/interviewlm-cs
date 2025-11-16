import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { sendTeamInviteEmail } from "@/lib/services/email";
import crypto from "crypto";

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

    const { email, role = "MEMBER" } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
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
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const organizationMembership = currentUser.organizationMember[0];
    const organization = organizationMembership.organization;

    // Check if current user has permission to invite (OWNER or ADMIN)
    if (!["OWNER", "ADMIN"].includes(organizationMembership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to invite team members" },
        { status: 403 }
      );
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
        return NextResponse.json(
          { error: "User is already a member of this organization" },
          { status: 400 }
        );
      }
    }

    // If user doesn't exist, create a placeholder user
    if (!invitedUser) {
      invitedUser = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: email.split("@")[0],
          // No password - they'll set it when they verify their email
        },
      });
    }

    // Create organization membership
    const membership = await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: invitedUser.id,
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

    await prisma.verificationToken.create({
      data: {
        identifier: `team-invite:${invitedUser.id}:${organization.id}`,
        token: hashedToken,
        expires: expiresAt,
      },
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
    } catch (emailError) {
      console.error("Failed to send team invite email:", emailError);
      // Don't fail the invite if email fails
    }

    return NextResponse.json({
      message: "Team member invited successfully",
      member: {
        id: membership.id,
        email: invitedUser.email,
        role: membership.role,
        invitedAt: membership.invitedAt,
      },
    });
  } catch (error) {
    console.error("Team invite error:", error);
    return NextResponse.json(
      { error: "Failed to invite team member" },
      { status: 500 }
    );
  }
}
