import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { uploadFileContent } from "@/lib/services/gcs";

// Request validation schema
const eventRequestSchema = z.object({
  type: z.enum([
    "keystroke",
    "code_snapshot",
    "file_created",
    "file_deleted",
    "file_renamed",
    "terminal_output",
    "terminal_input",
    "test_run",
    "ai_interaction",
    "focus_change",
    "idle_start",
    "idle_end",
    "paste",
    "copy",
  ]),
  data: z.record(z.any()),
  timestamp: z.string().optional(),
  fileId: z.string().optional(),
  checkpoint: z.boolean().optional(),
});

// Batch event request schema
const batchEventRequestSchema = z.object({
  events: z.array(eventRequestSchema),
});

/**
 * POST /api/interview/[id]/events
 * Record session events for replay and analysis
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();

    // Check if it's a batch request or single event
    const isBatch = Array.isArray(body.events);

    let events: z.infer<typeof eventRequestSchema>[];

    if (isBatch) {
      const validationResult = batchEventRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          {
            error: "Invalid request",
            details: validationResult.error.errors,
          },
          { status: 400 }
        );
      }
      events = validationResult.data.events;
    } else {
      const validationResult = eventRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          {
            error: "Invalid request",
            details: validationResult.error.errors,
          },
          { status: 400 }
        );
      }
      events = [validationResult.data];
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
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get or create session recording
    let sessionRecording = candidate.sessionRecording;
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId: id,
          status: "ACTIVE",
        },
      });
    }

    // Start candidate session if not started
    if (!candidate.startedAt) {
      await prisma.candidate.update({
        where: { id },
        data: {
          startedAt: new Date(),
          status: "IN_PROGRESS",
        },
      });
    }

    // Filter and optimize events
    const optimizedEvents = optimizeEvents(events);

    // Process events: upload file content to GCS for code_snapshot events
    const processedEvents = await Promise.all(
      optimizedEvents.map(async (event) => {
        // If this is a code_snapshot with fullContent, upload to GCS
        if (
          event.type === "code_snapshot" &&
          event.data?.fullContent &&
          typeof event.data.fullContent === "string"
        ) {
          try {
            const { checksum } = await uploadFileContent(id, event.data.fullContent);

            // Replace fullContent with contentHash to save database space
            // The fullContent can be retrieved from GCS using the checksum
            return {
              ...event,
              data: {
                ...event.data,
                contentHash: checksum,
                // Keep fullContent in event data for now (backwards compatibility)
                // Uncomment below to remove fullContent after GCS is fully deployed
                // fullContent: undefined,
              },
            };
          } catch (gcsError) {
            // Log error but don't fail the event - fallback to storing in DB
            console.error("[Events] GCS upload failed, storing content in DB:", gcsError);
            return event;
          }
        }
        return event;
      })
    );

    // Get next sequence number for batch insert
    const lastEvent = await prisma.sessionEventLog.findFirst({
      where: { sessionId: sessionRecording.id },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });
    let nextSeq = (lastEvent?.sequenceNumber ?? BigInt(-1)) + BigInt(1);

    // Batch insert events
    const createdEvents = await prisma.sessionEventLog.createMany({
      data: processedEvents.map((event) => {
        const seq = nextSeq++;
        return {
          sessionId: sessionRecording.id,
          sequenceNumber: seq,
          eventType: event.type,
          category: event.type.split('.')[0] || 'session',
          data: event.data,
          timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
          filePath: event.fileId,
          checkpoint: event.checkpoint || false,
        };
      }),
    });

    // Update event count in session recording
    await prisma.sessionRecording.update({
      where: { id: sessionRecording.id },
      data: {
        eventCount: {
          increment: createdEvents.count,
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        recorded: createdEvents.count,
        sessionId: sessionRecording.id,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Events API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/interview/[id]/events
 * Retrieve session events for replay
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const fromTimestamp = searchParams.get("from");
    const toTimestamp = searchParams.get("to");
    const eventType = searchParams.get("type");
    const checkpointsOnly = searchParams.get("checkpoints") === "true";
    const limit = parseInt(searchParams.get("limit") || "1000");
    const offset = parseInt(searchParams.get("offset") || "0");

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
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!candidate.sessionRecording) {
      return NextResponse.json(
        { error: "No session recording found" },
        { status: 404 }
      );
    }

    // Build query filters
    const where: any = {
      sessionId: candidate.sessionRecording.id,
    };

    if (fromTimestamp) {
      where.timestamp = { gte: new Date(fromTimestamp) };
    }

    if (toTimestamp) {
      where.timestamp = {
        ...where.timestamp,
        lte: new Date(toTimestamp),
      };
    }

    if (eventType) {
      where.eventType = eventType;
    }

    if (checkpointsOnly) {
      where.checkpoint = true;
    }

    // Fetch events
    const events = await prisma.sessionEventLog.findMany({
      where,
      orderBy: { sequenceNumber: "asc" },
      skip: offset,
      take: limit,
    });

    // Get total count
    const total = await prisma.sessionEventLog.count({ where });

    return NextResponse.json(
      {
        events,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
        sessionInfo: {
          id: candidate.sessionRecording.id,
          startTime: candidate.sessionRecording.startTime,
          endTime: candidate.sessionRecording.endTime,
          status: candidate.sessionRecording.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Events GET API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Optimize events to reduce storage
 * - Debounce rapid keystrokes
 * - Filter redundant events
 * - Mark important events as checkpoints
 */
function optimizeEvents(
  events: z.infer<typeof eventRequestSchema>[]
): z.infer<typeof eventRequestSchema>[] {
  const optimized: z.infer<typeof eventRequestSchema>[] = [];

  // Group events by type for optimization
  const keystrokeBuffer: z.infer<typeof eventRequestSchema>[] = [];

  for (const event of events) {
    // Buffer keystrokes for debouncing
    if (event.type === "keystroke") {
      keystrokeBuffer.push(event);
      continue;
    }

    // Flush keystroke buffer if we hit a non-keystroke event
    if (keystrokeBuffer.length > 0) {
      // Only keep every 10th keystroke to reduce volume
      optimized.push(...keystrokeBuffer.filter((_, i) => i % 10 === 0));
      keystrokeBuffer.length = 0;
    }

    // Mark important events as checkpoints
    const isImportant = [
      "code_snapshot",
      "test_run",
      "ai_interaction",
      "file_created",
      "file_deleted",
    ].includes(event.type);

    optimized.push({
      ...event,
      checkpoint: event.checkpoint || isImportant,
    });
  }

  // Flush remaining keystrokes
  if (keystrokeBuffer.length > 0) {
    optimized.push(...keystrokeBuffer.filter((_, i) => i % 10 === 0));
  }

  return optimized;
}
