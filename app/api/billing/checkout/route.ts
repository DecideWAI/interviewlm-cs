import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { createCheckout, PADDLE_PRODUCTS } from "@/lib/services/paddle";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";

// Request validation schema
const checkoutSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  quantity: z.number().int().positive().default(1),
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
  const { productId, quantity } = checkoutSchema.parse(body);

  // Validate product exists
  const product = Object.values(PADDLE_PRODUCTS).find(
    (p) => p.id === productId
  );

  if (!product) {
    throw new ValidationError("Invalid product ID");
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
    throw new NotFoundError("User", session.user.email);
  }

  // Get user's organization (first one if they have multiple)
  const organizationMember = user.organizationMember[0];
  if (!organizationMember) {
    throw new NotFoundError("Organization membership");
  }

  // Create checkout session with performance logging
  const checkout = await logger.time(
    'createCheckout',
    () => createCheckout({
      organizationId: organizationMember.organizationId,
      productId,
      userId: user.id,
      email: user.email,
      quantity,
    }),
    {
      userId: user.id,
      organizationId: organizationMember.organizationId,
      productId,
      quantity,
    }
  );

  logger.info('Checkout created', {
    userId: user.id,
    organizationId: organizationMember.organizationId,
    productId,
    quantity,
    checkoutId: checkout.checkoutId,
  });

  return success({
    checkoutUrl: checkout.checkoutUrl,
    checkoutId: checkout.checkoutId,
  });
});
