import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";

/**
 * GET /api/sessions/[id]
 * Fetch complete session recording data for replay viewer
 *
 * Returns:
 * - Session metadata (candidate, assessment, timing)
 * - All events chronologically sorted
 * - Code snapshots with file content
 * - Claude interactions (AI chat history)
 * - Test results
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

    // Fetch session recording with all related data
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
          },
        },
        events: {
          orderBy: {
            timestamp: "asc",
          },
        },
        claudeInteractions: {
          orderBy: {
            timestamp: "asc",
          },
        },
        codeSnapshots: {
          orderBy: {
            timestamp: "asc",
          },
        },
        testResults: {
          orderBy: {
            timestamp: "asc",
          },
        },
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
            },
          },
          events: {
            orderBy: {
              timestamp: "asc",
            },
          },
          claudeInteractions: {
            orderBy: {
              timestamp: "asc",
            },
          },
          codeSnapshots: {
            orderBy: {
              timestamp: "asc",
            },
          },
          testResults: {
            orderBy: {
              timestamp: "asc",
            },
          },
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

    // Build comprehensive timeline by merging all event types
    const timeline = buildTimeline({
      events: sessionRecording.events,
      claudeInteractions: sessionRecording.claudeInteractions,
      codeSnapshots: sessionRecording.codeSnapshots,
      testResults: sessionRecording.testResults,
    });

    // Calculate session metrics
    const metrics = calculateSessionMetrics(sessionRecording);

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
      timeline,
      metrics,
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
 * Build unified timeline from all event sources
 * Merges events, Claude interactions, code snapshots, and test results
 */
function buildTimeline(data: {
  events: any[];
  claudeInteractions: any[];
  codeSnapshots: any[];
  testResults: any[];
}) {
  const timeline: any[] = [];

  // Add session events
  data.events.forEach((event) => {
    timeline.push({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      category: "event",
      data: event.data,
      checkpoint: event.checkpoint,
    });
  });

  // Add Claude interactions (AI chat)
  data.claudeInteractions.forEach((interaction) => {
    timeline.push({
      id: interaction.id,
      timestamp: interaction.timestamp,
      type: "ai_message",
      category: "chat",
      data: {
        role: interaction.role,
        content: interaction.content,
        model: interaction.model,
        inputTokens: interaction.inputTokens,
        outputTokens: interaction.outputTokens,
        latency: interaction.latency,
        promptQuality: interaction.promptQuality,
      },
    });
  });

  // Add code snapshots
  data.codeSnapshots.forEach((snapshot) => {
    timeline.push({
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      type: "code_snapshot",
      category: "code",
      data: {
        fileId: snapshot.fileId,
        fileName: snapshot.fileName,
        language: snapshot.language,
        contentHash: snapshot.contentHash,
        fullContent: snapshot.fullContent,
        diffFromPrevious: snapshot.diffFromPrevious,
        linesAdded: snapshot.linesAdded,
        linesDeleted: snapshot.linesDeleted,
      },
    });
  });

  // Add test results
  data.testResults.forEach((result) => {
    timeline.push({
      id: result.id,
      timestamp: result.timestamp,
      type: "test_result",
      category: "test",
      data: {
        testName: result.testName,
        passed: result.passed,
        output: result.output,
        error: result.error,
        duration: result.duration,
      },
    });
  });

  // Sort by timestamp
  timeline.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return timeline;
}

/**
 * Calculate session metrics from recording data
 */
function calculateSessionMetrics(sessionRecording: any) {
  const metrics = {
    totalEvents: sessionRecording.eventCount,
    claudeInteractions: sessionRecording.claudeInteractions.length,
    codeSnapshots: sessionRecording.codeSnapshots.length,
    testRuns: sessionRecording.testResults.length,
    totalTokens: 0,
    avgPromptQuality: 0,
    testPassRate: 0,
    codeActivityRate: 0,
  };

  // Calculate token usage
  metrics.totalTokens = sessionRecording.claudeInteractions.reduce(
    (sum: number, interaction: any) =>
      sum + (interaction.inputTokens || 0) + (interaction.outputTokens || 0),
    0
  );

  // Calculate average prompt quality
  const qualityScores = sessionRecording.claudeInteractions
    .filter((i: any) => i.promptQuality !== null)
    .map((i: any) => i.promptQuality);

  if (qualityScores.length > 0) {
    metrics.avgPromptQuality =
      qualityScores.reduce((sum: number, score: number) => sum + score, 0) /
      qualityScores.length;
  }

  // Calculate test pass rate
  if (sessionRecording.testResults.length > 0) {
    const passedTests = sessionRecording.testResults.filter(
      (t: any) => t.passed
    ).length;
    metrics.testPassRate = passedTests / sessionRecording.testResults.length;
  }

  // Calculate code activity rate (snapshots per minute)
  if (sessionRecording.duration && sessionRecording.duration > 0) {
    metrics.codeActivityRate =
      (sessionRecording.codeSnapshots.length / sessionRecording.duration) * 60;
  }

  return metrics;
}
