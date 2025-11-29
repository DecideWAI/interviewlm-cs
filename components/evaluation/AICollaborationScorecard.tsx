"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  Target,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Brain,
  Zap,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Prompt example with quality annotation
 */
export interface PromptExample {
  prompt: string;
  quality: "excellent" | "good" | "fair" | "poor";
  feedback: string;
  timestamp?: string;
}

/**
 * AI Collaboration scores across 4 dimensions
 */
export interface AICollaborationScores {
  promptQuality: {
    score: number; // 0-100
    examples: PromptExample[];
  };
  strategicUsage: {
    score: number;
    interactionCount: number;
    optimal: string; // e.g., "8-15 interactions"
  };
  criticalThinking: {
    score: number;
    acceptanceRate: number; // 0-100
    modifications: number;
  };
  independence: {
    score: number;
    trend: "improving" | "stable" | "declining";
  };
}

interface AICollaborationScorecardProps {
  scores: AICollaborationScores;
  overallScore: number;
  percentile?: number;
  seniorityLevel?: string;
  className?: string;
}

export function AICollaborationScorecard({
  scores,
  overallScore,
  percentile,
  seniorityLevel,
  className = "",
}: AICollaborationScorecardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-info";
    if (score >= 40) return "text-warning";
    return "text-error";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-success/10";
    if (score >= 60) return "bg-info/10";
    if (score >= 40) return "bg-warning/10";
    return "bg-error/10";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-success";
    if (score >= 60) return "bg-info";
    if (score >= 40) return "bg-warning";
    return "bg-error";
  };

  const getTrendIcon = (trend: "improving" | "stable" | "declining") => {
    switch (trend) {
      case "improving":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "declining":
        return <TrendingDown className="h-4 w-4 text-error" />;
      default:
        return <Minus className="h-4 w-4 text-text-tertiary" />;
    }
  };

  const getQualityBadge = (quality: PromptExample["quality"]) => {
    const variants: Record<typeof quality, { color: string; label: string }> = {
      excellent: { color: "bg-success/10 text-success border-success/20", label: "Excellent" },
      good: { color: "bg-info/10 text-info border-info/20", label: "Good" },
      fair: { color: "bg-warning/10 text-warning border-warning/20", label: "Fair" },
      poor: { color: "bg-error/10 text-error border-error/20", label: "Poor" },
    };
    return variants[quality];
  };

  const dimensions = [
    {
      key: "promptQuality",
      label: "Prompt Quality",
      icon: MessageSquare,
      score: scores.promptQuality.score,
      description: "Specific, contextual prompts vs vague requests",
      detail: `${scores.promptQuality.examples.length} prompts analyzed`,
    },
    {
      key: "strategicUsage",
      label: "Strategic Usage",
      icon: Target,
      score: scores.strategicUsage.score,
      description: "When to use AI vs solve independently",
      detail: `${scores.strategicUsage.interactionCount} interactions (optimal: ${scores.strategicUsage.optimal})`,
    },
    {
      key: "criticalThinking",
      label: "Critical Evaluation",
      icon: CheckCircle2,
      score: scores.criticalThinking.score,
      description: "Review and modify vs blindly accept",
      detail: `${scores.criticalThinking.acceptanceRate}% accepted, ${scores.criticalThinking.modifications} modifications`,
    },
    {
      key: "independence",
      label: "Independence Trend",
      icon: TrendingUp,
      score: scores.independence.score,
      description: "Decreasing reliance over time",
      detail: scores.independence.trend,
      trend: scores.independence.trend,
    },
  ];

  return (
    <Card className={cn("border-border-secondary", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                AI Collaboration Score
                <Badge variant="primary" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Industry First
                </Badge>
              </CardTitle>
              <p className="text-sm text-text-tertiary">
                How effectively the candidate uses AI tools
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {percentile && (
              <div className="text-right">
                <p className="text-sm text-text-tertiary">Percentile</p>
                <p className="text-lg font-semibold text-primary">{percentile}%</p>
              </div>
            )}
            <div className={cn("px-4 py-2 rounded-xl", getScoreBg(overallScore))}>
              <p className={cn("text-3xl font-bold", getScoreColor(overallScore))}>
                {overallScore}
              </p>
              <p className="text-xs text-text-tertiary text-center">/100</p>
            </div>
          </div>
        </div>

        {seniorityLevel && (
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="default" className="text-xs">
              {seniorityLevel} expectations
            </Badge>
            {overallScore >= 70 && (
              <Badge variant="success" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                AI-Ready
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Dimension Scores */}
        <div className="grid gap-3">
          {dimensions.map((dim) => {
            const Icon = dim.icon;
            return (
              <div
                key={dim.key}
                className="flex items-center gap-4 p-3 rounded-lg bg-background-secondary hover:bg-background-tertiary transition-colors"
              >
                <div className="p-2 rounded-lg bg-background-tertiary">
                  <Icon className="h-4 w-4 text-text-secondary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-text-primary">{dim.label}</p>
                    <div className="flex items-center gap-2">
                      {dim.trend && getTrendIcon(dim.trend as any)}
                      <span className={cn("text-sm font-semibold", getScoreColor(dim.score))}>
                        {dim.score}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-background-tertiary overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", getProgressColor(dim.score))}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">{dim.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expand/Collapse for Details */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show Prompt Examples & Insights
            </>
          )}
        </button>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t border-border">
            {/* Prompt Examples */}
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Prompt Quality Examples
              </h4>
              <div className="space-y-3">
                {scores.promptQuality.examples.slice(0, 3).map((example, idx) => {
                  const badge = getQualityBadge(example.quality);
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-background-secondary border border-border"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm text-text-primary font-mono flex-1">
                          &quot;{example.prompt.slice(0, 100)}
                          {example.prompt.length > 100 ? "..." : ""}&quot;
                        </p>
                        <Badge className={cn("text-xs border", badge.color)}>
                          {badge.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-tertiary">{example.feedback}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Usage Pattern Insight */}
            <div className="p-3 rounded-lg bg-background-secondary border border-border">
              <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Usage Pattern Analysis
              </h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-text-primary">
                    {scores.strategicUsage.interactionCount}
                  </p>
                  <p className="text-xs text-text-tertiary">Total Interactions</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">
                    {scores.criticalThinking.acceptanceRate}%
                  </p>
                  <p className="text-xs text-text-tertiary">Acceptance Rate</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">
                    {scores.criticalThinking.modifications}
                  </p>
                  <p className="text-xs text-text-tertiary">Modifications Made</p>
                </div>
              </div>
            </div>

            {/* Hiring Implication */}
            <div
              className={cn(
                "p-3 rounded-lg border",
                overallScore >= 70
                  ? "bg-success/5 border-success/20"
                  : overallScore >= 50
                  ? "bg-warning/5 border-warning/20"
                  : "bg-error/5 border-error/20"
              )}
            >
              <h4 className="text-sm font-medium text-text-primary mb-1 flex items-center gap-2">
                {overallScore >= 70 ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-warning" />
                )}
                Hiring Implication
              </h4>
              <p className="text-sm text-text-secondary">
                {overallScore >= 80
                  ? "Candidate demonstrates excellent AI collaboration skills. Expected to be highly productive with modern AI tools and likely to onboard 3x faster."
                  : overallScore >= 70
                  ? "Candidate shows good AI collaboration. Will benefit from AI tools and integrate well with AI-augmented workflows."
                  : overallScore >= 50
                  ? "Candidate has moderate AI collaboration skills. May need guidance on effective AI usage but can improve with training."
                  : "Candidate under-utilizes or misuses AI tools. Consider providing AI tooling training if hired."}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact version for inline display
 */
export function AICollaborationBadge({
  score,
  trend,
  className = "",
}: {
  score: number;
  trend?: "improving" | "stable" | "declining";
  className?: string;
}) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return "bg-success/10 text-success border-success/20";
    if (s >= 60) return "bg-info/10 text-info border-info/20";
    if (s >= 40) return "bg-warning/10 text-warning border-warning/20";
    return "bg-error/10 text-error border-error/20";
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Badge className={cn("border", getScoreColor(score))}>
        <Brain className="h-3 w-3 mr-1" />
        AI Score: {score}
      </Badge>
      {trend && (
        <span className="text-xs text-text-tertiary">
          {trend === "improving" && <TrendingUp className="h-3 w-3 inline text-success" />}
          {trend === "declining" && <TrendingDown className="h-3 w-3 inline text-error" />}
          {trend === "stable" && <Minus className="h-3 w-3 inline" />}
        </span>
      )}
    </div>
  );
}
