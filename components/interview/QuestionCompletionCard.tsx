"use client";

import React from "react";
import { CheckCircle2, Clock, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuestionCompletionCardProps {
  testsPassed: number;
  testsTotal: number;
  timeSpent: number; // in seconds
  score?: number;
  onNext: () => void;
  isLastQuestion?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function QuestionCompletionCard({
  testsPassed,
  testsTotal,
  timeSpent,
  score,
  onNext,
  isLastQuestion = false,
  isLoading = false,
  className,
}: QuestionCompletionCardProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getScoreColor = (s: number) => {
    if (s >= 90) return "text-success";
    if (s >= 70) return "text-warning";
    return "text-error";
  };

  return (
    <div
      className={cn(
        "border-2 border-success/20 bg-success/5 rounded-lg p-6 animate-slide-up",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-success/10">
          <CheckCircle2 className="h-6 w-6 text-success" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {isLastQuestion ? "Final Question Complete!" : "Question Complete!"}
          </h3>
          <p className="text-sm text-text-secondary">
            {isLastQuestion ? "Ready to submit your assessment" : "Ready for the next challenge"}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Tests Passed */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-xs text-text-tertiary">Tests</span>
          </div>
          <span className="text-xl font-bold text-success">
            {testsPassed}/{testsTotal}
          </span>
        </div>

        {/* Time Spent */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-text-tertiary" />
            <span className="text-xs text-text-tertiary">Time</span>
          </div>
          <span className="text-xl font-bold text-text-primary font-mono">
            {formatTime(timeSpent)}
          </span>
        </div>

        {/* Score */}
        {score !== undefined && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-text-tertiary" />
              <span className="text-xs text-text-tertiary">Score</span>
            </div>
            <span className={cn("text-xl font-bold", getScoreColor(score))}>
              {score}
              <span className="text-sm text-text-tertiary">/100</span>
            </span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <Button
        onClick={onNext}
        disabled={isLoading}
        loading={isLoading}
        className="w-full"
        size="lg"
      >
        {isLoading ? (
          "Loading..."
        ) : isLastQuestion ? (
          <>
            Submit Assessment
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        ) : (
          <>
            Next Question
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>

      {isLastQuestion && (
        <p className="text-xs text-text-tertiary text-center mt-3">
          You can review your work before submitting
        </p>
      )}
    </div>
  );
}
