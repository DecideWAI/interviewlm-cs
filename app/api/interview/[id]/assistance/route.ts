/**
 * Proactive Assistance API
 * GET /api/interview/[id]/assistance - SSE endpoint for proactive assistance messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { proactiveAssistance } from '@/lib/services/proactive-assistance';

/**
 * GET /api/interview/[id]/assistance
 * Server-Sent Events endpoint for proactive assistance offers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: { where: { userId: session.user.id } },
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

    let sessionRecording = candidate.sessionRecording;
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId: id,
          status: 'ACTIVE',
        },
      });
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Initialize session
        proactiveAssistance.initializeSession(sessionRecording!.id);

        // Listen for stuck detection
        const stuckHandler = ({ sessionId, result }: any) => {
          if (sessionId === sessionRecording!.id) {
            const data = JSON.stringify({
              isStuck: result.isStuck,
              level: result.suggestedLevel,
              message: result.message,
              indicators: result.indicators.map((i: any) => ({
                type: i.type,
                severity: i.severity,
                evidence: i.evidence,
              })),
              confidence: result.confidence,
            });
            controller.enqueue(encoder.encode(`event: assistance\ndata: ${data}\n\n`));
          }
        };

        proactiveAssistance.on('stuck_detected', stuckHandler);

        // Keep-alive ping
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } catch (error) {
            clearInterval(keepAliveInterval);
          }
        }, 30000);

        // Cleanup
        request.signal.addEventListener('abort', () => {
          proactiveAssistance.off('stuck_detected', stuckHandler);
          clearInterval(keepAliveInterval);
          try {
            controller.close();
          } catch (error) {
            // Stream already closed
          }
        });

        // Send initial connection event
        controller.enqueue(
          encoder.encode(`event: connected\ndata: ${JSON.stringify({ sessionId: sessionRecording!.id })}\n\n`)
        );
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[Assistance] Error:', error);
    return NextResponse.json(
      { error: 'Failed to establish assistance stream' },
      { status: 500 }
    );
  }
}
