"use client";

import React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Code2,
  Shield,
  Zap,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EvaluationCriterion {
  name: string;
  score: number;
  maxScore: number;
  feedback: string;
  icon: React.ReactNode;
}

export interface EvaluationResult {
  overallScore: number;
  passed: boolean;
  criteria: {
    problemCompletion: { score: number; maxScore: number; feedback: string };
    codeQuality: { score: number; maxScore: number; feedback: string };
    bestPractices: { score: number; maxScore: number; feedback: string };
    errorHandling: { score: number; maxScore: number; feedback: string };
    efficiency: { score: number; maxScore: number; feedback: string };
  };
  feedback: string;
  strengths: string[];
  improvements: string[];
}

interface EvaluationPanelProps {
  evaluationResult: EvaluationResult | null;
  isEvaluating: boolean;
  onEvaluate: () => void;
  onProceed: () => void;
  isLastQuestion: boolean;
  passingThreshold: number;
  className?: string;
}

export function EvaluationPanel({
  evaluationResult,
  isEvaluating,
  onEvaluate,
  onProceed,
  isLastQuestion,
  passingThreshold,
  className,
}: EvaluationPanelProps) {
  const canProceed = evaluationResult?.passed ?? false;

  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return "text-success";
    if (percentage >= 60) return "text-warning";
    return "text-error";
  };

  const getScoreBarColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return "bg-success";
    if (percentage >= 60) return "bg-warning";
    return "bg-error";
  };

  const criteriaConfig = [
    {
      key: "problemCompletion",
      name: "Problem Completion",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      key: "codeQuality",
      name: "Code Quality",
      icon: <Code2 className="h-4 w-4" />,
    },
    {
      key: "bestPractices",
      name: "Best Practices",
      icon: <FileCode className="h-4 w-4" />,
    },
    {
      key: "errorHandling",
      name: "Error Handling",
      icon: <Shield className="h-4 w-4" />,
    },
    {
      key: "efficiency",
      name: "Efficiency",
      icon: <Zap className="h-4 w-4" />,
    },
  ];

  // Empty state - no evaluation yet
  if (!evaluationResult && !isEvaluating) {
    return (
      <div className={cn("h-full flex flex-col", className)}>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Ready to Evaluate
          </h3>
          <p className="text-sm text-text-secondary mb-6 max-w-xs">
            Click &quot;Evaluate&quot; to get AI-powered feedback on your solution&apos;s
            quality, completeness, and best practices.
          </p>
          <Button onClick={onEvaluate} disabled={isEvaluating}>
            <Sparkles className="h-4 w-4 mr-2" />
            Evaluate Solution
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isEvaluating) {
    return (
      <div className={cn("h-full flex flex-col", className)}>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Evaluating...
          </h3>
          <p className="text-sm text-text-secondary max-w-xs">
            AI is analyzing your code for quality, completeness, and best
            practices.
          </p>
        </div>
      </div>
    );
  }

  // Results state
  return (
    <div className={cn("h-full flex flex-col overflow-hidden", className)}>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Overall Score */}
        <div
          className={cn(
            "rounded-lg p-4 border",
            evaluationResult.passed
              ? "bg-success/5 border-success/20"
              : "bg-warning/5 border-warning/20"
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {evaluationResult.passed ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-warning" />
              )}
              <span className="text-sm font-medium text-text-primary">
                Overall Score
              </span>
            </div>
            <span
              className={cn(
                "text-2xl font-bold",
                evaluationResult.passed ? "text-success" : "text-warning"
              )}
            >
              {evaluationResult.overallScore}
              <span className="text-sm text-text-tertiary">/100</span>
            </span>
          </div>

          {/* Score bar */}
          <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                evaluationResult.passed ? "bg-success" : "bg-warning"
              )}
              style={{ width: `${evaluationResult.overallScore}%` }}
            />
          </div>

          <p className="text-xs text-text-tertiary mt-2">
            {evaluationResult.passed
              ? `Passed! Score meets the ${passingThreshold}% threshold.`
              : `Need ${passingThreshold}% to proceed. Keep improving!`}
          </p>
        </div>

        {/* Criteria Breakdown */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-text-tertiary" />
            Criteria Breakdown
          </h4>

          <div className="space-y-2">
            {criteriaConfig.map(({ key, name, icon }) => {
              const criterion =
                evaluationResult.criteria[
                  key as keyof typeof evaluationResult.criteria
                ];
              const isPassing =
                (criterion.score / criterion.maxScore) * 100 >= 60;

              return (
                <div
                  key={key}
                  className="bg-background-secondary rounded-lg p-3 border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "p-1 rounded",
                          isPassing
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        )}
                      >
                        {icon}
                      </span>
                      <span className="text-sm text-text-primary">{name}</span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        getScoreColor(criterion.score, criterion.maxScore)
                      )}
                    >
                      {criterion.score}/{criterion.maxScore}
                    </span>
                  </div>

                  {/* Mini score bar */}
                  <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden mb-2">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        getScoreBarColor(criterion.score, criterion.maxScore)
                      )}
                      style={{
                        width: `${(criterion.score / criterion.maxScore) * 100}%`,
                      }}
                    />
                  </div>

                  {criterion.feedback && (
                    <p className="text-xs text-text-tertiary">
                      {criterion.feedback}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Overall Feedback */}
        {evaluationResult.feedback && (
          <div className="bg-background-secondary rounded-lg p-4 border border-border">
            <h4 className="text-sm font-medium text-text-primary mb-2">
              Feedback
            </h4>
            <p className="text-sm text-text-secondary">
              {evaluationResult.feedback}
            </p>
          </div>
        )}

        {/* Strengths */}
        {evaluationResult.strengths.length > 0 && (
          <div className="bg-success/5 rounded-lg p-4 border border-success/20">
            <h4 className="text-sm font-medium text-success mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Strengths
            </h4>
            <ul className="space-y-1">
              {evaluationResult.strengths.map((strength, i) => (
                <li
                  key={i}
                  className="text-sm text-text-secondary flex items-start gap-2"
                >
                  <span className="text-success mt-1">•</span>
                  {strength}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvements */}
        {evaluationResult.improvements.length > 0 && (
          <div className="bg-warning/5 rounded-lg p-4 border border-warning/20">
            <h4 className="text-sm font-medium text-warning mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Areas for Improvement
            </h4>
            <ul className="space-y-1">
              {evaluationResult.improvements.map((improvement, i) => (
                <li
                  key={i}
                  className="text-sm text-text-secondary flex items-start gap-2"
                >
                  <span className="text-warning mt-1">•</span>
                  {improvement}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Fixed bottom action */}
      <div className="p-4 border-t border-border bg-background-secondary">
        {canProceed ? (
          <Button onClick={onProceed} className="w-full" size="lg">
            {isLastQuestion ? "Submit Assessment" : "Continue to Next Question"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={onEvaluate}
              variant="outline"
              className="w-full"
              disabled={isEvaluating}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-evaluate After Changes
            </Button>
            <p className="text-xs text-text-tertiary text-center">
              Improve your solution based on the feedback above
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
