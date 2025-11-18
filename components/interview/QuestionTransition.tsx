"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Clock,
  CheckCircle2,
  Target,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface QuestionPerformance {
  questionNumber: number;
  title: string;
  rawScore: number; // 0-100
  weightedScore?: number; // With difficulty calibration
  timeSpent: number; // in seconds
  testsPassedRatio: number; // 0-1
  difficultyScore?: number; // 1-10 from LLM assessment
}

interface QuestionTransitionProps {
  previousPerformance: QuestionPerformance;
  nextQuestionNumber: number;
  progressionContext?: {
    trend: "improving" | "declining" | "stable";
    action: "extend" | "maintain" | "simplify";
    averageScore: number;
  };
  estimatedDifficulty?: "easier" | "similar" | "harder";
  buildingOn?: string; // Short description of what next question builds on
  className?: string;
}

export function QuestionTransition({
  previousPerformance,
  nextQuestionNumber,
  progressionContext,
  estimatedDifficulty = "similar",
  buildingOn,
  className,
}: QuestionTransitionProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getPerformanceFeedback = (score: number) => {
    if (score >= 90) return { icon: "🎉", text: "Outstanding!", color: "text-success" };
    if (score >= 80) return { icon: "🌟", text: "Excellent work!", color: "text-success" };
    if (score >= 70) return { icon: "👍", text: "Great job!", color: "text-success" };
    if (score >= 60) return { icon: "✓", text: "Good effort!", color: "text-warning" };
    return { icon: "💪", text: "Keep pushing!", color: "text-warning" };
  };

  const getTrendIcon = () => {
    if (!progressionContext) return <Minus className="h-4 w-4 text-text-tertiary" />;
    switch (progressionContext.trend) {
      case "improving":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "declining":
        return <TrendingDown className="h-4 w-4 text-warning" />;
      default:
        return <Minus className="h-4 w-4 text-text-tertiary" />;
    }
  };

  const getTrendText = () => {
    if (!progressionContext) return "Analyzing performance...";
    switch (progressionContext.trend) {
      case "improving":
        return "Your performance is improving!";
      case "declining":
        return "Let's refocus and build on the fundamentals";
      default:
        return "Maintaining consistent performance";
    }
  };

  const getProgressionMessage = () => {
    if (!progressionContext) return "Preparing next challenge...";

    switch (progressionContext.action) {
      case "extend":
        return "Based on your strong performance, we're adding complexity to test advanced skills.";
      case "simplify":
        return "Let's focus on building a solid foundation with clearer guidance.";
      default:
        return "Continuing with similar complexity to reinforce concepts.";
    }
  };

  const getDifficultyBadge = () => {
    switch (estimatedDifficulty) {
      case "harder":
        return <Badge variant="error">More Challenging</Badge>;
      case "easier":
        return <Badge variant="success">More Supportive</Badge>;
      default:
        return <Badge variant="warning">Similar Level</Badge>;
    }
  };

  const feedback = getPerformanceFeedback(previousPerformance.rawScore);

  return (
    <div
      className={cn(
        "fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in",
        className
      )}
    >
      <div className="max-w-2xl w-full mx-4">
        <div className="bg-background-secondary border border-border rounded-lg p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Generating Question {nextQuestionNumber}
            </h2>
            <p className="text-text-secondary">
              Analyzing your progress and adapting the next challenge...
            </p>
          </div>

          {/* Previous Performance Summary */}
          <div className="mb-6 p-5 bg-background-tertiary rounded-lg border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Question {previousPerformance.questionNumber}: {previousPerformance.title}
              </h3>
              <span className={cn("text-xs font-medium", feedback.color)}>
                {feedback.icon} {feedback.text}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Raw Score */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <Target className="h-3 w-3 text-text-tertiary" />
                  <span className="text-xs text-text-tertiary">Score</span>
                </div>
                <span className={cn("text-2xl font-bold", feedback.color)}>
                  {previousPerformance.rawScore}
                  <span className="text-sm text-text-tertiary">/100</span>
                </span>
              </div>

              {/* Time Spent */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-text-tertiary" />
                  <span className="text-xs text-text-tertiary">Time</span>
                </div>
                <span className="text-2xl font-bold text-text-primary font-mono">
                  {formatTime(previousPerformance.timeSpent)}
                </span>
              </div>

              {/* Tests Passed */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-text-tertiary" />
                  <span className="text-xs text-text-tertiary">Tests</span>
                </div>
                <span className="text-2xl font-bold text-success">
                  {Math.round(previousPerformance.testsPassedRatio * 100)}%
                </span>
              </div>
            </div>

            {/* Weighted Score (if available) */}
            {previousPerformance.weightedScore !== undefined && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-tertiary">
                    Difficulty-calibrated score:
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {previousPerformance.weightedScore.toFixed(1)} points
                    {previousPerformance.difficultyScore && (
                      <span className="text-xs text-text-tertiary ml-2">
                        (complexity: {previousPerformance.difficultyScore}/10)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Progress Trend (if available) */}
          {progressionContext && (
            <div className="mb-6 p-4 bg-background-hover rounded-lg border border-border-secondary">
              <div className="flex items-center gap-3 mb-2">
                {getTrendIcon()}
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">
                    {getTrendText()}
                  </h4>
                  <p className="text-xs text-text-tertiary mt-1">
                    Overall average: {progressionContext.averageScore.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Next Question Preview */}
          <div className="p-5 bg-primary/5 border border-primary/20 rounded-lg mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-text-primary">
                  What's Next
                </span>
              </div>
              {getDifficultyBadge()}
            </div>

            <p className="text-sm text-text-secondary mb-3">
              {getProgressionMessage()}
            </p>

            {buildingOn && (
              <div className="flex items-start gap-2 p-3 bg-background-tertiary rounded border border-border">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-text-tertiary mb-1">Building on:</p>
                  <p className="text-sm text-text-primary font-medium">{buildingOn}</p>
                </div>
              </div>
            )}
          </div>

          {/* Loading Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3">
              <Spinner size="sm" />
              <span className="text-sm text-text-secondary">
                Generating adaptive question...
              </span>
            </div>

            <div className="h-1 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-hover animate-shimmer"
                style={{ width: "75%", animationDuration: "2s" }}
              />
            </div>

            <p className="text-xs text-text-tertiary text-center">
              Using AI to tailor the next challenge to your skill level
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
