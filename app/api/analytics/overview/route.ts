/**
 * Analytics Overview API
 * GET /api/analytics/overview - Get comprehensive analytics dashboard data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { getAnalyticsOverview } from '@/lib/services/analytics';
import prisma from '@/lib/prisma';

/**
 * GET /api/analytics/overview
 * Returns KPIs, trend data, and performance metrics for the organization
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const userOrg = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: 'User not associated with any organization' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get('dateRange') || 'last_30_days';

    const analytics = await getAnalyticsOverview(
      userOrg.organizationId,
      dateRange
    );

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('[Analytics Overview] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
