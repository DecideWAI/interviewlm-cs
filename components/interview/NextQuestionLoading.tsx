"use client";

import React from "react";
import { TrendingUp, Zap, Clock, CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NextQuestionLoadingProps {
  previousScore?: number;
  previousTime?: number; // in seconds
  nextDifficulty: "easy" | "medium" | "hard";
  nextQuestionNumber: number;
  className?: string;
}

export function NextQuestionLoading({
  previousScore,
  previousTime,
  nextDifficulty,
  nextQuestionNumber,
  className,
}: NextQuestionLoadingProps) {
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

  const getPerformanceFeedback = (score?: number) => {
    if (!score) return null;
    if (score >= 90) return { icon: "🎉", text: "Outstanding performance!" };
    if (score >= 80) return { icon: "🌟", text: "Great job!" };
    if (score >= 70) return { icon: "👍", text: "Good work!" };
    return { icon: "💪", text: "Keep going!" };
  };

  const feedback = getPerformanceFeedback(previousScore);

  return (
    <div
      className={cn(
        "fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in",
        className
      )}
    >
      <div className="max-w-md w-full mx-4">
        <div className="bg-background-secondary border border-border rounded-lg p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <Spinner className="mx-auto mb-4" size="lg" />
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Generating Question {nextQuestionNumber}
            </h2>
            <p className="text-text-secondary">
              Preparing your next challenge...
            </p>
          </div>

          {/* Previous Performance Summary */}
          {(previousScore !== undefined || previousTime !== undefined) && (
            <div className="mb-6 p-4 bg-background-tertiary rounded-lg border border-border">
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Previous Question Summary
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {previousScore !== undefined && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-text-tertiary" />
                      <span className="text-xs text-text-tertiary">Score</span>
                    </div>
                    <span className="text-lg font-bold text-text-primary">
                      {previousScore}
                      <span className="text-sm text-text-tertiary">/100</span>
                    </span>
                  </div>
                )}

                {previousTime !== undefined && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-text-tertiary" />
                      <span className="text-xs text-text-tertiary">Time</span>
                    </div>
                    <span className="text-lg font-bold text-text-primary font-mono">
                      {formatTime(previousTime)}
                    </span>
                  </div>
                )}
              </div>

              {feedback && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm text-text-secondary">
                    {feedback.icon} {feedback.text}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Next Difficulty Info */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-text-primary">
                  Next Difficulty
                </span>
              </div>
              <Badge variant={getDifficultyColor(nextDifficulty)} className="capitalize">
                {nextDifficulty}
              </Badge>
            </div>

            <p className="text-xs text-text-tertiary mt-2">
              {nextDifficulty === "hard" && previousScore && previousScore >= 80 ? (
                "Based on your strong performance, we're increasing the challenge!"
              ) : nextDifficulty === "easy" && previousScore && previousScore < 60 ? (
                "We've adjusted the difficulty to help you build confidence."
              ) : (
                "Difficulty selected based on your performance."
              )}
            </p>
          </div>

          {/* Loading Progress */}
          <div className="mt-6">
            <div className="h-1 bg-background-tertiary rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: "60%" }} />
            </div>
            <p className="text-xs text-text-tertiary text-center mt-2">
              This should take just a moment...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
