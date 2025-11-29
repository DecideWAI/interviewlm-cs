import { NextRequest, NextResponse } from 'next/server';
import { getBlockedIps, blockIp, unblockIp } from '@/lib/db';
import type { BlockIpInput } from '@/lib/types';

export async function GET() {
  try {
    const blockedIps = await getBlockedIps();

    return NextResponse.json({
      success: true,
      data: blockedIps,
    });
  } catch (error) {
    console.error('Failed to fetch blocked IPs:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch blocked IPs',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: BlockIpInput = await request.json();

    if (!body.ip || !body.reason) {
      return NextResponse.json(
        {
          success: false,
          error: 'IP address and reason are required',
        },
        { status: 400 },
      );
    }

    // Validate IP format (basic validation)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(body.ip)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid IP address format',
        },
        { status: 400 },
      );
    }

    // TODO: Get user ID from session
    const userId = 'admin';

    await blockIp(body.ip, body.reason, userId);

    return NextResponse.json({
      success: true,
      data: { blocked: true },
    });
  } catch (error) {
    console.error('Failed to block IP:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to block IP',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ip = searchParams.get('ip');

    if (!ip) {
      return NextResponse.json(
        {
          success: false,
          error: 'IP address is required',
        },
        { status: 400 },
      );
    }

    // TODO: Get user ID from session
    const userId = 'admin';

    const success = await unblockIp(ip, userId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: 'IP not found in blocked list',
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { unblocked: true },
    });
  } catch (error) {
    console.error('Failed to unblock IP:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to unblock IP',
      },
      { status: 500 },
    );
  }
}
