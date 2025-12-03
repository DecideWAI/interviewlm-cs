import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

// Request validation schema
const setupSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(100),
  description: z.string().max(500).optional(),
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
  const { name, description } = setupSchema.parse(body);

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
    throw new NotFoundError("User", session.user.email);
  }

  // Get user's organization (first one if they have multiple)
  const organizationMember = user.organizationMember[0];
  if (!organizationMember) {
    throw new NotFoundError("Organization membership");
  }

  // Check if user has permission to update (OWNER or ADMIN)
  if (!["OWNER", "ADMIN"].includes(organizationMember.role)) {
    throw new AuthorizationError("You don't have permission to update organization settings");
  }

  // Update organization
  const updatedOrganization = await prisma.organization.update({
    where: { id: organizationMember.organizationId },
    data: {
      name,
      description: description || null,
    },
  });

  logger.info('Organization updated', {
    userId: user.id,
    organizationId: updatedOrganization.id,
    name,
  });

  return success({
    message: "Organization updated successfully",
    organization: {
      id: updatedOrganization.id,
      name: updatedOrganization.name,
      description: updatedOrganization.description,
      slug: updatedOrganization.slug,
    },
  });
});
