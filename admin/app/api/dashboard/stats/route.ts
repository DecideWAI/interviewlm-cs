import { NextResponse } from 'next/server';
import { getDashboardStats, getDashboardExperiments } from '@/lib/db';

export async function GET() {
  try {
    const [stats, experiments] = await Promise.all([
      getDashboardStats(),
      getDashboardExperiments(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        experiments,
      },
    });
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch dashboard statistics',
      },
      { status: 500 },
    );
  }
}
