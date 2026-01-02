/**
 * Code Streaming API
 * GET /api/interview/[id]/code-stream - SSE endpoint for real-time code updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { createCodeStreamResponse } from '@/lib/services/code-streaming';

/**
 * GET /api/interview/[id]/code-stream
 * Server-Sent Events endpoint for real-time code streaming
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify candidate exists and belongs to authorized organization
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        sessionRecording: true,
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404 }
      );
    }

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get or create session recording
    let sessionRecording = candidate.sessionRecording;
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId: id,
          status: 'ACTIVE',
        },
      });
    }

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        // Set up code streaming with automatic cleanup
        const { clientId, cleanup } = createCodeStreamResponse(
          sessionRecording!.id,
          controller
        );

        console.log(`[CodeStream] Client ${clientId} connected to session ${sessionRecording!.id}`);

        // Keep-alive ping every 15 seconds
        const keepAliveInterval = setInterval(() => {
          try {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(': ping\n\n'));
          } catch (error) {
            console.error('[CodeStream] Keep-alive error:', error);
            clearInterval(keepAliveInterval);
          }
        }, 15000);

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          console.log(`[CodeStream] Client ${clientId} disconnected`);
          clearInterval(keepAliveInterval);
          cleanup();
          try {
            controller.close();
          } catch (error) {
            // Stream already closed
          }
        });
      },
    });

    // Return SSE response
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error('[CodeStream] Error:', error);
    return NextResponse.json(
      { error: 'Failed to establish code stream' },
      { status: 500 }
    );
  }
}
