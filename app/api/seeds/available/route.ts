/**
 * API Route: Get Available Seeds
 *
 * GET /api/seeds/available
 *
 * Returns available problem seeds based on filtering criteria.
 * Used by the assessment creation wizard to show seed options.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { seedSelector } from '@/lib/services/seed-selector';
import prisma from '@/lib/prisma';
import { AssessmentType } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const orgMember = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
      include: { organization: true },
    });

    if (!orgMember) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') || undefined;
    const seniority = searchParams.get('seniority') || undefined;
    const assessmentType = searchParams.get('assessmentType') as AssessmentType | undefined;
    const defaultsOnly = searchParams.get('defaultsOnly') === 'true';

    // Get available seeds based on criteria
    const seeds = await prisma.problemSeed.findMany({
      where: {
        targetRole: role || undefined,
        targetSeniority: seniority || undefined,
        assessmentType: assessmentType || undefined,
        status: 'active',
        ...(defaultsOnly
          ? { isDefaultSeed: true, isSystemSeed: true }
          : {
              OR: [
                { isSystemSeed: true },
                { organizationId: orgMember.organizationId },
              ],
            }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        difficulty: true,
        category: true,
        tags: true,
        topics: true,
        language: true,
        estimatedTime: true,
        seedType: true,
        targetRole: true,
        targetSeniority: true,
        assessmentType: true,
        isDefaultSeed: true,
        isSystemSeed: true,
        usageCount: true,
        avgCandidateScore: true,
        designDocTemplate: true,
        architectureHints: true,
        implementationScope: true,
        evaluationRubric: true,
      },
      orderBy: [
        { isDefaultSeed: 'desc' },
        { isSystemSeed: 'desc' },
        { usageCount: 'desc' },
      ],
    });

    // Group seeds by assessment type for easier UI consumption
    const groupedSeeds = {
      realWorld: seeds.filter((s) => s.assessmentType === 'REAL_WORLD'),
      systemDesign: seeds.filter((s) => s.assessmentType === 'SYSTEM_DESIGN'),
    };

    // Get the recommended default seed if criteria are provided
    let recommendedSeed = null;
    if (role && seniority && assessmentType) {
      recommendedSeed = await seedSelector.getDefaultSeed(role, seniority, assessmentType);
    }

    return NextResponse.json({
      seeds,
      groupedSeeds,
      recommendedSeed: recommendedSeed
        ? {
            id: recommendedSeed.id,
            title: recommendedSeed.title,
            description: recommendedSeed.description,
            assessmentType: recommendedSeed.assessmentType,
          }
        : null,
      meta: {
        total: seeds.length,
        realWorldCount: groupedSeeds.realWorld.length,
        systemDesignCount: groupedSeeds.systemDesign.length,
        hasDefaultForCriteria: !!recommendedSeed,
      },
    });
  } catch (error) {
    console.error('Error fetching available seeds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch seeds' },
      { status: 500 }
    );
  }
}
