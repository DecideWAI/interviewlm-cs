"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  MessageSquare,
  Target,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CandidateProfile {
  name: string;
  avatar: string;
  rawScore: number;
  aiScore: number;
  aiDimensions: {
    promptQuality: number;
    strategicUsage: number;
    criticalThinking: number;
    independence: number;
  };
  recommendation: "Strong Hire" | "Hire" | "Maybe" | "No Hire";
  reasoning: string;
  highlight: string;
}

const candidateA: CandidateProfile = {
  name: "Candidate A",
  avatar: "A",
  rawScore: 75,
  aiScore: 85,
  aiDimensions: {
    promptQuality: 88,
    strategicUsage: 82,
    criticalThinking: 85,
    independence: 84,
  },
  recommendation: "Strong Hire",
  reasoning: "Excellent AI collaboration suggests 3x faster onboarding and high productivity with modern tools.",
  highlight: "Uses AI strategically for complex tasks, reviews suggestions critically",
};

const candidateB: CandidateProfile = {
  name: "Candidate B",
  avatar: "B",
  rawScore: 75,
  aiScore: 40,
  aiDimensions: {
    promptQuality: 35,
    strategicUsage: 30,
    criticalThinking: 45,
    independence: 50,
  },
  recommendation: "Maybe",
  reasoning: "Under-utilizes AI tools despite availability. May struggle with modern AI-augmented workflows.",
  highlight: "Rarely uses AI, relies on manual debugging",
};

export function AIScoreComparisonDemo({ className = "" }: { className?: string }) {
  const [activeCandidate, setActiveCandidate] = useState<"A" | "B" | null>(null);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-info";
    if (score >= 40) return "text-warning";
    return "text-error";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-success/10 border-success/20";
    if (score >= 60) return "bg-info/10 border-info/20";
    if (score >= 40) return "bg-warning/10 border-warning/20";
    return "bg-error/10 border-error/20";
  };

  const getRecommendationStyle = (rec: CandidateProfile["recommendation"]) => {
    switch (rec) {
      case "Strong Hire":
        return { bg: "bg-success/10", text: "text-success", icon: ThumbsUp };
      case "Hire":
        return { bg: "bg-info/10", text: "text-info", icon: ThumbsUp };
      case "Maybe":
        return { bg: "bg-warning/10", text: "text-warning", icon: AlertTriangle };
      case "No Hire":
        return { bg: "bg-error/10", text: "text-error", icon: ThumbsDown };
    }
  };

  const renderCandidateCard = (candidate: CandidateProfile, isLeft: boolean) => {
    const recStyle = getRecommendationStyle(candidate.recommendation);
    const RecIcon = recStyle.icon;
    const isActive = activeCandidate === candidate.avatar;

    return (
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300 cursor-pointer border-2",
          isActive
            ? "border-primary shadow-lg shadow-primary/10"
            : "border-border hover:border-border-secondary"
        )}
        onClick={() => setActiveCandidate(isActive ? null : (candidate.avatar as "A" | "B"))}
      >
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-background-tertiary flex items-center justify-center text-xl font-bold text-text-primary">
              {candidate.avatar}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary">{candidate.name}</h3>
              <p className="text-sm text-text-tertiary">{candidate.highlight}</p>
            </div>
          </div>

          {/* Scores Comparison */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-4 rounded-lg bg-background-secondary">
              <p className="text-sm text-text-tertiary mb-1">Raw Score</p>
              <p className="text-3xl font-bold text-text-primary">{candidate.rawScore}</p>
              <p className="text-xs text-text-tertiary">Same as {isLeft ? "B" : "A"}</p>
            </div>
            <div className={cn("text-center p-4 rounded-lg border", getScoreBg(candidate.aiScore))}>
              <p className="text-sm text-text-tertiary mb-1 flex items-center justify-center gap-1">
                <Brain className="h-3 w-3" />
                AI Score
              </p>
              <p className={cn("text-3xl font-bold", getScoreColor(candidate.aiScore))}>
                {candidate.aiScore}
              </p>
              <p className="text-xs text-text-tertiary">
                {candidate.aiScore > 70 ? "Above Average" : "Below Average"}
              </p>
            </div>
          </div>

          {/* AI Dimensions */}
          <div className="space-y-3 mb-6">
            {[
              { key: "promptQuality", label: "Prompt Quality", icon: MessageSquare },
              { key: "strategicUsage", label: "Strategic Usage", icon: Target },
              { key: "criticalThinking", label: "Critical Thinking", icon: CheckCircle2 },
              { key: "independence", label: "Independence", icon: TrendingUp },
            ].map(({ key, label, icon: Icon }) => {
              const score = candidate.aiDimensions[key as keyof typeof candidate.aiDimensions];
              return (
                <div key={key} className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-text-tertiary" />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">{label}</span>
                      <span className={getScoreColor(score)}>{score}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-background-tertiary overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          score >= 80 ? "bg-success" :
                          score >= 60 ? "bg-info" :
                          score >= 40 ? "bg-warning" : "bg-error"
                        )}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommendation */}
          <div className={cn("p-4 rounded-lg", recStyle.bg)}>
            <div className="flex items-center gap-2 mb-2">
              <RecIcon className={cn("h-5 w-5", recStyle.text)} />
              <span className={cn("font-semibold", recStyle.text)}>
                {candidate.recommendation}
              </span>
            </div>
            <p className="text-sm text-text-secondary">{candidate.reasoning}</p>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={cn("py-8", className)}>
      {/* Header */}
      <div className="text-center mb-8">
        <Badge variant="primary" className="mb-4">
          <Sparkles className="h-3 w-3 mr-1" />
          Same Raw Score, Different Outcomes
        </Badge>
        <h3 className="text-2xl font-bold text-text-primary mb-2">
          Why AI Collaboration Scoring Matters
        </h3>
        <p className="text-text-secondary max-w-2xl mx-auto">
          Two candidates with identical raw scores of 75/100 receive different hiring
          recommendations based on their AI collaboration skills.
        </p>
      </div>

      {/* Comparison */}
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {renderCandidateCard(candidateA, true)}
        {renderCandidateCard(candidateB, false)}
      </div>

      {/* Insight Footer */}
      <div className="mt-8 text-center">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-background-secondary border border-border">
          <Brain className="h-5 w-5 text-primary" />
          <span className="text-sm text-text-secondary">
            AI collaboration scoring reveals hidden hiring signals traditional assessments miss
          </span>
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact metric card for the landing page feature grid
 */
export function AIMetricCard({
  title,
  icon: Icon,
  description,
  example,
  className = "",
}: {
  title: string;
  icon: React.ElementType;
  description: string;
  example?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "p-6 rounded-xl bg-background-secondary border border-border hover:border-primary/30 transition-all",
        className
      )}
    >
      <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h4 className="font-semibold text-text-primary mb-2">{title}</h4>
      <p className="text-sm text-text-secondary mb-3">{description}</p>
      {example && (
        <p className="text-xs text-text-tertiary italic border-l-2 border-primary/30 pl-3">
          {example}
        </p>
      )}
    </div>
  );
}
