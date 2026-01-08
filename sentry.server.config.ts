/**
 * Sentry Server Configuration
 *
 * This file configures Sentry for the Node.js server-side (API routes, SSR).
 * It captures server errors, database issues, and API failures.
 */

import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// SSE endpoints that should not be traced (they're long-lived connections, not slow)
const SSE_ENDPOINTS = [
  "/api/interview/[id]/code-stream",
  "/api/interview/[id]/file-updates",
  "/api/interview/[id]/terminal/pty",
  "/api/interview/[id]/terminal/stream",
];

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Environment and release
  environment: process.env.NODE_ENV,

  // Performance monitoring - use tracesSampler to filter SSE endpoints
  tracesSampler: (samplingContext) => {
    const transactionName = samplingContext.name || "";

    // Don't trace SSE endpoints - they're long-lived connections, not slow requests
    if (SSE_ENDPOINTS.some((endpoint) => transactionName.includes(endpoint))) {
      return 0; // Don't sample
    }

    // Sample everything else at full rate
    return 1.0;
  },

  // Profiling - profiles 10% of *sampled* transactions (effective = tracesSampleRate * profilesSampleRate)
  profilesSampleRate: 0.1,

  // Enable structured logs to Sentry
  enableLogs: true,

  // Enable in all environments (set to false to disable)
  enabled: true,

  // Server-specific settings
  serverName: process.env.HOSTNAME || "interviewlm-server",

  // Ignore expected errors
  ignoreErrors: [
    // Auth errors (expected flow)
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
    // Rate limiting (expected)
    "Rate limit exceeded",
    // Validation errors (user input)
    "ZodError",
  ],

  // Filter and enrich events before sending
  beforeSend(event, hint) {
    // Add extra context from the original exception
    const error = hint.originalException;
    if (error instanceof Error) {
      // Add custom tags based on error type
      if (error.name === "PrismaClientKnownRequestError") {
        event.tags = { ...event.tags, database: "prisma" };
      }
      if (error.message.includes("ANTHROPIC")) {
        event.tags = { ...event.tags, service: "anthropic" };
      }
      if (error.message.includes("MODAL") || error.message.includes("modal")) {
        event.tags = { ...event.tags, service: "modal" };
      }
    }

    return event;
  },

  // Integration configuration
  integrations: [
    // Capture HTTP requests
    Sentry.httpIntegration(),
    // Capture unhandled promise rejections
    Sentry.onUnhandledRejectionIntegration(),
    // Node.js profiling for performance insights
    nodeProfilingIntegration(),
    // Capture console.log/warn/error as Sentry Logs
    Sentry.consoleLoggingIntegration({
      levels: ["log", "info", "warn", "error"],
    }),
  ],
});
