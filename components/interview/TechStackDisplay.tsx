"use client";

import { useState, useEffect } from "react";
import { TechStackRequirements } from "@/types/assessment";
import type { RequiredTechStack } from "@/types/seed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, XCircle, Info } from "lucide-react";

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
          <div className="mt-4 space-y-3 max-h-[300px] overflow-y-auto">
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

/**
 * Incremental Tech Stack Display
 * Shows required tech for incremental assessments with real-time compliance
 */
interface IncrementalTechStackDisplayProps {
  requiredTech: RequiredTechStack;
  candidateId?: string;
  showCompliance?: boolean;
  className?: string;
}

interface ComplianceStatus {
  compliant: boolean;
  score: number;
  violations: Array<{
    type: string;
    expected: string;
    severity: 'error' | 'warning';
  }>;
}

export function IncrementalTechStackDisplay({
  requiredTech,
  candidateId,
  showCompliance = true,
  className = "",
}: IncrementalTechStackDisplayProps) {
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch compliance status periodically
  useEffect(() => {
    if (!showCompliance || !candidateId) return;

    const checkCompliance = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/interview/${candidateId}/tech-validation`
        );

        if (response.ok) {
          const data = await response.json();
          setCompliance(data);
        }
      } catch (error) {
        console.error("Failed to check tech compliance:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Check immediately and then every 30 seconds
    checkCompliance();
    const interval = setInterval(checkCompliance, 30000);

    return () => clearInterval(interval);
  }, [candidateId, showCompliance]);

  // Flatten all technologies
  const allTech = [
    ...requiredTech.languages.map((t) => ({ name: t.name, priority: t.priority, category: 'Language' })),
    ...requiredTech.frameworks.map((t) => ({ name: t.name, priority: t.priority, category: 'Framework' })),
    ...requiredTech.databases.map((t) => ({ name: t.name, priority: t.priority, category: 'Database' })),
    ...(requiredTech.tools || []).map((t) => ({ name: t.name, priority: t.priority, category: 'Tool' })),
  ];

  // Determine overall status
  const getStatusIcon = () => {
    if (!showCompliance || !compliance) {
      return <Info className="h-4 w-4 text-text-tertiary" />;
    }

    if (compliance.compliant) {
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    }

    const hasErrors = compliance.violations.some((v) => v.severity === 'error');
    return hasErrors ? (
      <XCircle className="h-4 w-4 text-error" />
    ) : (
      <AlertCircle className="h-4 w-4 text-warning" />
    );
  };

  const getStatusText = () => {
    if (!showCompliance || !compliance) {
      return "Required Tech Stack";
    }

    if (compliance.compliant) {
      return `✓ Compliant (${(compliance.score * 100).toFixed(0)}%)`;
    }

    const errors = compliance.violations.filter((v) => v.severity === 'error');
    const warnings = compliance.violations.filter((v) => v.severity === 'warning');

    if (errors.length > 0) {
      return `✗ ${errors.length} issue${errors.length > 1 ? 's' : ''}`;
    }

    return `⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;
  };

  const getStatusColor = () => {
    if (!showCompliance || !compliance) {
      return "text-text-secondary";
    }

    if (compliance.compliant) {
      return "text-success";
    }

    const hasErrors = compliance.violations.some((v) => v.severity === 'error');
    return hasErrors ? "text-error" : "text-warning";
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-2 bg-background-secondary border-b border-border ${className}`}>
      {/* Status Icon & Text */}
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Tech Stack Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {allTech.map((tech, index) => {
          const hasViolation = compliance?.violations.some(
            (v) => v.expected.toLowerCase().includes(tech.name.toLowerCase())
          );

          return (
            <Badge
              key={`${tech.category}-${tech.name}-${index}`}
              variant={hasViolation ? "error" : "default"}
              className="text-xs"
            >
              {tech.name}
            </Badge>
          );
        })}
      </div>

      {/* Violations Details */}
      {compliance && compliance.violations.length > 0 && (
        <div className="ml-auto">
          <button
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors underline"
            onClick={() => {
              const message = compliance.violations
                .map((v) => `${v.severity.toUpperCase()}: Expected to use ${v.expected}`)
                .join('\n');
              alert(message);
            }}
          >
            View Issues ({compliance.violations.length})
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && showCompliance && (
        <div className="ml-2">
          <div className="w-3 h-3 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

/**
 * Compact Tech Stack Badges for header
 */
export function TechStackBadges({ requiredTech }: { requiredTech: RequiredTechStack }) {
  const allTech = [
    ...requiredTech.languages.map(t => t.name),
    ...requiredTech.frameworks.map(t => t.name),
    ...requiredTech.databases.map(t => t.name),
  ];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-text-tertiary">Required:</span>
      {allTech.slice(0, 3).map((tech, index) => (
        <Badge key={`${tech}-${index}`} variant="default" className="text-xs px-1.5 py-0.5">
          {tech}
        </Badge>
      ))}
      {allTech.length > 3 && (
        <span className="text-xs text-text-tertiary">
          +{allTech.length - 3}
        </span>
      )}
    </div>
  );
}
