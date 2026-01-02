"use client";

import { CandidateEvaluation } from "@/types/assessment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TechBreakdownCard } from "./TechBreakdownCard";
import { Trophy, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";

interface TechEvaluationOverviewProps {
  evaluation: CandidateEvaluation;
  className?: string;
}

export function TechEvaluationOverview({
  evaluation,
  className = "",
}: TechEvaluationOverviewProps) {
  // Group tech scores by priority
  const criticalTech = evaluation.technologyScores.filter((t) => t.priority === "critical");
  const requiredTech = evaluation.technologyScores.filter((t) => t.priority === "required");
  const recommendedTech = evaluation.technologyScores.filter((t) => t.priority === "recommended");
  const optionalTech = evaluation.technologyScores.filter((t) => t.priority === "optional");

  const formatScore = (score: number) => Math.round(score);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overall Score Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Overall Performance
            </CardTitle>
            <div className="flex items-center gap-4">
              <Badge variant="primary" className="text-lg px-4 py-2">
                Grade: {evaluation.overallGrade}
              </Badge>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">
                  {evaluation.overallScore}
                </p>
                <p className="text-sm text-text-tertiary">/100</p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Weighted Score Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-background-secondary rounded-lg border border-border">
              <p className="text-xs text-text-tertiary mb-1">🔴 Critical (40%)</p>
              <p className="text-xl font-bold text-text-primary">
                {formatScore(evaluation.scoreBreakdown.criticalScore)}
              </p>
            </div>

            <div className="p-3 bg-background-secondary rounded-lg border border-border">
              <p className="text-xs text-text-tertiary mb-1">🟠 Required (35%)</p>
              <p className="text-xl font-bold text-text-primary">
                {formatScore(evaluation.scoreBreakdown.requiredScore)}
              </p>
            </div>

            <div className="p-3 bg-background-secondary rounded-lg border border-border">
              <p className="text-xs text-text-tertiary mb-1">🟡 Recommended (20%)</p>
              <p className="text-xl font-bold text-text-primary">
                {formatScore(evaluation.scoreBreakdown.recommendedScore)}
              </p>
            </div>

            <div className="p-3 bg-background-secondary rounded-lg border border-border">
              <p className="text-xs text-text-tertiary mb-1">🟢 Optional (5%)</p>
              <p className="text-xl font-bold text-text-primary">
                {formatScore(evaluation.scoreBreakdown.optionalScore)}
              </p>
            </div>
          </div>

          {/* Penalties */}
          {evaluation.scoreBreakdown.penalties > 0 && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <p className="text-sm text-error">
                ⚠️ Penalties Applied: -{evaluation.scoreBreakdown.penalties} points
              </p>
            </div>
          )}

          {/* Summary */}
          {evaluation.summary && (
            <div className="pt-4 border-t border-border">
              <p className="text-sm text-text-secondary">{evaluation.summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strengths and Areas for Improvement */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Strengths */}
        {evaluation.strengths.length > 0 && (
          <Card className="border-success/20 bg-success/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5 text-success" />
                Key Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 list-disc list-inside text-sm text-text-secondary">
                {evaluation.strengths.map((strength, index) => (
                  <li key={index}>{strength}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Areas for Improvement */}
        {evaluation.areasForImprovement.length > 0 && (
          <Card className="border-warning/20 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-5 w-5 text-warning" />
                Areas for Improvement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 list-disc list-inside text-sm text-text-secondary">
                {evaluation.areasForImprovement.map((area, index) => (
                  <li key={index}>{area}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Technology Breakdown by Priority */}
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-text-primary">
          📊 Technology Performance Breakdown
        </h3>

        {/* Critical Technologies */}
        {criticalTech.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔴</span>
              <h4 className="text-lg font-semibold text-text-primary">
                CRITICAL (40% weight)
              </h4>
            </div>
            <div className="space-y-3">
              {criticalTech.map((techScore) => (
                <TechBreakdownCard key={techScore.technologyId} techScore={techScore} />
              ))}
            </div>
          </div>
        )}

        {/* Required Technologies */}
        {requiredTech.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🟠</span>
              <h4 className="text-lg font-semibold text-text-primary">
                REQUIRED (35% weight)
              </h4>
            </div>
            <div className="space-y-3">
              {requiredTech.map((techScore) => (
                <TechBreakdownCard key={techScore.technologyId} techScore={techScore} />
              ))}
            </div>
          </div>
        )}

        {/* Recommended Technologies */}
        {recommendedTech.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🟡</span>
              <h4 className="text-lg font-semibold text-text-primary">
                RECOMMENDED (20% weight)
              </h4>
            </div>
            <div className="space-y-3">
              {recommendedTech.map((techScore) => (
                <TechBreakdownCard key={techScore.technologyId} techScore={techScore} />
              ))}
            </div>
          </div>
        )}

        {/* Optional Technologies */}
        {optionalTech.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🟢</span>
              <h4 className="text-lg font-semibold text-text-primary">
                OPTIONAL (5% weight - Bonus)
              </h4>
            </div>
            <div className="space-y-3">
              {optionalTech.map((techScore) => (
                <TechBreakdownCard key={techScore.technologyId} techScore={techScore} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Interaction Summary */}
      {Object.keys(evaluation.aiInteractionByTech).length > 0 && (
        <Card className="border-info/20 bg-info/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-info" />
              🤖 AI Interaction Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {Object.entries(evaluation.aiInteractionByTech).map(([techId, interaction]) => (
                <div
                  key={techId}
                  className="flex items-center justify-between p-2 bg-background-secondary rounded"
                >
                  <span className="text-text-secondary">
                    {interaction.technologyId}-related prompts:
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-text-primary">
                      {interaction.promptCount} prompts
                    </span>
                    <Badge variant="default" className="text-xs">
                      Avg quality: {interaction.avgPromptQuality.toFixed(1)}/10
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
