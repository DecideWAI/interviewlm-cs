/**
 * Sentry Server Configuration
 *
 * This file configures Sentry for the Node.js server-side (API routes, SSR).
 * It captures server errors, database issues, and API failures.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Environment and release
  environment: process.env.NODE_ENV,

  // Performance monitoring - sample more in production for APM
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

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
  ],
});
