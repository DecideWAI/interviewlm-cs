import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import {
  getDeadLetterJobs,
  getDeadLetterStats,
  retryDeadLetterJob,
  clearDeadLetterQueue,
} from "@/lib/queues/dlq";

/**
 * GET /api/admin/dlq
 * View dead letter queue statistics and jobs
 *
 * Query params:
 * - queue: Filter by queue name (optional)
 * - limit: Number of jobs to return (default: 100)
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Check if user is admin
    // For now, just check if authenticated

    const { searchParams } = new URL(request.url);
    const queueName = searchParams.get("queue");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // If no queue specified, return stats for all queues
    if (!queueName) {
      const stats = await getDeadLetterStats();
      return NextResponse.json({
        success: true,
        stats,
      });
    }

    // Get jobs for specific queue
    const jobs = await getDeadLetterJobs(queueName, limit);

    return NextResponse.json({
      success: true,
      queueName,
      jobCount: jobs.length,
      jobs,
    });
  } catch (error) {
    console.error("DLQ API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/dlq
 * Retry or clear DLQ jobs
 *
 * Body:
 * - action: "retry" | "clear"
 * - queue: Queue name (required)
 * - jobId: Job ID (required for retry)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Check if user is admin

    const body = await request.json();
    const { action, queue, jobId } = body;

    if (!action || !queue) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: action, queue",
        },
        { status: 400 }
      );
    }

    if (action === "retry") {
      if (!jobId) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing jobId for retry action",
          },
          { status: 400 }
        );
      }

      const success = await retryDeadLetterJob(queue, jobId);

      return NextResponse.json({
        success,
        message: success
          ? `Job ${jobId} retried successfully`
          : `Failed to retry job ${jobId}`,
      });
    }

    if (action === "clear") {
      const clearedCount = await clearDeadLetterQueue(queue);

      return NextResponse.json({
        success: true,
        message: `Cleared ${clearedCount} jobs from queue ${queue}`,
        clearedCount,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unknown action: ${action}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("DLQ API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
