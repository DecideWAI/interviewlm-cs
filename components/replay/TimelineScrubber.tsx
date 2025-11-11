"use client";

import React, { useRef, useState, useEffect } from "react";
import { CheckCircle2, XCircle, MessageSquare, Trophy, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KeyMoment } from "./types";

interface TimelineScrubberProps {
  currentTime: number;
  totalDuration: number;
  keyMoments: KeyMoment[];
  onSeek: (time: number) => void;
  isPlaying: boolean;
  className?: string;
}

const MOMENT_ICONS = {
  test_passed: CheckCircle2,
  test_failed: XCircle,
  error_fixed: CheckCircle2,
  ai_interaction: MessageSquare,
  milestone: Trophy,
};

const MOMENT_COLORS = {
  test_passed: "text-success",
  test_failed: "text-error",
  error_fixed: "text-success",
  ai_interaction: "text-primary",
  milestone: "text-warning",
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TimelineScrubber({
  currentTime,
  totalDuration,
  keyMoments,
  onSeek,
  isPlaying,
  className,
}: TimelineScrubberProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoveredMoment, setHoveredMoment] = useState<KeyMoment | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const progress = (currentTime / totalDuration) * 100;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleSeek(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * totalDuration;

    setHoverTime(time);

    if (isDragging) {
      onSeek(time);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoveredMoment(null);
  };

  const handleSeek = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * totalDuration;

    onSeek(time);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  return (
    <div className={cn("bg-background-secondary border-b border-border p-4", className)}>
      <div className="space-y-2">
        {/* Timeline Header */}
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span>Session Timeline</span>
          <span>{formatTime(totalDuration)}</span>
        </div>

        {/* Timeline Track */}
        <div
          ref={timelineRef}
          className="relative h-12 bg-background-tertiary rounded cursor-pointer group"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          {/* Progress Bar */}
          <div
            className="absolute top-0 left-0 h-full bg-primary/20 rounded transition-all"
            style={{ width: `${progress}%` }}
          />

          {/* Key Moments */}
          {keyMoments.map((moment) => {
            const position = ((new Date(moment.timestamp).getTime() - new Date(keyMoments[0].timestamp).getTime()) / (totalDuration * 1000)) * 100;
            const Icon = MOMENT_ICONS[moment.type] || AlertCircle;
            const colorClass = MOMENT_COLORS[moment.type] || "text-text-tertiary";

            return (
              <div
                key={moment.id}
                className="absolute top-0 bottom-0 flex items-center justify-center cursor-pointer"
                style={{ left: `${position}%` }}
                onMouseEnter={() => setHoveredMoment(moment)}
                onMouseLeave={() => setHoveredMoment(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  const momentTime = (new Date(moment.timestamp).getTime() - new Date(keyMoments[0].timestamp).getTime()) / 1000;
                  onSeek(momentTime);
                }}
              >
                <div className={cn(
                  "w-0.5 h-full bg-current opacity-40",
                  colorClass
                )} />
                <div className={cn(
                  "absolute -top-1 w-3 h-3 rounded-full border-2 border-background transition-transform hover:scale-125",
                  colorClass,
                  "bg-current"
                )} />
              </div>
            );
          })}

          {/* Current Position Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-glow transition-all"
            style={{ left: `${progress}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background shadow-lg" />
          </div>

          {/* Hover Indicator */}
          {hoverTime !== null && !isDragging && (
            <div
              className="absolute top-0 bottom-0 w-px bg-text-tertiary/50"
              style={{ left: `${(hoverTime / totalDuration) * 100}%` }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-background-secondary border border-border px-2 py-1 rounded text-xs text-text-primary whitespace-nowrap">
                {formatTime(hoverTime)}
              </div>
            </div>
          )}

          {/* Hover Tooltip for Moments */}
          {hoveredMoment && (
            <div
              className="absolute -top-16 left-1/2 -translate-x-1/2 bg-background-secondary border border-border px-3 py-2 rounded shadow-lg z-10 min-w-48"
              style={{
                left: `${((new Date(hoveredMoment.timestamp).getTime() - new Date(keyMoments[0].timestamp).getTime()) / (totalDuration * 1000)) * 100}%`
              }}
            >
              <div className="text-xs font-medium text-text-primary mb-1">
                {hoveredMoment.label}
              </div>
              {hoveredMoment.description && (
                <div className="text-xs text-text-secondary">
                  {hoveredMoment.description}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-success" />
            <span className="text-text-tertiary">Tests Passed</span>
          </div>
          <div className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-error" />
            <span className="text-text-tertiary">Tests Failed</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3 text-primary" />
            <span className="text-text-tertiary">AI Interaction</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy className="h-3 w-3 text-warning" />
            <span className="text-text-tertiary">Milestone</span>
          </div>
        </div>
      </div>
    </div>
  );
}
