/**
 * Clone Seed API
 * POST /api/seeds/[id]/clone - Clone a seed to the organization's library
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const cloneOptionsSchema = z.object({
  title: z.string().optional(),
  status: z.enum(['active', 'draft']).default('draft'),
});

/**
 * POST /api/seeds/[id]/clone
 * Clone a seed (especially useful for system seeds)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: {
        organizationMember: {
          take: 1,
          orderBy: { invitedAt: 'desc' },
        },
      },
    });

    const organizationId = user?.organizationMember?.[0]?.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    const { id } = await params;

    // Fetch the source seed
    const sourceSeed = await prisma.problemSeed.findUnique({
      where: { id },
    });

    if (!sourceSeed) {
      return NextResponse.json(
        { error: 'Source seed not found' },
        { status: 404 }
      );
    }

    // Parse options
    const body = await request.json().catch(() => ({}));
    const options = cloneOptionsSchema.parse(body);

    // Create the cloned seed
    const clonedSeed = await prisma.problemSeed.create({
      data: {
        organizationId,
        title: options.title || `${sourceSeed.title} (Copy)`,
        description: sourceSeed.description,
        difficulty: sourceSeed.difficulty,
        category: sourceSeed.category,
        tags: sourceSeed.tags,
        topics: sourceSeed.topics,
        starterCode: sourceSeed.starterCode,
        testCode: sourceSeed.testCode,
        language: sourceSeed.language,
        instructions: sourceSeed.instructions,
        estimatedTime: sourceSeed.estimatedTime,
        status: options.status,
        createdBy: user!.id,
        parentSeedId: sourceSeed.id, // Link to parent
        isSystemSeed: false, // Clones are never system seeds
      },
    });

    return NextResponse.json(
      {
        seed: clonedSeed,
        message: 'Seed cloned successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[Seeds Clone] Error:', error);
    return NextResponse.json(
      { error: 'Failed to clone seed' },
      { status: 500 }
    );
  }
}
