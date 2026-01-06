/**
 * Next.js Client Instrumentation
 *
 * This file configures Sentry for the browser/client-side.
 * It captures JavaScript errors, performance metrics, and user interactions.
 *
 * Note: This is the new convention for Turbopack compatibility.
 * The content is identical to sentry.client.config.ts which is kept for
 * backwards compatibility with Webpack.
 */

import * as Sentry from "@sentry/nextjs";

/**
 * Capture router transitions for navigation performance monitoring.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment and release
  environment: process.env.NODE_ENV,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay for error debugging (25% sessions, 100% on errors)
  replaysSessionSampleRate: 0.25,
  replaysOnErrorSampleRate: 1.0,

  // Enable in all environments (set to false to disable)
  enabled: true,

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
      // Capture network requests for API debugging (without bodies to avoid sensitive data)
      networkDetailAllowUrls: ["/api/", "/monitoring-tunnel"],
      networkCaptureBodies: false,
      networkRequestHeaders: ["X-Request-Id", "X-Session-Id"],
      networkResponseHeaders: ["X-Request-Id"],
    }),
    // User feedback widget for error reporting
    // Position adjusted via CSS in globals.css to avoid overlapping modal buttons
    Sentry.feedbackIntegration({
      colorScheme: "dark",
      buttonLabel: "Report Issue",
      submitButtonLabel: "Send Feedback",
      formTitle: "Report an Issue",
      messagePlaceholder: "Describe what happened...",
      autoInject: true,
      showBranding: false,
      themeDark: {
        background: "#000000",
        foreground: "#FFFFFF",
        accentBackground: "#5E6AD2",
        accentForeground: "#FFFFFF",
      },
    }),
  ],
});
