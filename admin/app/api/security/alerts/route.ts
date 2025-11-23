import { NextRequest, NextResponse } from 'next/server';
import { getSecurityAlerts, acknowledgeAlert } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const acknowledged = searchParams.get('acknowledged');
    const severity = searchParams.get('severity');
    const limit = searchParams.get('limit');

    const alerts = await getSecurityAlerts({
      acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
      severity: severity || undefined,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return NextResponse.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error('Failed to fetch security alerts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch security alerts',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertId, action } = body;

    if (action === 'acknowledge' && alertId) {
      // TODO: Get user ID from session
      const userId = 'admin';

      const success = await acknowledgeAlert(alertId, userId);

      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: 'Alert not found',
          },
          { status: 404 },
        );
      }

      return NextResponse.json({
        success: true,
        data: { acknowledged: true },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action',
      },
      { status: 400 },
    );
  } catch (error) {
    console.error('Failed to process alert action:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process alert action',
      },
      { status: 500 },
    );
  }
}
