"use client";

import { useState } from "react";
import { TechStackRequirements } from "@/types/assessment";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

interface TechStackDisplayProps {
  requirements: TechStackRequirements;
  className?: string;
}

export function TechStackDisplay({ requirements, className = "" }: TechStackDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasCritical = requirements.critical.length > 0;
  const hasRequired = requirements.required.length > 0;
  const hasRecommended = requirements.recommended.length > 0;
  const hasOptional = requirements.optional.length > 0;

  return (
    <Card className={`border-primary/20 bg-primary/5 ${className}`}>
      <CardContent className="pt-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <h3 className="text-sm font-semibold text-text-primary">
              Tech Stack Requirements
            </h3>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            {hasCritical && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🔴</span>
                  <p className="text-xs font-medium text-text-secondary">
                    CRITICAL (Must Use):
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {requirements.critical.map((tech) => (
                    <Badge key={tech.id} variant="error" className="text-xs">
                      {tech.name}
                      {tech.version && (
                        <span className="ml-1 opacity-70">{tech.version}</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {hasRequired && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🟠</span>
                  <p className="text-xs font-medium text-text-secondary">
                    REQUIRED (Must Be Present):
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {requirements.required.map((tech) => (
                    <Badge key={tech.id} variant="warning" className="text-xs">
                      {tech.name}
                      {tech.version && (
                        <span className="ml-1 opacity-70">{tech.version}</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {hasRecommended && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🟡</span>
                  <p className="text-xs font-medium text-text-secondary">
                    RECOMMENDED:
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {requirements.recommended.map((tech) => (
                    <Badge key={tech.id} variant="info" className="text-xs">
                      {tech.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {hasOptional && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🟢</span>
                  <p className="text-xs font-medium text-text-secondary">
                    OPTIONAL (Bonus Points):
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {requirements.optional.map((tech) => (
                    <Badge key={tech.id} variant="success" className="text-xs">
                      {tech.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {hasCritical && (
              <div className="pt-2 border-t border-border-secondary">
                <p className="text-xs text-text-tertiary">
                  ⚠️ <strong>IMPORTANT:</strong> Using a different technology than{" "}
                  <strong>{requirements.critical.map((t) => t.name).join(", ")}</strong> will
                  terminate your session immediately.
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-border-secondary">
              <p className="text-xs text-text-tertiary">
                💡 Your environment is pre-configured with these technologies.
                Use them to solve the problem.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
