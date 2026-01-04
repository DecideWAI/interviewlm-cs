import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import {
  withErrorHandling,
  AuthorizationError,
  ConflictError,
} from "@/lib/utils/errors";
import { created } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";
import { ensureUserHasOrganization } from "@/lib/services/organization";

/**
 * POST /api/organization/create
 *
 * Creates an organization for the authenticated user if they don't have one.
 * This is a fallback endpoint for edge cases where automatic creation failed
 * (e.g., if the signIn callback failed to create an organization for an OAuth user).
 *
 * Returns 409 Conflict if the user already has an organization.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  const session = await getSession();

  if (!session?.user?.id || !session?.user?.email) {
    throw new AuthorizationError();
  }

  logger.debug("[Org Create] Creating organization for user", {
    userId: session.user.id,
  });

  // Check if user already has an organization
  const existingMembership = await prisma.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  });

  if (existingMembership) {
    throw new ConflictError("User already has an organization", {
      organizationId: existingMembership.organizationId,
      organizationName: existingMembership.organization.name,
    });
  }

  // Create organization
  const organization = await ensureUserHasOrganization({
    userId: session.user.id,
    userName: session.user.name ?? null,
    userEmail: session.user.email,
  });

  logger.info("[Org Create] Organization created via API fallback", {
    userId: session.user.id,
    organizationId: organization.id,
    organizationSlug: organization.slug,
  });

  return created({
    message: "Organization created successfully",
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      credits: organization.credits,
    },
  });
});
