/**
 * Individual Seed API
 * GET /api/seeds/[id] - Get seed details
 * PUT /api/seeds/[id] - Update seed
 * DELETE /api/seeds/[id] - Delete/archive seed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth.config';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// Validation schema for seed updates
const updateSeedSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  category: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  starterCode: z.string().optional(),
  testCode: z.string().optional(),
  language: z.string().optional(),
  instructions: z.string().optional(),
  estimatedTime: z.number().int().min(1).optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
});

/**
 * GET /api/seeds/[id]
 * Get a single seed by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user?.activeOrganizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    const seed = await prisma.problemSeed.findUnique({
      where: { id: params.id },
      include: {
        parentSeed: {
          select: {
            id: true,
            title: true,
            isSystemSeed: true,
          },
        },
        clonedSeeds: {
          select: {
            id: true,
            title: true,
            createdAt: true,
          },
        },
      },
    });

    if (!seed) {
      return NextResponse.json({ error: 'Seed not found' }, { status: 404 });
    }

    // Check access: must be org's seed or system seed
    if (
      !seed.isSystemSeed &&
      seed.organizationId !== user.activeOrganizationId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ seed });
  } catch (error) {
    console.error('[Seeds GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch seed' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/seeds/[id]
 * Update a seed
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user?.activeOrganizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    // Check if seed exists and belongs to org
    const existingSeed = await prisma.problemSeed.findUnique({
      where: { id: params.id },
    });

    if (!existingSeed) {
      return NextResponse.json({ error: 'Seed not found' }, { status: 404 });
    }

    // Cannot edit system seeds
    if (existingSeed.isSystemSeed) {
      return NextResponse.json(
        { error: 'Cannot edit system seeds. Clone it first.' },
        { status: 403 }
      );
    }

    // Must belong to user's organization
    if (existingSeed.organizationId !== user.activeOrganizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = updateSeedSchema.parse(body);

    // Update the seed
    const updatedSeed = await prisma.problemSeed.update({
      where: { id: params.id },
      data: validatedData,
    });

    return NextResponse.json({
      seed: updatedSeed,
      message: 'Seed updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[Seeds PUT] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update seed' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/seeds/[id]
 * Archive a seed (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user?.activeOrganizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    // Check if seed exists and belongs to org
    const existingSeed = await prisma.problemSeed.findUnique({
      where: { id: params.id },
      include: {
        questions: true, // Check if used in assessments
      },
    });

    if (!existingSeed) {
      return NextResponse.json({ error: 'Seed not found' }, { status: 404 });
    }

    // Cannot delete system seeds
    if (existingSeed.isSystemSeed) {
      return NextResponse.json(
        { error: 'Cannot delete system seeds' },
        { status: 403 }
      );
    }

    // Must belong to user's organization
    if (existingSeed.organizationId !== user.activeOrganizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If used in assessments, archive instead of delete
    if (existingSeed.questions && existingSeed.questions.length > 0) {
      const archivedSeed = await prisma.problemSeed.update({
        where: { id: params.id },
        data: { status: 'archived' },
      });

      return NextResponse.json({
        seed: archivedSeed,
        message:
          'Seed archived (it is used in existing assessments and cannot be deleted)',
      });
    }

    // Safe to delete
    await prisma.problemSeed.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      message: 'Seed deleted successfully',
    });
  } catch (error) {
    console.error('[Seeds DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete seed' },
      { status: 500 }
    );
  }
}
