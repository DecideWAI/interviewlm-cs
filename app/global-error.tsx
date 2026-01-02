"use client";

/**
 * Global Error Boundary
 *
 * This component catches unhandled errors in the React tree and reports them to Sentry.
 * It provides a fallback UI when the app crashes.
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report the error to Sentry
    Sentry.captureException(error, {
      tags: {
        errorBoundary: "global",
      },
      extra: {
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-text-primary">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-background-secondary border border-border rounded-lg p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-error/10 rounded-full">
                <AlertTriangle className="h-12 w-12 text-error" />
              </div>
            </div>

            <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-text-secondary mb-6">
              An unexpected error occurred. Our team has been notified and is
              working on a fix.
            </p>

            {error.digest && (
              <p className="text-xs text-text-tertiary mb-6 font-mono">
                Error ID: {error.digest}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={reset} variant="primary">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
              <Button
                onClick={() => (window.location.href = "/")}
                variant="secondary"
              >
                Go to homepage
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
