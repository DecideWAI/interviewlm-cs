"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Code2,
  TestTube,
  MessageSquare as MessageSquareIcon,
  Terminal,
  BarChart3,
  AlertTriangle,
  Star,
  Sparkles,
} from "lucide-react";
import type {
  EvidenceMarker,
  EvaluationDimension,
  ComprehensiveEvidence,
} from "@/lib/types/comprehensive-evaluation";
import {
  DIMENSION_COLORS,
  DIMENSION_ICONS,
  DIMENSION_LABELS,
} from "./EvidenceMarker";

interface EvidencePanelProps {
  markers: EvidenceMarker[];
  evaluation: {
    codeQualityScore: number;
    codeQualityEvidence?: ComprehensiveEvidence[];
    codeQualityConfidence?: number;
    problemSolvingScore: number;
    problemSolvingEvidence?: ComprehensiveEvidence[];
    problemSolvingConfidence?: number;
    aiCollaborationScore: number;
    aiCollaborationEvidence?: ComprehensiveEvidence[];
    aiCollaborationConfidence?: number;
    communicationScore: number;
    communicationEvidence?: ComprehensiveEvidence[];
    communicationConfidence?: number;
  } | null;
  onSeekToEvent: (eventId: string, sequenceNumber: number) => void;
  activeEventId?: string;
  sessionSummary?: string | null;
  className?: string;
}

// Icons for evidence types
const EVIDENCE_TYPE_ICONS = {
  code_snippet: Code2,
  test_result: TestTube,
  ai_interaction: MessageSquareIcon,
  terminal_command: Terminal,
  metric: BarChart3,
};

const IMPORTANCE_COLORS = {
  critical: "border-error/50 bg-error/5",
  important: "border-warning/50 bg-warning/5",
  normal: "border-border",
};

/**
 * Format timestamp relative to session start
 */
function formatTimestamp(timestamp: Date | string | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Single dimension section with expandable evidence items
 */
function DimensionSection({
  dimension,
  score,
  confidence,
  evidence,
  markers,
  onSeekToEvent,
  activeEventId,
  defaultExpanded = false,
}: {
  dimension: EvaluationDimension;
  score: number;
  confidence?: number;
  evidence?: ComprehensiveEvidence[];
  markers: EvidenceMarker[];
  onSeekToEvent: (eventId: string, sequenceNumber: number) => void;
  activeEventId?: string;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const colors = DIMENSION_COLORS[dimension];
  const Icon = DIMENSION_ICONS[dimension];
  const label = DIMENSION_LABELS[dimension];

  // Filter markers for this dimension
  const dimensionMarkers = useMemo(
    () => markers.filter((m) => m.dimension === dimension),
    [markers, dimension]
  );

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-error";
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center gap-3 p-3",
          "bg-background-secondary hover:bg-background-tertiary transition-colors",
          "text-left"
        )}
      >
        <div className={cn("p-1.5 rounded", colors.bgLight)}>
          <Icon className={cn("h-4 w-4", colors.text)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{label}</span>
            {dimensionMarkers.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-background-tertiary text-text-tertiary">
                {dimensionMarkers.length} linked
              </span>
            )}
          </div>
          {confidence !== undefined && (
            <p className="text-xs text-text-tertiary">
              {Math.round(confidence * 100)}% confidence
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={cn("text-lg font-bold", getScoreColor(score))}>
            {score}
          </span>
          <span className="text-xs text-text-muted">/100</span>
        </div>

        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-text-tertiary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-tertiary" />
        )}
      </button>

      {/* Evidence Items */}
      {isExpanded && (
        <div className="border-t border-border divide-y divide-border">
          {evidence && evidence.length > 0 ? (
            evidence.map((item, index) => {
              // Find linked marker for this evidence
              const linkedMarker = dimensionMarkers.find(
                (m) => m.evidenceIndex === index
              );
              const TypeIcon = EVIDENCE_TYPE_ICONS[item.type] || BarChart3;
              const ImportanceIcon =
                item.importance === "critical"
                  ? AlertTriangle
                  : item.importance === "important"
                  ? Star
                  : null;

              return (
                <div
                  key={index}
                  className={cn(
                    "p-3 hover:bg-background-tertiary/50 transition-colors",
                    linkedMarker && "cursor-pointer",
                    linkedMarker?.eventId === activeEventId &&
                      "bg-primary/5 border-l-2 border-l-primary",
                    IMPORTANCE_COLORS[item.importance || "normal"]
                  )}
                  onClick={() => {
                    if (linkedMarker) {
                      onSeekToEvent(linkedMarker.eventId, linkedMarker.sequenceNumber);
                    }
                  }}
                >
                  {/* Evidence header */}
                  <div className="flex items-start gap-2 mb-1">
                    <TypeIcon className="h-3.5 w-3.5 text-text-tertiary mt-0.5 flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary leading-snug">
                        {item.description}
                      </p>
                    </div>

                    {ImportanceIcon && (
                      <ImportanceIcon
                        className={cn(
                          "h-3.5 w-3.5 flex-shrink-0",
                          item.importance === "critical"
                            ? "text-error"
                            : "text-warning"
                        )}
                      />
                    )}
                  </div>

                  {/* Code snippet preview */}
                  {item.codeSnippet && (
                    <div className="mt-2 p-2 bg-background rounded border border-border">
                      <pre className="text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap line-clamp-3">
                        {item.codeSnippet}
                      </pre>
                    </div>
                  )}

                  {/* Metadata row */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                    <span className="capitalize px-1.5 py-0.5 rounded bg-background-tertiary">
                      {item.type.replace(/_/g, " ")}
                    </span>

                    {item.filePath && (
                      <span className="flex items-center gap-1 truncate">
                        <Code2 className="h-3 w-3" />
                        {item.filePath}
                        {item.lineNumber && `:${item.lineNumber}`}
                      </span>
                    )}

                    {item.timestamp && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(item.timestamp)}
                      </span>
                    )}

                    {linkedMarker && (
                      <span className="flex items-center gap-1 text-primary ml-auto">
                        <ExternalLink className="h-3 w-3" />
                        Jump to moment
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-sm text-text-tertiary">
              No evidence recorded for this dimension
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * EvidencePanel - Main panel component showing all evaluation evidence
 */
export function EvidencePanel({
  markers,
  evaluation,
  onSeekToEvent,
  activeEventId,
  sessionSummary,
  className,
}: EvidencePanelProps) {
  if (!evaluation) {
    return (
      <div className={cn("h-full flex flex-col items-center justify-center p-6 text-center", className)}>
        <Sparkles className="h-12 w-12 text-text-tertiary mb-3" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Evidence Not Available
        </h3>
        <p className="text-sm text-text-secondary max-w-xs">
          This session has not been evaluated yet or evidence data is not available.
        </p>
      </div>
    );
  }

  const linkedCount = markers.length;
  const totalEvidence =
    (evaluation.codeQualityEvidence?.length || 0) +
    (evaluation.problemSolvingEvidence?.length || 0) +
    (evaluation.aiCollaborationEvidence?.length || 0) +
    (evaluation.communicationEvidence?.length || 0);

  return (
    <div className={cn("h-full flex flex-col overflow-hidden", className)}>
      {/* Header */}
      <div className="p-4 border-b border-border bg-background-secondary">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Evaluation Evidence
          </h3>
          <span className="text-xs text-text-tertiary">
            {linkedCount}/{totalEvidence} linked
          </span>
        </div>

        {/* Summary */}
        {sessionSummary && (
          <div className="p-2 rounded bg-background-tertiary border border-border">
            <p className="text-xs text-text-secondary leading-relaxed">
              {sessionSummary}
            </p>
          </div>
        )}
      </div>

      {/* Dimension Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <DimensionSection
          dimension="codeQuality"
          score={evaluation.codeQualityScore}
          confidence={evaluation.codeQualityConfidence}
          evidence={evaluation.codeQualityEvidence}
          markers={markers}
          onSeekToEvent={onSeekToEvent}
          activeEventId={activeEventId}
          defaultExpanded={true}
        />

        <DimensionSection
          dimension="problemSolving"
          score={evaluation.problemSolvingScore}
          confidence={evaluation.problemSolvingConfidence}
          evidence={evaluation.problemSolvingEvidence}
          markers={markers}
          onSeekToEvent={onSeekToEvent}
          activeEventId={activeEventId}
        />

        <DimensionSection
          dimension="aiCollaboration"
          score={evaluation.aiCollaborationScore}
          confidence={evaluation.aiCollaborationConfidence}
          evidence={evaluation.aiCollaborationEvidence}
          markers={markers}
          onSeekToEvent={onSeekToEvent}
          activeEventId={activeEventId}
        />

        <DimensionSection
          dimension="communication"
          score={evaluation.communicationScore}
          confidence={evaluation.communicationConfidence}
          evidence={evaluation.communicationEvidence}
          markers={markers}
          onSeekToEvent={onSeekToEvent}
          activeEventId={activeEventId}
        />
      </div>
    </div>
  );
}

/**
 * Compact evidence indicator for use in headers
 */
export function EvidenceIndicator({
  markerCount,
  onClick,
  className,
}: {
  markerCount: number;
  onClick?: () => void;
  className?: string;
}) {
  if (markerCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded",
        "bg-primary/10 text-primary text-xs font-medium",
        "hover:bg-primary/20 transition-colors",
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
      <span>{markerCount} evidence moments</span>
    </button>
  );
}
