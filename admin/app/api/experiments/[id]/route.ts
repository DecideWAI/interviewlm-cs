import { NextRequest, NextResponse } from 'next/server';
import { getExperiment, updateExperiment, deleteExperiment } from '@/lib/db';
import type { UpdateExperimentInput } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const experiment = await getExperiment(id);

    if (!experiment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Experiment not found',
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    console.error('Failed to fetch experiment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch experiment',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body: UpdateExperimentInput = await request.json();

    // Validate weights if variants are being updated
    if (body.variants) {
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
    }

    // TODO: Get user ID from session
    const userId = 'admin';

    const experiment = await updateExperiment(id, body, userId);

    if (!experiment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Experiment not found',
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    console.error('Failed to update experiment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update experiment',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // TODO: Get user ID from session
    const userId = 'admin';

    const deleted = await deleteExperiment(id, userId);

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Experiment not found',
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Failed to delete experiment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete experiment',
      },
      { status: 500 },
    );
  }
}
