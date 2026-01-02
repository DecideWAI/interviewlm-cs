"use client";

import React, { useEffect, useState, useRef } from "react";
import { AlertCircle, Lightbulb, HelpCircle, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AssistanceOffer {
  isStuck: boolean;
  level: 1 | 2 | 3 | 4;
  message: string;
  indicators: Array<{
    type: string;
    severity: number;
    evidence: string;
  }>;
  confidence: number;
}

interface ProactiveAssistanceProps {
  sessionId: string;
  onAccept?: (level: number) => void;
  onDismiss?: (level: number) => void;
}

export function ProactiveAssistance({
  sessionId,
  onAccept,
  onDismiss,
}: ProactiveAssistanceProps) {
  const [offer, setOffer] = useState<AssistanceOffer | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const url = `/api/interview/${sessionId}/assistance`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('connected', () => {
      console.log('[ProactiveAssistance] Connected');
    });

    eventSource.addEventListener('assistance', (event) => {
      const data: AssistanceOffer = JSON.parse(event.data);
      console.log('[ProactiveAssistance] Assistance offered:', data);

      if (data.isStuck && data.level > 0) {
        setOffer(data);
        setIsDismissed(false);
      }
    });

    eventSource.onerror = () => {
      console.error('[ProactiveAssistance] Connection error');
      eventSource.close();
    };

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  const handleAccept = () => {
    if (offer) {
      onAccept?.(offer.level);
      setIsDismissed(true);
    }
  };

  const handleDismiss = () => {
    if (offer) {
      onDismiss?.(offer.level);
      setIsDismissed(true);
    }
  };

  if (!offer || isDismissed || !offer.isStuck) {
    return null;
  }

  const getLevelIcon = (level: number) => {
    switch (level) {
      case 1:
        return <Lightbulb className="h-5 w-5" />;
      case 2:
        return <HelpCircle className="h-5 w-5" />;
      case 3:
        return <AlertCircle className="h-5 w-5" />;
      case 4:
        return <Zap className="h-5 w-5" />;
      default:
        return <Lightbulb className="h-5 w-5" />;
    }
  };

  const getLevelColor = (level: number) => {
    switch (level) {
      case 1:
        return "bg-info/10 border-info/20 text-info";
      case 2:
        return "bg-warning/10 border-warning/20 text-warning";
      case 3:
        return "bg-error/10 border-error/20 text-error";
      case 4:
        return "bg-error/20 border-error/30 text-error";
      default:
        return "bg-info/10 border-info/20 text-info";
    }
  };

  const getLevelTitle = (level: number) => {
    switch (level) {
      case 1:
        return "Tip";
      case 2:
        return "Suggestion";
      case 3:
        return "Help Available";
      case 4:
        return "Let's Work Together";
      default:
        return "Tip";
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 max-w-md z-50 rounded-lg border-2 p-4 shadow-2xl backdrop-blur-sm animate-slide-up",
        getLevelColor(offer.level)
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getLevelIcon(offer.level)}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            {getLevelTitle(offer.level)}
            {offer.confidence >= 0.7 && (
              <span className="text-xs opacity-70">
                (High confidence)
              </span>
            )}
          </h4>

          <div className="text-sm whitespace-pre-wrap mb-3">
            {offer.message}
          </div>

          {offer.indicators.length > 0 && (
            <details className="text-xs opacity-80 mb-3">
              <summary className="cursor-pointer hover:opacity-100">
                Why am I seeing this?
              </summary>
              <ul className="mt-2 space-y-1 ml-4 list-disc">
                {offer.indicators.slice(0, 3).map((indicator, idx) => (
                  <li key={idx}>{indicator.evidence}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={handleAccept}
              className="text-xs"
            >
              {offer.level >= 3 ? "Yes, Help Me" : "Show Me"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-xs"
            >
              No Thanks
            </Button>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss assistance offer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
