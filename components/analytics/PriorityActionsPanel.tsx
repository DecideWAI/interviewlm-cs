"use client";

import { PriorityAction } from "@/types/analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface PriorityActionsPanelProps {
  actions: PriorityAction[];
}

export function PriorityActionsPanel({ actions }: PriorityActionsPanelProps) {
  const getIcon = (type: PriorityAction["type"]) => {
    switch (type) {
      case "review_needed":
        return <AlertCircle className="h-5 w-5" />;
      case "stuck_in_stage":
        return <Clock className="h-5 w-5" />;
      case "offer_response":
        return <CheckCircle2 className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  const getSeverityBadge = (severity: PriorityAction["severity"]) => {
    switch (severity) {
      case "high":
        return <Badge variant="error">High</Badge>;
      case "medium":
        return <Badge variant="warning">Medium</Badge>;
      case "low":
        return <Badge variant="info">Low</Badge>;
      default:
        return null;
    }
  };

  const getSeverityColor = (severity: PriorityAction["severity"]) => {
    switch (severity) {
      case "high":
        return "text-error";
      case "medium":
        return "text-warning";
      case "low":
        return "text-info";
      default:
        return "text-text-primary";
    }
  };

  return (
    <div className="bg-background-secondary border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">
        Priority Actions
      </h3>

      <div className="space-y-4">
        {actions.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3 opacity-50" />
            <p className="text-text-secondary">No urgent actions needed</p>
            <p className="text-sm text-text-tertiary mt-1">
              All assessments are on track
            </p>
          </div>
        ) : (
          actions.map((action) => (
            <div
              key={action.id}
              className="flex items-start gap-4 p-4 bg-background-tertiary border border-border rounded-lg hover:border-border-hover transition-all"
            >
              <div className={cn("mt-0.5", getSeverityColor(action.severity))}>
                {getIcon(action.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h4 className="font-medium text-text-primary">
                    {action.title}
                  </h4>
                  {getSeverityBadge(action.severity)}
                </div>

                <p className="text-sm text-text-secondary mb-3">
                  {action.description}
                </p>

                <Link href={action.actionUrl}>
                  <Button variant="outline" size="sm">
                    {action.actionLabel}
                  </Button>
                </Link>
              </div>

              {action.count !== undefined && (
                <div className="text-right">
                  <div className={cn(
                    "text-2xl font-bold",
                    getSeverityColor(action.severity)
                  )}>
                    {action.count}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
