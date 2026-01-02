/**
 * Sentry Client Configuration
 *
 * This file configures Sentry for the browser/client-side.
 * It captures JavaScript errors, performance metrics, and user interactions.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment and release
  environment: process.env.NODE_ENV,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay for error debugging
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",

  // Ignore common browser errors that aren't actionable
  ignoreErrors: [
    // Browser extensions
    "top.GLOBALS",
    "originalCreateNotification",
    "canvas.contentDocument",
    "MyApp_RemoveAllHighlights",
    "http://tt.teletrader.com/",
    "jigsaw is not defined",
    "ComboSearch is not defined",
    "http://loading.retry.widdit.com/",
    "atomicFindClose",
    // Chrome extensions
    "chrome-extension://",
    "moz-extension://",
    // Network errors
    "Network request failed",
    "Failed to fetch",
    "Load failed",
    "NetworkError",
    // Cancelled requests
    "AbortError",
    "The operation was aborted",
  ],

  // Filter out noisy events
  beforeSend(event, hint) {
    // Don't send events in development
    if (process.env.NODE_ENV !== "production") {
      return null;
    }

    // Filter out ResizeObserver loop errors (browser bug, not actionable)
    const error = hint.originalException;
    if (
      error instanceof Error &&
      error.message.includes("ResizeObserver loop")
    ) {
      return null;
    }

    return event;
  },

  // Integration configuration
  integrations: [
    Sentry.replayIntegration({
      // Mask all text content for privacy
      maskAllText: true,
      // Block all media for privacy
      blockAllMedia: true,
    }),
  ],
});
