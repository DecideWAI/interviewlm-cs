import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const resourceType = searchParams.get('resourceType');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const { entries, total } = await getAuditLogs({
      userId: userId || undefined,
      resourceType: resourceType || undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    return NextResponse.json({
      success: true,
      data: entries,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch audit logs',
      },
      { status: 500 },
    );
  }
}
