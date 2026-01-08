import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { eventStore, type SessionEvent, type EventCategory } from "@/lib/services/event-store";
import { getEvidenceMarkers } from "@/lib/services/evidence-linking";

/**
 * GET /api/sessions/[id]
 * Fetch complete session recording data for replay viewer
 *
 * Returns:
 * - Session metadata (candidate, assessment, timing)
 * - All events from unified event store (chronologically sorted)
 * - Session metrics calculated from events
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Fetch session recording with related data (excluding deprecated event tables)
    // id can be either sessionRecordingId or candidateId (try both)
    let sessionRecording = await prisma.sessionRecording.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            assessment: {
              select: {
                title: true,
                role: true,
                seniority: true,
                duration: true,
              },
            },
            generatedQuestions: {
              select: {
                title: true,
                description: true,
                difficulty: true,
                language: true,
                requirements: true,
                starterCode: true,
                testCases: true,
                score: true,
                order: true,
              },
              orderBy: {
                order: "asc",
              },
            },
            evaluation: {
              select: {
                id: true,
                overallScore: true,
                confidence: true,
                codeQualityScore: true,
                codeQualityEvidence: true,
                codeQualityConfidence: true,
                problemSolvingScore: true,
                problemSolvingEvidence: true,
                problemSolvingConfidence: true,
                aiCollaborationScore: true,
                aiCollaborationEvidence: true,
                aiCollaborationConfidence: true,
                communicationScore: true,
                communicationEvidence: true,
                communicationConfidence: true,
                hiringRecommendation: true,
                hiringConfidence: true,
                hiringReasoning: true,
                expertiseLevel: true,
                expertiseGrowth: true,
                expertiseGrowthTrend: true,
                // Sentry-like session summary
                sessionSummary: true,
                sessionSummaryAt: true,
              },
            },
          },
        },
        // NOTE: Old event tables removed - now using unified event store
      },
    });

    // If not found by session ID, try candidateId
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.findUnique({
        where: { candidateId: id },
        include: {
          candidate: {
            include: {
              assessment: {
                select: {
                  title: true,
                  role: true,
                  seniority: true,
                  duration: true,
                },
              },
              generatedQuestions: {
                select: {
                  title: true,
                  description: true,
                  difficulty: true,
                  language: true,
                  requirements: true,
                  starterCode: true,
                  testCases: true,
                  score: true,
                  order: true,
                },
                orderBy: {
                  order: "asc",
                },
              },
              evaluation: {
                select: {
                  id: true,
                  overallScore: true,
                  confidence: true,
                  codeQualityScore: true,
                  codeQualityEvidence: true,
                  codeQualityConfidence: true,
                  problemSolvingScore: true,
                  problemSolvingEvidence: true,
                  problemSolvingConfidence: true,
                  aiCollaborationScore: true,
                  aiCollaborationEvidence: true,
                  aiCollaborationConfidence: true,
                  communicationScore: true,
                  communicationEvidence: true,
                  communicationConfidence: true,
                  hiringRecommendation: true,
                  hiringConfidence: true,
                  hiringReasoning: true,
                  expertiseLevel: true,
                  expertiseGrowth: true,
                  expertiseGrowthTrend: true,
                  // Sentry-like session summary
                  sessionSummary: true,
                  sessionSummaryAt: true,
                },
              },
            },
          },
          // NOTE: Old event tables removed - now using unified event store
        },
      });
    }

    if (!sessionRecording) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this session
    // Check if user owns the candidate or is part of the organization
    const hasAccess = await prisma.candidate.findFirst({
      where: {
        id: sessionRecording.candidateId,
        OR: [
          { createdById: session.user.id },
          {
            organization: {
              members: {
                some: {
                  userId: session.user.id,
                },
              },
            },
          },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Fetch events from unified event store
    const events = await eventStore.getEvents(sessionRecording.id);

    // Build timeline from unified events
    const timeline = buildTimeline(events);

    // Calculate session metrics from events
    const metrics = calculateSessionMetrics(events, sessionRecording);

    // Fetch evidence markers for Sentry-like replay (click to jump)
    // Non-critical feature - return empty array on failure
    let evidenceMarkers: Awaited<ReturnType<typeof getEvidenceMarkers>> = [];
    try {
      evidenceMarkers = await getEvidenceMarkers(sessionRecording.id);
    } catch (evidenceError) {
      console.warn("Failed to fetch evidence markers:", evidenceError);
      // Continue without evidence markers - non-critical feature
    }

    // Return comprehensive session data
    return NextResponse.json({
      session: {
        id: sessionRecording.id,
        candidateId: sessionRecording.candidateId,
        startTime: sessionRecording.startTime,
        endTime: sessionRecording.endTime,
        duration: sessionRecording.duration,
        status: sessionRecording.status,
        eventCount: sessionRecording.eventCount,
        trackedFiles: sessionRecording.trackedFiles, // Array of file paths created during session
      },
      candidate: {
        id: sessionRecording.candidate.id,
        name: sessionRecording.candidate.name,
        email: sessionRecording.candidate.email,
        status: sessionRecording.candidate.status,
        overallScore: sessionRecording.candidate.overallScore,
        codingScore: sessionRecording.candidate.codingScore,
        communicationScore: sessionRecording.candidate.communicationScore,
        problemSolvingScore: sessionRecording.candidate.problemSolvingScore,
      },
      assessment: sessionRecording.candidate.assessment,
      questions: sessionRecording.candidate.generatedQuestions,
      evaluation: sessionRecording.candidate.evaluation,
      timeline,
      metrics,
      // Sentry-like replay features
      evidenceMarkers, // For timeline markers and click-to-jump
      sessionSummary: sessionRecording.candidate.evaluation?.sessionSummary || null,
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Build unified timeline from event store events
 * Maps event types to legacy format for backwards compatibility with replay viewer
 */
function buildTimeline(events: SessionEvent[]) {
  return events.map((event) => {
    // Map new event types to legacy format for backwards compatibility
    const legacyType = mapEventTypeToLegacy(event.eventType);

    // Transform data for code_snapshot events
    // The replay page expects 'fullContent' but DB stores 'content'
    let data = event.data;
    if (event.eventType === "code.snapshot" || (event.eventType as string) === "code_snapshot") {
      const eventData = event.data as Record<string, unknown>;
      if (eventData.content && !eventData.fullContent) {
        data = {
          ...eventData,
          fullContent: eventData.content, // Add fullContent for replay page
        };
      }
    }

    return {
      id: event.id,
      timestamp: event.timestamp,
      type: legacyType,
      category: event.category,
      data,
      checkpoint: event.checkpoint,
      questionIndex: event.questionIndex,
      sequenceNumber: event.sequenceNumber.toString(),
    };
  });
}

/**
 * Map new event types (dot notation) to legacy format for backwards compatibility
 */
function mapEventTypeToLegacy(eventType: string): string {
  const typeMap: Record<string, string> = {
    // Session events
    "session.start": "session_start",
    "session.end": "session_end",
    "session.pause": "session_pause",
    "session.resume": "session_resume",

    // Question events
    "question.start": "conversation_reset", // Legacy name used for question boundaries
    "question.submit": "question_submit",
    "question.evaluated": "evaluation_complete",
    "question.skip": "question_skip",

    // File events
    "file.create": "file_create",
    "file.update": "file_update",
    "file.rename": "file_rename",
    "file.delete": "file_delete",

    // Code events
    "code.snapshot": "code_snapshot",
    "code.edit": "code_edit",

    // Chat events
    "chat.user_message": "ai_message",
    "chat.assistant_message": "ai_message",
    "chat.assistant_chunk": "ai_message",
    "chat.tool_start": "tool_start",
    "chat.tool_result": "tool_result",
    "chat.reset": "conversation_reset",

    // Terminal events
    "terminal.command": "terminal_input",
    "terminal.output": "terminal_output",
    "terminal.clear": "terminal_clear",

    // Test events
    "test.run_start": "test_start",
    "test.result": "test_result",
    "test.run_complete": "test_result",

    // Evaluation events
    "evaluation.start": "evaluation_start",
    "evaluation.complete": "evaluation_complete",
    "evaluation.final": "evaluation_final",
  };

  return typeMap[eventType] || eventType;
}

/**
 * Calculate session metrics from event store events
 */
function calculateSessionMetrics(events: SessionEvent[], sessionRecording: any) {
  // Filter events by category
  const chatEvents = events.filter((e) => e.category === "chat");
  const codeEvents = events.filter((e) => e.category === "code");
  const testEvents = events.filter((e) => e.category === "test");

  // Code snapshots
  const codeSnapshots = codeEvents.filter((e) => e.eventType === "code.snapshot");

  // Test results
  const testResults = testEvents.filter(
    (e) => e.eventType === "test.result" || e.eventType === "test.run_complete"
  );

  const metrics = {
    totalEvents: events.length,
    claudeInteractions: chatEvents.length,
    codeSnapshots: codeSnapshots.length,
    testRuns: testResults.length,
    totalTokens: 0,
    avgPromptQuality: 0,
    testPassRate: 0,
    codeActivityRate: 0,
  };

  // Calculate token usage from chat events
  metrics.totalTokens = chatEvents.reduce(
    (sum, event) => {
      const data = event.data as any;
      return sum + (data?.inputTokens || 0) + (data?.outputTokens || 0);
    },
    0
  );

  // Calculate average prompt quality
  const qualityScores = chatEvents
    .filter((e) => (e.data as any)?.promptQuality !== null && (e.data as any)?.promptQuality !== undefined)
    .map((e) => (e.data as any).promptQuality as number);

  if (qualityScores.length > 0) {
    metrics.avgPromptQuality =
      qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
  }

  // Calculate test pass rate
  if (testResults.length > 0) {
    const passedTests = testResults.filter((t) => (t.data as any)?.passed).length;
    metrics.testPassRate = passedTests / testResults.length;
  }

  // Calculate code activity rate (snapshots per minute)
  if (sessionRecording.duration && sessionRecording.duration > 0) {
    metrics.codeActivityRate = (codeSnapshots.length / sessionRecording.duration) * 60;
  }

  return metrics;
}
