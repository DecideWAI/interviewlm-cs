import { NextRequest } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { withErrorHandling, AuthorizationError, NotFoundError } from "@/lib/utils/errors";
import { success, parsePagination } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";
import { withQueryLogging } from "@/lib/utils/db-helpers";

export const GET = withErrorHandling(async (req: NextRequest) => {
  // Apply rate limiting
  const rateLimited = await standardRateLimit(req);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await auth();
  if (!session?.user?.email) {
    throw new AuthorizationError();
  }

  // Parse pagination parameters
  const { searchParams } = req.nextUrl;
  const { page, pageSize, skip } = parsePagination(searchParams, {
    pageSize: 50,
  });

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

  if (!user || !user.organizationMember[0]) {
    throw new NotFoundError("Organization membership");
  }

  const organization = user.organizationMember[0].organization;

  // Fetch credit transactions with query logging
  const [transactions, totalCount] = await withQueryLogging(
    'fetchTransactions',
    () => Promise.all([
      prisma.creditTransaction.findMany({
        where: {
          organizationId: organization.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: pageSize,
        skip,
      }),
      prisma.creditTransaction.count({
        where: {
          organizationId: organization.id,
        },
      }),
    ])
  );

  logger.info('Transactions fetched', {
    userId: session.user.id,
    organizationId: organization.id,
    count: transactions.length,
    page,
  });

  return success({
    transactions,
    pagination: {
      total: totalCount,
      page,
      pageSize,
      hasMore: skip + pageSize < totalCount,
    },
    currentBalance: organization.credits,
  });
});
