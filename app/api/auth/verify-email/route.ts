import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { z } from "zod";
import { withErrorHandling, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { relaxedRateLimit } from "@/lib/middleware/rate-limit";

// Request validation schema
const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

/**
 * POST /api/auth/verify-email
 * Verify user email address using token from email
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  // Apply relaxed rate limiting (public endpoint)
  const rateLimited = await relaxedRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const validationResult = verifyEmailSchema.safeParse(body);

  if (!validationResult.success) {
    throw new ValidationError(
      `Invalid request: ${validationResult.error.errors.map(e => e.message).join(", ")}`
    );
  }

  const { token } = validationResult.data;

  logger.debug('[Verify Email] Token received', { token: token.substring(0, 8) + '...' });

  // Hash the token to compare with stored hash
  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  // Find the verification token
  const verificationToken = await prisma.verificationToken.findFirst({
    where: {
      token: hashedToken,
      expires: {
        gt: new Date(), // Token must not be expired
      },
    },
  });

  if (!verificationToken) {
    logger.warn('[Verify Email] Invalid or expired token', { hashedToken: hashedToken.substring(0, 8) + '...' });
    throw new ValidationError("Invalid or expired verification token");
  }

  // Find the user by email (identifier)
  const user = await prisma.user.findUnique({
    where: { email: verificationToken.identifier },
  });

  if (!user) {
    logger.error('[Verify Email] User not found for token', { email: verificationToken.identifier });
    throw new NotFoundError("User");
  }

  // Update user's emailVerified field
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  });

  // Delete the used token
  await prisma.verificationToken.delete({
    where: {
      identifier_token: {
        identifier: verificationToken.identifier,
        token: hashedToken,
      },
    },
  });

  logger.info('[Verify Email] Email verified successfully', {
    userId: user.id,
    email: user.email,
  });

  return success({
    message: "Email verified successfully",
  });
});
