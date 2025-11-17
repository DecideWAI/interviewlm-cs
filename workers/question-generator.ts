/**
 * Question Generator Worker
 *
 * Background worker that pre-generates questions from seeds.
 * Runs as a BullMQ worker, warming the cache for better performance.
 *
 * Triggers:
 * - Cron job (daily): Pre-generate variants for all active seeds
 * - On-demand: When a new seed is created or updated
 * - Assessment creation: Pre-warm questions for selected seeds
 */

import { Worker, Job, Queue } from 'bullmq';
import { redisConnection, getQueue } from '../lib/queues/config';
import { generateQuestionFromSeed } from '../lib/services/questions';
import { setQuestionCache } from '../lib/services/question-cache';
import prisma from '../lib/prisma';

export const QUESTION_GENERATION_QUEUE = 'question-generation';

/**
 * Job data for question generation
 */
export interface QuestionGenJobData {
  seedId: string;
  language?: string; // If specified, only generate for this language
  variants?: number; // Number of variants to generate (default: 3)
  priority?: number; // 1-10, higher = more urgent
}

/**
 * Question Generator Worker
 */
class QuestionGeneratorWorker {
  private worker: Worker;
  private queue: Queue;

  constructor() {
    // Create queue for adding jobs
    this.queue = new Queue(QUESTION_GENERATION_QUEUE, {
      connection: redisConnection,
    });

    // Create worker for processing jobs
    this.worker = new Worker(
      QUESTION_GENERATION_QUEUE,
      async (job: Job<QuestionGenJobData>) => {
        await this.generateQuestions(job);
      },
      {
        connection: redisConnection,
        concurrency: 3, // Process 3 seeds simultaneously
        limiter: {
          max: 10, // Max 10 questions per...
          duration: 60000, // ...1 minute (rate limit Claude API)
        },
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      console.log(`[Question Generator] Generated questions for seed: ${job.data.seedId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(
        `[Question Generator] Failed to generate for seed ${job?.data.seedId}:`,
        err.message
      );
    });

    this.worker.on('error', (error) => {
      console.error('[Question Generator] Worker error:', error);
    });

    console.log('[Question Generator] Worker started');
  }

  /**
   * Generate questions for a seed
   */
  private async generateQuestions(job: Job<QuestionGenJobData>): Promise<void> {
    const { seedId, language, variants = 3 } = job.data;

    // Fetch seed from database
    const seed = await prisma.problemSeed.findUnique({
      where: { id: seedId },
    });

    if (!seed) {
      throw new Error(`Seed not found: ${seedId}`);
    }

    // Skip if seed is not active
    if (seed.status !== 'active') {
      console.log(`[Question Generator] Skipping inactive seed: ${seedId}`);
      return;
    }

    const languages = language ? [language] : ['javascript', 'typescript', 'python', 'go'];
    const difficulties = ['EASY', 'MEDIUM', 'HARD'] as const;

    let generatedCount = 0;

    // Generate variants for each language and difficulty
    for (const lang of languages) {
      for (const difficulty of difficulties) {
        for (let variant = 0; variant < variants; variant++) {
          try {
            // Generate question
            const question = await generateQuestionFromSeed({
              seed: {
                title: seed.title,
                description: seed.description,
                instructions: seed.instructions || undefined,
                topics: seed.topics as string[],
                difficulty: difficulty,
                category: seed.category,
                tags: seed.tags as string[],
                starterCode: seed.starterCode || undefined,
                estimatedTime: seed.estimatedTime,
              },
              language: lang,
              difficulty,
            });

            // Cache the generated question
            const cacheKey = `seed:${seedId}:lang:${lang}:diff:${difficulty}:var:${variant}`;
            await setQuestionCache(cacheKey, question, 7 * 24 * 60 * 60); // 7 days TTL

            generatedCount++;

            // Small delay to avoid hitting rate limits
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error(
              `[Question Generator] Error generating ${lang}/${difficulty} variant ${variant}:`,
              error
            );
            // Continue with next variant
          }
        }
      }
    }

    console.log(`[Question Generator] Generated ${generatedCount} questions for seed ${seedId}`);

    // Update seed usage stats
    await prisma.problemSeed.update({
      where: { id: seedId },
      data: {
        usageCount: { increment: generatedCount },
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Queue a job to generate questions for a seed
   */
  async queueSeed(data: QuestionGenJobData): Promise<void> {
    await this.queue.add('generate', data, {
      priority: data.priority || 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      jobId: `seed:${data.seedId}:${Date.now()}`, // Unique job ID
    });
  }

  /**
   * Queue all active seeds for generation (cron job)
   */
  async queueAllSeeds(): Promise<void> {
    console.log('[Question Generator] Queueing all active seeds...');

    const activeSeeds = await prisma.problemSeed.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
      },
    });

    for (const seed of activeSeeds) {
      await this.queueSeed({
        seedId: seed.id,
        variants: 2, // Generate 2 variants for each combo
        priority: 3, // Lower priority for batch jobs
      });
    }

    console.log(`[Question Generator] Queued ${activeSeeds.length} seeds`);
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

/**
 * Start the question generator worker
 */
export function startQuestionGenerator(): QuestionGeneratorWorker {
  return new QuestionGeneratorWorker();
}

/**
 * Standalone script to run the worker
 * Usage: ts-node workers/question-generator.ts
 */
if (require.main === module) {
  const worker = startQuestionGenerator();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Question Generator] Received SIGTERM, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Question Generator] Received SIGINT, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  // Optional: Run batch generation on startup
  if (process.env.PREGENERATE_ON_START === 'true') {
    worker.queueAllSeeds().catch((error) => {
      console.error('[Question Generator] Failed to queue seeds:', error);
    });
  }
}
