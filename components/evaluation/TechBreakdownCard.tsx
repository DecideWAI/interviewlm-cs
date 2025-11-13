"use client";

import { TechnologyScore, TechPriority } from "@/types/assessment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Code } from "lucide-react";
import { useState } from "react";

interface TechBreakdownCardProps {
  techScore: TechnologyScore;
  className?: string;
}

export function TechBreakdownCard({ techScore, className = "" }: TechBreakdownCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getPriorityIcon = (priority: TechPriority) => {
    switch (priority) {
      case "critical":
        return "🔴";
      case "required":
        return "🟠";
      case "recommended":
        return "🟡";
      case "optional":
        return "🟢";
    }
  };

  const getPriorityLabel = (priority: TechPriority) => {
    switch (priority) {
      case "critical":
        return "CRITICAL";
      case "required":
        return "REQUIRED";
      case "recommended":
        return "RECOMMENDED";
      case "optional":
        return "OPTIONAL";
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A":
        return "text-success";
      case "B":
        return "text-info";
      case "C":
        return "text-warning";
      case "D":
      case "F":
        return "text-error";
      default:
        return "text-text-secondary";
    }
  };

  const getGradeBgColor = (grade: string) => {
    switch (grade) {
      case "A":
        return "bg-success/10 border-success/20";
      case "B":
        return "bg-info/10 border-info/20";
      case "C":
        return "bg-warning/10 border-warning/20";
      case "D":
      case "F":
        return "bg-error/10 border-error/20";
      default:
        return "bg-background-tertiary border-border";
    }
  };

  return (
    <Card className={`border-border-secondary ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{getPriorityIcon(techScore.priority)}</span>
              <CardTitle className="text-base font-semibold">
                {techScore.technologyName}
              </CardTitle>
            </div>
            <Badge variant="default" className="text-xs">
              {getPriorityLabel(techScore.priority)}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-lg border ${getGradeBgColor(techScore.grade)}`}>
              <span className={`text-lg font-bold ${getGradeColor(techScore.grade)}`}>
                {techScore.grade}
              </span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-text-primary">{techScore.score}</p>
              <p className="text-xs text-text-tertiary">/100</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div>
          <Progress value={techScore.score} className="h-3" />
        </div>

        {/* Strengths */}
        {techScore.strengths.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <p className="text-sm font-medium text-success">Strengths</p>
            </div>
            <ul className="space-y-1 ml-6 list-disc list-inside text-sm text-text-secondary">
              {techScore.strengths.map((strength, index) => (
                <li key={index}>{strength}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Weaknesses */}
        {techScore.weaknesses.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <p className="text-sm font-medium text-warning">Areas for Improvement</p>
            </div>
            <ul className="space-y-1 ml-6 list-disc list-inside text-sm text-text-secondary">
              {techScore.weaknesses.map((weakness, index) => (
                <li key={index}>{weakness}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Breakdown (Expandable) */}
        <div className="pt-3 border-t border-border">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-sm font-medium text-text-primary hover:text-primary transition-colors"
          >
            <span>Detailed Breakdown</span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-3">
              {Object.entries(techScore.breakdown).map(([key, value]) => {
                if (value === undefined) return null;

                const label = key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (str) => str.toUpperCase());

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-text-secondary">{label}</span>
                      <span className="font-medium text-text-primary">{value}/100</span>
                    </div>
                    <Progress value={value} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Code Examples */}
        {techScore.examples && techScore.examples.length > 0 && isExpanded && (
          <div className="pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <Code className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-text-primary">Code Examples</p>
            </div>
            <div className="space-y-2">
              {techScore.examples.slice(0, 3).map((example, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border text-xs ${
                    example.type === "strength"
                      ? "bg-success/5 border-success/20"
                      : "bg-warning/5 border-warning/20"
                  }`}
                >
                  <p className="text-text-primary font-medium mb-1">{example.description}</p>
                  <p className="text-text-tertiary">
                    📄 {example.location.filePath}
                    {example.location.line && `:${example.location.line}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
