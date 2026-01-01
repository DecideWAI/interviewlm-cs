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

import http from "http";
import { startInterviewAgent } from "./interview-agent";
import { startEvaluationAgent } from "./evaluation-agent";
import { startQuestionGenerator } from "./question-generator";

// Health check server for Cloud Run
const PORT = parseInt(process.env.PORT || "8080", 10);
let workersHealthy = false;

const healthServer = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    if (workersHealthy) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", workers: true }));
    } else {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "starting", workers: false }));
    }
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

healthServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[Workers] Health check server listening on port ${PORT}`);
});

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

    // Start Question Generator Worker
    console.log("[Workers] Starting Question Generator Worker...");
    startQuestionGenerator();
    console.log("[Workers] ✓ Question Generator Worker started");

    console.log();
    console.log("=".repeat(60));
    console.log("✓ All Workers Started Successfully");
    console.log("=".repeat(60));
    console.log();
    console.log("Workers running. Press Ctrl+C to stop.");
    console.log();

    // Mark workers as healthy for health checks
    workersHealthy = true;

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
