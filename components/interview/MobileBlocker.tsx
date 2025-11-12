/**
 * Mobile Blocker Component
 *
 * Displays a message to mobile users explaining that the interview
 * experience requires a desktop browser for optimal functionality.
 */

import { Monitor, Smartphone, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileBlocker() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <div className="relative flex items-center gap-4">
            <Smartphone className="h-12 w-12 text-text-tertiary" />
            <AlertCircle className="h-8 w-8 text-warning" />
            <Monitor className="h-12 w-12 text-primary" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-text-primary mb-3">
          Desktop Browser Required
        </h1>

        {/* Description */}
        <p className="text-text-secondary mb-6 leading-relaxed">
          The InterviewLM coding assessment requires a desktop or laptop computer
          for the best experience. Our interview environment includes a code editor,
          terminal, and AI assistant that work best on larger screens.
        </p>

        {/* Features List */}
        <div className="bg-background-secondary border border-border rounded-lg p-4 mb-6 text-left">
          <p className="text-sm font-semibold text-text-primary mb-3">
            Why desktop is required:
          </p>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Split-screen code editor and terminal</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Keyboard shortcuts for efficient coding</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Real-time AI collaboration interface</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Multiple resizable panels for workflow</span>
            </li>
          </ul>
        </div>

        {/* Instructions */}
        <div className="bg-info/10 border border-info/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-text-secondary">
            <strong className="text-info">Next steps:</strong>
            <br />
            Open this link on your desktop or laptop computer to continue
            with your assessment.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => {
              // Copy URL to clipboard
              navigator.clipboard.writeText(window.location.href);
              alert("Link copied to clipboard! Paste it in your desktop browser.");
            }}
            variant="primary"
            className="w-full"
          >
            Copy Link for Desktop
          </Button>

          <Button
            onClick={() => {
              // Send email with link
              const subject = "InterviewLM Assessment Link";
              const body = `Continue your InterviewLM assessment on desktop:\n\n${window.location.href}`;
              window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            }}
            variant="outline"
            className="w-full"
          >
            Email Link to Myself
          </Button>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-text-muted mt-6">
          Need help? Contact support at support@interviewlm.com
        </p>
      </div>
    </div>
  );
}
