/**
 * Seed Management API
 * POST /api/seeds - Create new seed
 * GET /api/seeds - List seeds for organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Validation schema for seed creation
const createSeedSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  category: z.string().min(1, 'Category is required'),
  tags: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  starterCode: z.string().optional(),
  testCode: z.string().optional(),
  language: z.string().default('javascript'),
  instructions: z.string().optional(),
  estimatedTime: z.number().int().min(1).default(30),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  parentSeedId: z.string().optional(), // For cloning
});

/**
 * GET /api/seeds
 * List seeds for the current organization
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active organization from cookie
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get('active_organization_id')?.value;

    if (!activeOrgId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    // Verify user has access to this organization
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: activeOrgId,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Access to organization denied' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const includeSystem = searchParams.get('includeSystem') === 'true';

    // Build filter conditions
    const where: any = {
      OR: [
        { organizationId: activeOrgId },
        ...(includeSystem ? [{ isSystemSeed: true }] : []),
      ],
    };

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    // Fetch seeds
    const seeds = await prisma.problemSeed.findMany({
      where,
      orderBy: [
        { isSystemSeed: 'desc' }, // System seeds first
        { usageCount: 'desc' }, // Most used
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        title: true,
        description: true,
        difficulty: true,
        category: true,
        tags: true,
        topics: true,
        language: true,
        status: true,
        estimatedTime: true,
        usageCount: true,
        avgCandidateScore: true,
        isSystemSeed: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        parentSeedId: true,
      },
    });

    return NextResponse.json({ seeds });
  } catch (error) {
    console.error('[Seeds GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch seeds' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/seeds
 * Create a new seed or clone an existing one
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active organization from cookie
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get('active_organization_id')?.value;

    if (!activeOrgId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    // Verify user has access to this organization
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: activeOrgId,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Access to organization denied' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validatedData = createSeedSchema.parse(body);

    // If cloning, fetch parent seed data
    let seedData = validatedData;

    if (validatedData.parentSeedId) {
      const parentSeed = await prisma.problemSeed.findUnique({
        where: { id: validatedData.parentSeedId },
      });

      if (!parentSeed) {
        return NextResponse.json(
          { error: 'Parent seed not found' },
          { status: 404 }
        );
      }

      // Merge parent data with overrides
      seedData = {
        ...validatedData,
        title: validatedData.title || `${parentSeed.title} (Copy)`,
        description: validatedData.description || parentSeed.description,
        difficulty: validatedData.difficulty || parentSeed.difficulty,
        category: validatedData.category || parentSeed.category,
        tags: validatedData.tags?.length
          ? validatedData.tags
          : (parentSeed.tags as string[]),
        topics: validatedData.topics?.length
          ? validatedData.topics
          : (parentSeed.topics as string[]),
        starterCode: validatedData.starterCode || parentSeed.starterCode || '',
        testCode: validatedData.testCode || parentSeed.testCode || '',
        language: validatedData.language || parentSeed.language,
        instructions: validatedData.instructions || parentSeed.instructions || '',
        estimatedTime: validatedData.estimatedTime || parentSeed.estimatedTime,
        status: 'draft', // Clones start as draft
      };
    }

    // Create the seed
    const newSeed = await prisma.problemSeed.create({
      data: {
        organizationId: activeOrgId,
        title: seedData.title,
        description: seedData.description,
        difficulty: seedData.difficulty,
        category: seedData.category,
        tags: seedData.tags || [],
        topics: seedData.topics || [],
        starterCode: seedData.starterCode,
        testCode: seedData.testCode,
        language: seedData.language,
        instructions: seedData.instructions,
        estimatedTime: seedData.estimatedTime,
        status: seedData.status,
        createdBy: session.user.id,
        parentSeedId: validatedData.parentSeedId,
        isSystemSeed: false, // User-created seeds are never system seeds
      },
    });

    return NextResponse.json(
      { seed: newSeed, message: 'Seed created successfully' },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[Seeds POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create seed' },
      { status: 500 }
    );
  }
}
