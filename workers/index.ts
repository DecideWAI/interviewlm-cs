/**
 * Worker Process Manager
 *
 * Starts all background workers for the InterviewLM multi-agent system.
 * Run this file to start the complete worker infrastructure.
 *
 * Workers:
 * - Interview Agent: Observes candidate progress, tracks metrics
 * - Evaluation Agent: Scores completed interviews
 *
 * Usage:
 *   npm run workers             # Start all workers
 *   npm run workers:interview   # Start Interview Agent only
 *   npm run workers:evaluation  # Start Evaluation Agent only
 */

import { startInterviewAgent } from './interview-agent';
import { startEvaluationAgent } from './evaluation-agent';

/**
 * Start all workers
 */
async function startAllWorkers() {
  console.log('='.repeat(60));
  console.log('InterviewLM Multi-Agent Worker System');
  console.log('='.repeat(60));
  console.log('');

  // Check for required environment variables
  const requiredEnvVars = [
    'REDIS_HOST',
    'REDIS_PORT',
    'DATABASE_URL',
    'ANTHROPIC_API_KEY',
  ];

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach((v) => console.error(`   - ${v}`));
    process.exit(1);
  }

  console.log('✓ Environment variables validated');
  console.log('');

  // Start workers
  console.log('Starting workers...');
  console.log('');

  const workers = [
    startInterviewAgent(),
    startEvaluationAgent(),
  ];

  console.log('');
  console.log('✓ All workers started successfully');
  console.log('');
  console.log('Press Ctrl+C to stop all workers');
  console.log('='.repeat(60));

  // Graceful shutdown
  const shutdown = async () => {
    console.log('');
    console.log('Shutting down workers...');

    await Promise.all(
      workers.map(async (worker) => {
        await worker.close();
      })
    );

    console.log('✓ All workers stopped');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Run if this file is executed directly
if (require.main === module) {
  startAllWorkers().catch((error) => {
    console.error('Failed to start workers:', error);
    process.exit(1);
  });
}

export { startAllWorkers };
