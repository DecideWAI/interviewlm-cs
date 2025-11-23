import { NextRequest, NextResponse } from 'next/server';
import { getExperiments, createExperiment } from '@/lib/db';
import type { CreateExperimentInput } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';

    const experiments = await getExperiments(filter);

    return NextResponse.json({
      success: true,
      data: experiments,
    });
  } catch (error) {
    console.error('Failed to fetch experiments:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch experiments',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateExperimentInput = await request.json();

    // Validate input
    if (!body.name || !body.variants || body.variants.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid experiment configuration',
        },
        { status: 400 },
      );
    }

    // Validate weights sum to 100
    const totalWeight = body.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      return NextResponse.json(
        {
          success: false,
          error: 'Variant weights must sum to 100%',
        },
        { status: 400 },
      );
    }

    // TODO: Get user ID from session
    const userId = 'admin';

    const experiment = await createExperiment(body, userId);

    return NextResponse.json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    console.error('Failed to create experiment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create experiment',
      },
      { status: 500 },
    );
  }
}
