/**
 * Migration script to fix session replay data issues:
 * 1. Fix duplicate order values in generated_questions
 * 2. Generate missing question.start events
 * 3. Backfill question_index on session events
 *
 * Run with: npx tsx scripts/fix-question-order-and-events.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface QuestionBoundary {
  questionId: string;
  order: number;
  startedAt: Date | null;
  endedAt: Date | null; // completedAt or next question's startedAt
}

async function fixQuestionOrders() {
  console.log("\n=== Fixing Question Orders ===\n");

  // Get all candidates with their generated questions
  const candidates = await prisma.candidate.findMany({
    include: {
      generatedQuestions: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  let fixedCount = 0;
  let candidatesWithIssues = 0;

  for (const candidate of candidates) {
    const questions = candidate.generatedQuestions;
    if (questions.length === 0) continue;

    // Check if orders are sequential (0, 1, 2, ...)
    const expectedOrders = questions.map((_, i) => i);
    const actualOrders = questions.map((q) => q.order);

    const hasIssue = !expectedOrders.every((expected, i) => expected === actualOrders[i]);

    if (hasIssue) {
      candidatesWithIssues++;
      console.log(`Candidate ${candidate.id} (${candidate.name}):`);
      console.log(`  Current orders: [${actualOrders.join(", ")}]`);
      console.log(`  Expected orders: [${expectedOrders.join(", ")}]`);

      // Fix each question's order
      for (let i = 0; i < questions.length; i++) {
        if (questions[i].order !== i) {
          await prisma.generatedQuestion.update({
            where: { id: questions[i].id },
            data: { order: i },
          });
          fixedCount++;
          console.log(`  Fixed question "${questions[i].title.substring(0, 40)}...": ${questions[i].order} -> ${i}`);
        }
      }
    }
  }

  console.log(`\nFixed ${fixedCount} questions across ${candidatesWithIssues} candidates`);
  return { fixedCount, candidatesWithIssues };
}

async function generateQuestionStartEvents() {
  console.log("\n=== Generating Missing question.start Events ===\n");

  // Get all session recordings with their events and candidate's questions
  const sessions = await prisma.sessionRecording.findMany({
    include: {
      candidate: {
        include: {
          generatedQuestions: {
            orderBy: { order: "asc" },
          },
        },
      },
      eventLog: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  let generatedCount = 0;

  for (const session of sessions) {
    const questions = session.candidate.generatedQuestions;
    const existingStartEvents = session.eventLog.filter(
      (e) => e.eventType === "question.start"
    );

    // Track which questions already have start events
    const questionsWithStartEvents = new Set(
      existingStartEvents.map((e) => (e.data as any)?.questionId)
    );

    // Get conversation reset events to determine question start times
    const conversationResets = session.eventLog
      .filter((e) => e.eventType === "chat.conversation_reset")
      .map((e) => e.timestamp);

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      // Skip if question already has a start event
      if (questionsWithStartEvents.has(question.id)) {
        continue;
      }

      // Determine start time using multiple heuristics
      let startTime: Date | null = question.startedAt;

      if (!startTime && i === 0) {
        // First question starts at session start
        startTime = session.startTime;
      } else if (!startTime && i > 0) {
        // Use conversation_reset event for subsequent questions
        const resetTime = conversationResets[i - 1];
        if (resetTime) {
          startTime = resetTime;
        } else {
          // Fall back to previous question's completedAt
          startTime = questions[i - 1]?.completedAt || null;
        }
      }

      // Skip if we still can't determine start time
      if (!startTime) {
        console.log(
          `Session ${session.id}: Skipping Q${question.order + 1} - no start time determinable`
        );
        continue;
      }

      // Get next sequence number for this session
      const maxSeq = await prisma.sessionEventLog.aggregate({
        where: { sessionId: session.id },
        _max: { sequenceNumber: true },
      });
      const nextSeq = (maxSeq._max.sequenceNumber || BigInt(0)) + BigInt(1);

      // Create the question.start event
      await prisma.sessionEventLog.create({
        data: {
          sessionId: session.id,
          sequenceNumber: nextSeq,
          timestamp: startTime,
          eventType: "question.start",
          category: "question",
          origin: "SYSTEM",
          data: {
            questionId: question.id,
            title: question.title,
            difficulty: question.difficulty,
            order: question.order,
            questionNumber: question.order + 1,
            _migrated: true, // Flag this was created by migration
          },
          questionIndex: question.order,
          checkpoint: true,
        },
      });

      generatedCount++;
      console.log(
        `Session ${session.id}: Created question.start for Q${question.order + 1} "${question.title.substring(0, 30)}..." at ${startTime.toISOString()}`
      );
    }
  }

  console.log(`\nGenerated ${generatedCount} question.start events`);
  return generatedCount;
}

async function backfillQuestionIndex() {
  console.log("\n=== Backfilling question_index on Events ===\n");

  // Get all session recordings with their questions and events
  const sessions = await prisma.sessionRecording.findMany({
    include: {
      candidate: {
        include: {
          generatedQuestions: {
            orderBy: { order: "asc" },
          },
        },
      },
      eventLog: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  let updatedCount = 0;

  for (const session of sessions) {
    const questions = session.candidate.generatedQuestions;
    const events = session.eventLog;

    if (questions.length === 0 || events.length === 0) {
      continue;
    }

    // Strategy: Use chat.conversation_reset events as question boundaries
    // OR use question completed_at timestamps as end boundaries
    const conversationResets = events
      .filter((e) => e.eventType === "chat.conversation_reset")
      .map((e) => e.timestamp);

    // Build question boundaries using multiple heuristics
    const boundaries: QuestionBoundary[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const nextQ = questions[i + 1];

      // Start time: use startedAt, or conversation_reset, or session start
      let startTime: Date | null = q.startedAt;
      if (!startTime && i === 0) {
        // First question starts at session start
        startTime = session.startTime;
      } else if (!startTime && i > 0) {
        // Subsequent questions start after the previous question's completedAt
        // or at the conversation_reset event
        const prevCompleted = questions[i - 1]?.completedAt;
        const resetTime = conversationResets[i - 1]; // i-1 because first reset is for Q2
        startTime = resetTime || prevCompleted || null;
      }

      // End time: use next question's start, or completedAt, or next conversation_reset
      let endTime: Date | null = nextQ?.startedAt || q.completedAt;
      if (!endTime && i < conversationResets.length) {
        endTime = conversationResets[i];
      }

      boundaries.push({
        questionId: q.id,
        order: q.order,
        startedAt: startTime,
        endedAt: endTime,
      });
    }

    console.log(`Session ${session.id}: Built ${boundaries.length} question boundaries`);
    boundaries.forEach((b, i) => {
      console.log(`  Q${i}: ${b.startedAt?.toISOString() || "NULL"} -> ${b.endedAt?.toISOString() || "NULL"}`);
    });

    // Update events that have NULL question_index
    const eventsToUpdate = events.filter((e) => e.questionIndex === null);
    let sessionUpdatedCount = 0;

    for (const event of eventsToUpdate) {
      // Find which question this event belongs to based on timestamp
      let questionIndex: number | null = null;
      const eventTime = event.timestamp.getTime();

      for (const boundary of boundaries) {
        const startTime = boundary.startedAt?.getTime() || 0;
        const endTime = boundary.endedAt?.getTime() || Date.now();

        if (eventTime >= startTime && eventTime <= endTime) {
          questionIndex = boundary.order;
          break;
        }
      }

      // If we couldn't determine from boundaries, use order based on position
      // relative to conversation_reset events
      if (questionIndex === null) {
        // Count how many conversation_resets occurred before this event
        const resetsBefore = conversationResets.filter(
          (r) => r.getTime() < eventTime
        ).length;
        questionIndex = Math.min(resetsBefore, questions.length - 1);
      }

      if (questionIndex !== null) {
        await prisma.sessionEventLog.update({
          where: { id: event.id },
          data: { questionIndex },
        });
        sessionUpdatedCount++;
        updatedCount++;
      }
    }

    if (sessionUpdatedCount > 0) {
      console.log(
        `Session ${session.id}: Updated ${sessionUpdatedCount} events with question_index`
      );
    }
  }

  console.log(`\nUpdated ${updatedCount} events with question_index`);
  return updatedCount;
}

async function printSummary(sessionId?: string) {
  console.log("\n=== Summary ===\n");

  // Query specific session or all sessions
  const whereClause = sessionId ? { id: sessionId } : {};

  const sessions = await prisma.sessionRecording.findMany({
    where: whereClause,
    include: {
      candidate: {
        select: { name: true },
      },
      eventLog: {
        select: { eventType: true, questionIndex: true },
      },
      _count: {
        select: { eventLog: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const session of sessions) {
    const eventsWithIndex = session.eventLog.filter(
      (e) => e.questionIndex !== null
    ).length;
    const questionStartEvents = session.eventLog.filter(
      (e) => e.eventType === "question.start"
    ).length;

    console.log(`Session: ${session.id} (${session.candidate.name})`);
    console.log(`  Total events: ${session._count.eventLog}`);
    console.log(`  Events with question_index: ${eventsWithIndex}`);
    console.log(`  question.start events: ${questionStartEvents}`);
    console.log("");
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Session Replay Data Migration");
  console.log("=".repeat(60));

  try {
    // Step 1: Fix question orders
    const orderResult = await fixQuestionOrders();

    // Step 2: Generate missing question.start events
    const startEventsCount = await generateQuestionStartEvents();

    // Step 3: Backfill question_index on events
    const backfillCount = await backfillQuestionIndex();

    // Print summary
    await printSummary();

    console.log("\n" + "=".repeat(60));
    console.log("Migration Complete!");
    console.log("=".repeat(60));
    console.log(`- Fixed ${orderResult.fixedCount} question orders`);
    console.log(`- Generated ${startEventsCount} question.start events`);
    console.log(`- Backfilled ${backfillCount} event question_index values`);
    console.log("\nPlease verify the replay for affected sessions.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
