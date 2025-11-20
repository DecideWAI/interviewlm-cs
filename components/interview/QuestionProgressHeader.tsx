"use client";

import React from "react";
import { Clock, Target, ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuestionProgressHeaderProps {
  currentQuestion: number;
  totalQuestions: number;
  difficulty: "easy" | "medium" | "hard";
  timeElapsed: number; // in seconds
  estimatedTime?: number; // in minutes
  title: string;
  className?: string;
  // NEW: Incremental assessment context
  isIncremental?: boolean;
  buildingOn?: string; // What this question builds on from previous work
  difficultyCalibrated?: boolean; // Whether this uses LLM difficulty calibration
}

export function QuestionProgressHeader({
  currentQuestion,
  totalQuestions,
  difficulty,
  timeElapsed,
  estimatedTime,
  title,
  className,
  isIncremental = false,
  buildingOn,
  difficultyCalibrated = false,
}: QuestionProgressHeaderProps) {
  const progressPercentage = (currentQuestion / totalQuestions) * 100;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case "easy":
        return "success";
      case "medium":
        return "warning";
      case "hard":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <div className={cn("border-b border-border bg-background-secondary", className)}>
      {/* Main Header */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <Target className="h-4 w-4" />
              <span className="font-medium">
                Question {currentQuestion} of {totalQuestions}
              </span>
            </div>
            <Badge variant={getDifficultyColor(difficulty)} className="capitalize">
              {difficulty}
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            {/* Time Elapsed */}
            <div className="flex items-center gap-2 text-sm">
              <Clock className={cn(
                "h-4 w-4",
                estimatedTime && timeElapsed > estimatedTime * 60 ? "text-warning" : "text-text-tertiary"
              )} />
              <span className={cn(
                "font-mono",
                estimatedTime && timeElapsed > estimatedTime * 60 ? "text-warning" : "text-text-secondary"
              )}>
                {formatTime(timeElapsed)}
                {estimatedTime && (
                  <span className="text-text-tertiary"> / {estimatedTime}min</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Question Title */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xl font-semibold text-text-primary">
              {title}
            </h2>
            {isIncremental && (
              <Badge variant="primary" className="text-xs flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Adaptive
              </Badge>
            )}
            {difficultyCalibrated && (
              <Badge variant="default" className="text-xs">
                AI-Calibrated
              </Badge>
            )}
          </div>

          {/* Incremental Context */}
          {isIncremental && buildingOn && currentQuestion > 1 && (
            <div className="flex items-start gap-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs">
              <ArrowRight className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-text-tertiary">Building on: </span>
                <span className="text-text-primary font-medium">{buildingOn}</span>
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="relative">
          <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-hover transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="absolute -top-1 right-0 text-xs text-text-tertiary font-medium">
            {Math.round(progressPercentage)}%
          </div>
        </div>
      </div>
    </div>
  );
}
