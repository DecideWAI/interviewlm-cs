"use client";

import React from "react";
import { Play, Pause, SkipForward, SkipBack, FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlaybackSpeed } from "./types";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  speed: PlaybackSpeed;
  skipIdleTime: boolean;
  onPlayPause: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onSkipIdleToggle: () => void;
  onNextMoment: () => void;
  onPrevMoment: () => void;
  className?: string;
}

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  totalDuration,
  speed,
  skipIdleTime,
  onPlayPause,
  onSpeedChange,
  onSkipIdleToggle,
  onNextMoment,
  onPrevMoment,
  className,
}: PlaybackControlsProps) {
  return (
    <div className={cn(
      "flex items-center justify-between bg-background-secondary border-t border-border p-4",
      className
    )}>
      {/* Left: Main Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevMoment}
          title="Previous key moment"
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button
          variant="primary"
          size="icon"
          onClick={onPlayPause}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onNextMoment}
          title="Next key moment"
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <div className="ml-4 text-sm text-text-secondary font-mono">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>
      </div>

      {/* Center: Speed Controls */}
      <div className="flex items-center gap-2">
        <FastForward className="h-4 w-4 text-text-tertiary" />
        <span className="text-xs text-text-tertiary">Speed:</span>
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors",
                speed === s
                  ? "bg-primary text-white"
                  : "bg-background-tertiary text-text-secondary hover:bg-background-hover"
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Right: Options */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSkipIdleToggle}
          className={cn(
            "px-3 py-1.5 text-xs rounded border transition-colors",
            skipIdleTime
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-background-tertiary border-border text-text-secondary hover:bg-background-hover"
          )}
        >
          Skip Idle Time
        </button>
        <Badge variant="info" className="ml-2">
          Replay Mode
        </Badge>
      </div>
    </div>
  );
}
