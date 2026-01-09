"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Code2,
  Brain,
  MessageSquare,
  Users,
  AlertTriangle,
  Star,
} from "lucide-react";
import type { EvidenceMarker as EvidenceMarkerType } from "@/lib/types/comprehensive-evaluation";

interface EvidenceMarkerProps {
  marker: EvidenceMarkerType;
  position: number; // percentage position on timeline (0-100)
  onClick: (eventId: string) => void;
  isActive?: boolean;
}

// Colors for each dimension
const DIMENSION_COLORS = {
  codeQuality: {
    bg: "bg-blue-500",
    border: "border-blue-400",
    text: "text-blue-400",
    bgLight: "bg-blue-500/20",
  },
  problemSolving: {
    bg: "bg-purple-500",
    border: "border-purple-400",
    text: "text-purple-400",
    bgLight: "bg-purple-500/20",
  },
  aiCollaboration: {
    bg: "bg-green-500",
    border: "border-green-400",
    text: "text-green-400",
    bgLight: "bg-green-500/20",
  },
  communication: {
    bg: "bg-yellow-500",
    border: "border-yellow-400",
    text: "text-yellow-400",
    bgLight: "bg-yellow-500/20",
  },
};

const DIMENSION_ICONS = {
  codeQuality: Code2,
  problemSolving: Brain,
  aiCollaboration: MessageSquare,
  communication: Users,
};

const DIMENSION_LABELS = {
  codeQuality: "Code Quality",
  problemSolving: "Problem Solving",
  aiCollaboration: "AI Collaboration",
  communication: "Communication",
};

const IMPORTANCE_ICONS = {
  critical: AlertTriangle,
  important: Star,
  normal: null,
};

export function EvidenceMarker({
  marker,
  position,
  onClick,
  isActive = false,
}: EvidenceMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);

  const colors = DIMENSION_COLORS[marker.dimension];
  const Icon = DIMENSION_ICONS[marker.dimension];
  const ImportanceIcon = IMPORTANCE_ICONS[marker.importance];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(marker.eventId);
  };

  return (
    <div
      className={cn(
        "absolute top-0 bottom-0 flex items-center justify-center cursor-pointer z-10",
        "hover:z-20 transition-transform",
        isActive && "z-30"
      )}
      style={{ left: `${position}%` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Marker line */}
      <div
        className={cn(
          "w-0.5 h-full opacity-40",
          colors.bg,
          isHovered && "opacity-70"
        )}
      />

      {/* Marker dot */}
      <div
        className={cn(
          "absolute -top-1 w-3 h-3 rounded-full border-2 border-background transition-transform",
          colors.bg,
          isHovered && "scale-125",
          isActive && "scale-150 ring-2 ring-offset-1 ring-offset-background",
          isActive && colors.border,
          marker.importance === "critical" && "ring-2 ring-error/50"
        )}
      >
        {/* Importance indicator */}
        {marker.importance === "critical" && (
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-error animate-pulse" />
        )}
      </div>

      {/* Tooltip */}
      {isHovered && (
        <div
          className={cn(
            "absolute -top-20 left-1/2 -translate-x-1/2",
            "bg-background-secondary border border-border rounded-lg shadow-lg",
            "px-3 py-2 min-w-56 max-w-72 z-50"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("p-1 rounded", colors.bgLight)}>
              <Icon className={cn("h-3 w-3", colors.text)} />
            </div>
            <span className={cn("text-xs font-medium", colors.text)}>
              {DIMENSION_LABELS[marker.dimension]}
            </span>
            {ImportanceIcon && (
              <ImportanceIcon
                className={cn(
                  "h-3 w-3 ml-auto",
                  marker.importance === "critical"
                    ? "text-error"
                    : "text-warning"
                )}
              />
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-text-secondary line-clamp-3">
            {marker.description}
          </p>

          {/* Evidence type badge */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-tertiary text-text-tertiary capitalize">
              {marker.evidenceType.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-text-muted ml-auto">
              Click to jump
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Evidence Markers Container
 * Renders multiple evidence markers on a timeline track
 */
interface EvidenceMarkersProps {
  markers: EvidenceMarkerType[];
  timelineLength: number; // total events in timeline
  onSeekToEvent: (eventId: string, sequenceNumber: number) => void;
  activeEventId?: string;
  className?: string;
}

export function EvidenceMarkers({
  markers,
  timelineLength,
  onSeekToEvent,
  activeEventId,
  className,
}: EvidenceMarkersProps) {
  if (markers.length === 0) return null;

  // Calculate position for each marker based on sequence number
  const getPosition = (sequenceNumber: number) => {
    return (sequenceNumber / Math.max(timelineLength, 1)) * 100;
  };

  return (
    <div className={cn("relative h-full", className)}>
      {markers.map((marker) => (
        <EvidenceMarker
          key={marker.id}
          marker={marker}
          position={getPosition(marker.sequenceNumber)}
          onClick={() => onSeekToEvent(marker.eventId, marker.sequenceNumber)}
          isActive={activeEventId === marker.eventId}
        />
      ))}
    </div>
  );
}

/**
 * Evidence Timeline Legend
 * Shows color coding for each dimension
 */
export function EvidenceTimelineLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 text-xs", className)}>
      {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
        const colors = DIMENSION_COLORS[key as keyof typeof DIMENSION_COLORS];
        const Icon = DIMENSION_ICONS[key as keyof typeof DIMENSION_ICONS];
        return (
          <div key={key} className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", colors.bg)} />
            <Icon className={cn("h-3 w-3", colors.text)} />
            <span className="text-text-tertiary">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export { DIMENSION_COLORS, DIMENSION_ICONS, DIMENSION_LABELS };
