import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, NotFoundError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

/**
 * GET /api/organization/current
 * Get current user's organization information
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  const session = await getSession();

  if (!session?.user?.id) {
    throw new AuthorizationError();
  }

  logger.debug('[Org Current] Fetching organization', { userId: session.user.id });

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
            paddleSubscriptionId: true,
            billingInterval: true,
            subscriptionEndsAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundError("Organization for user");
    }

    logger.info('[Org Current] Organization retrieved', {
      userId: session.user.id,
      organizationId: membership.organization.id,
      role: membership.role,
      plan: membership.organization.plan,
    });

    return success({
      organization: membership.organization,
      role: membership.role,
    });
});
