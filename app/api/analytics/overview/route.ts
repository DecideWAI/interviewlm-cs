/**
 * Analytics Overview API
 * GET /api/analytics/overview - Get comprehensive analytics dashboard data
 */

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { getAnalyticsOverview } from '@/lib/services/analytics';
import prisma from '@/lib/prisma';
import { withErrorHandling, AuthorizationError, NotFoundError } from '@/lib/utils/errors';
import { success } from '@/lib/utils/api-response';
import { logger } from '@/lib/utils/logger';
import { standardRateLimit } from '@/lib/middleware/rate-limit';

/**
 * GET /api/analytics/overview
 * Returns KPIs, trend data, and performance metrics for the organization
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Apply rate limiting
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user?.id) {
    throw new AuthorizationError('Authentication required');
  }

  // Get user's organization
  const userOrg = await prisma.organizationMember.findFirst({
    where: { userId: session.user.id },
  });

  if (!userOrg) {
    throw new NotFoundError('Organization membership');
  }

  const { searchParams } = new URL(request.url);
  const dateRange = searchParams.get('dateRange') || 'last_30_days';

  // Fetch analytics with performance logging
  const analytics = await logger.time(
    'getAnalyticsOverview',
    () => getAnalyticsOverview(userOrg.organizationId, dateRange),
    { organizationId: userOrg.organizationId, dateRange }
  );

  logger.info('Analytics overview fetched', {
    userId: session.user.id,
    organizationId: userOrg.organizationId,
    dateRange,
  });

  return success(analytics);
});
