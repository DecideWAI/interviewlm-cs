/**
 * Next.js Instrumentation
 *
 * This file initializes Sentry for server-side error tracking.
 * Required for Next.js 13+ with App Router.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Import server config for Node.js runtime
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Import edge config for Edge runtime
    await import("./sentry.edge.config");
  }
}

/**
 * Capture errors from nested React Server Components.
 * This hook is called when an error occurs during request handling.
 */
export const onRequestError = Sentry.captureRequestError;
