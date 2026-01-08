/**
 * Sentry Edge Configuration
 *
 * This file configures Sentry for Edge runtime (middleware, Edge API routes).
 * Edge runtime has limited APIs, so configuration is minimal.
 */

import * as Sentry from "@sentry/nextjs";

// SSE endpoints that should not be traced (they're long-lived connections, not slow)
const SSE_ENDPOINTS = [
  "/api/interview/[id]/code-stream",
  "/api/interview/[id]/file-updates",
  "/api/interview/[id]/terminal/pty",
  "/api/interview/[id]/terminal/stream",
];

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Environment
  environment: process.env.NODE_ENV,

  // Performance monitoring - use tracesSampler to filter SSE endpoints
  tracesSampler: (samplingContext) => {
    const transactionName = samplingContext.name || "";

    // Don't trace SSE endpoints - they're long-lived connections, not slow requests
    if (SSE_ENDPOINTS.some((endpoint) => transactionName.includes(endpoint))) {
      return 0; // Don't sample
    }

    // Sample at 10% in production, 100% in development
    return process.env.NODE_ENV === "production" ? 0.1 : 1.0;
  },

  // Enable in all environments (set to false to disable)
  enabled: true,

  // Ignore expected errors
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
});
