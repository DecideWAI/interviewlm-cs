/**
 * Batch Events API
 *
 * Accepts multiple events in a single request to reduce overhead
 * and improve performance. This endpoint is used by the EventBatcher
 * to send events in batches rather than individually.
 *
 * Cost Impact: Reduces API calls by ~90%
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';

interface BatchEvent {
  type: string;
  data: any;
  timestamp: string | Date;
  fileId?: string;
  checkpoint?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: candidateId } = await params;

    // Get session and validate authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { events } = body as { events: BatchEvent[] };

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Events array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Validate events
    for (const event of events) {
      if (!event.type || typeof event.type !== 'string') {
        return NextResponse.json(
          { error: 'Each event must have a valid type' },
          { status: 400 }
        );
      }
    }

    // Get or create session recording
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { sessionRecording: true },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    let sessionRecording = candidate.sessionRecording;

    if (!sessionRecording) {
      // Create session recording if it doesn't exist
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId,
          startTime: new Date(),
          status: 'ACTIVE',
        },
      });
    }

    // Batch insert all events
    const eventRecords = events.map((event) => ({
      sessionId: sessionRecording.id,
      type: event.type,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      data: event.data || {},
      fileId: event.fileId,
      checkpoint: event.checkpoint || false,
    }));

    await prisma.sessionEvent.createMany({
      data: eventRecords,
    });

    // Update session recording event count
    await prisma.sessionRecording.update({
      where: { id: sessionRecording.id },
      data: {
        eventCount: {
          increment: events.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      eventsRecorded: events.length,
      sessionId: sessionRecording.id,
    });
  } catch (error) {
    console.error('Error recording batch events:', error);
    return NextResponse.json(
      {
        error: 'Failed to record events',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve batch statistics (optional, for debugging)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: candidateId } = await params;

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        sessionRecording: {
          select: {
            id: true,
            eventCount: true,
            startTime: true,
            endTime: true,
            status: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    return NextResponse.json({
      sessionRecording: candidate.sessionRecording,
    });
  } catch (error) {
    console.error('Error retrieving session stats:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve stats' },
      { status: 500 }
    );
  }
}
