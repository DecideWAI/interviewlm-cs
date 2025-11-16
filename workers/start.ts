/**
 * Worker Process Startup Script
 *
 * Starts all BullMQ workers for background job processing:
 * - Interview Agent Worker (monitors AI interactions, adjusts IRT parameters)
 * - Evaluation Agent Worker (generates comprehensive evaluation reports)
 *
 * Usage:
 *   npm run workers        # Start all workers
 *   npm run workers:dev    # Start with hot reload
 */

import { startInterviewAgent } from "./interview-agent";
import { startEvaluationAgent } from "./evaluation-agent";

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log(`[Workers] Already shutting down...`);
    return;
  }

  isShuttingDown = true;
  console.log(`\n[Workers] Received ${signal}, gracefully shutting down...`);

  try {
    // Close workers (they handle their own cleanup)
    console.log("[Workers] Workers shut down complete");

    process.exit(0);
  } catch (error) {
    console.error("[Workers] Error during shutdown:", error);
    process.exit(1);
  }
}

// Register signal handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[Workers] Uncaught exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Workers] Unhandled rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});

/**
 * Main startup function
 */
async function startWorkers() {
  console.log("=".repeat(60));
  console.log("InterviewLM Workers Starting");
  console.log("=".repeat(60));
  console.log();

  try {
    // Check required environment variables
    const requiredEnvVars = [
      "DATABASE_URL",
      "REDIS_URL",
      "ANTHROPIC_API_KEY",
    ];

    const missingEnvVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingEnvVars.length > 0) {
      console.error(
        "[Workers] ERROR: Missing required environment variables:",
        missingEnvVars.join(", ")
      );
      process.exit(1);
    }

    console.log("[Workers] Environment variables validated");
    console.log();

    // Start Interview Agent Worker
    console.log("[Workers] Starting Interview Agent Worker...");
    startInterviewAgent();
    console.log("[Workers] ✓ Interview Agent Worker started");

    // Start Evaluation Agent Worker
    console.log("[Workers] Starting Evaluation Agent Worker...");
    startEvaluationAgent();
    console.log("[Workers] ✓ Evaluation Agent Worker started");

    console.log();
    console.log("=".repeat(60));
    console.log("✓ All Workers Started Successfully");
    console.log("=".repeat(60));
    console.log();
    console.log("Workers running. Press Ctrl+C to stop.");
    console.log();

    // Keep process alive
    process.stdin.resume();

  } catch (error) {
    console.error("[Workers] Fatal error during startup:", error);
    process.exit(1);
  }
}

// Start the workers
startWorkers().catch((error) => {
  console.error("[Workers] Failed to start workers:", error);
  process.exit(1);
});
