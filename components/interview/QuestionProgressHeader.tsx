"use client";

import React from "react";
import { Clock, Target } from "lucide-react";
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
}

export function QuestionProgressHeader({
  currentQuestion,
  totalQuestions,
  difficulty,
  timeElapsed,
  estimatedTime,
  title,
  className,
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
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          {title}
        </h2>

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
