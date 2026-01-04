import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  regenerateVerificationToken,
  getOrganizationVerificationInfo,
} from "@/lib/services/organization";
import { sendDomainVerificationEmail } from "@/lib/services/email";
import { logger } from "@/lib/utils/logger";

/**
 * Resend Domain Verification Email
 *
 * Allows organization owners to resend the domain verification email.
 * Regenerates the token to ensure security.
 *
 * POST /api/organization/resend-verification
 */
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's organization membership
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      role: "OWNER",
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "You must be an organization owner to resend verification" },
      { status: 403 }
    );
  }

  const org = membership.organization;

  if (org.domainVerified) {
    return NextResponse.json(
      { error: "Domain is already verified" },
      { status: 400 }
    );
  }

  if (!org.domain) {
    return NextResponse.json(
      { error: "No domain associated with this organization" },
      { status: 400 }
    );
  }

  try {
    // Regenerate token for security
    await regenerateVerificationToken(org.id);

    // Get updated org info with new token
    const updatedOrg = await getOrganizationVerificationInfo(org.id);
    if (!updatedOrg || !updatedOrg.domain) {
      return NextResponse.json(
        { error: "Failed to get organization info" },
        { status: 500 }
      );
    }

    // Send verification email to the requesting user (founder/owner)
    const recipientEmail = session.user.email || "";
    await sendDomainVerificationEmail({
      to: recipientEmail,
      organizationName: updatedOrg.name,
      domain: updatedOrg.domain,
      founderEmail: recipientEmail,
      founderName: session.user.name || null,
    });

    logger.info("[ResendVerification] Verification email sent", {
      recipient: recipientEmail,
      domain: updatedOrg.domain,
      organizationId: org.id,
    });

    return NextResponse.json({
      message: `Verification email sent to ${recipientEmail}`,
    });
  } catch (error) {
    logger.error(
      "[ResendVerification] Failed",
      error instanceof Error ? error : new Error(String(error)),
      { organizationId: org.id }
    );
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
