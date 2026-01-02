"use client";

import { useState, useEffect } from "react";
import { AssessmentConfig, Role, SeniorityLevel, PricingTier, AssessmentType, RoleMetadata, SeniorityMetadata } from "@/types/assessment";
import { getRecommendedDuration } from "@/lib/assessment-config";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import * as Icons from "lucide-react";
import { LucideIcon, Loader2 } from "lucide-react";

interface RoleAndSeniorityStepProps {
  config: Partial<AssessmentConfig>;
  onUpdate: (updates: Partial<AssessmentConfig>) => void;
  errors: Record<string, string>;
  userTier: PricingTier;
}

export function RoleAndSeniorityStep({
  config,
  onUpdate,
  errors,
  userTier,
}: RoleAndSeniorityStepProps) {
  const [roles, setRoles] = useState<Record<string, RoleMetadata>>({});
  const [seniorityLevels, setSeniorityLevels] = useState<Record<string, SeniorityMetadata>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch roles and seniority levels from database
  useEffect(() => {
    async function fetchConfig() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/config?type=all");
        if (response.ok) {
          const data = await response.json();
          setRoles(data.data?.roles || {});
          setSeniorityLevels(data.data?.seniorityLevels || {});
        } else {
          console.error("Failed to fetch config");
        }
      } catch (error) {
        console.error("Error fetching config:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchConfig();
  }, []);
  const handleRoleSelect = async (role: Role) => {
    const updates: Partial<AssessmentConfig> = { role };

    // Auto-update duration if role and seniority are both selected
    if (config.seniority) {
      const recommendedDuration = await getRecommendedDuration(role, config.seniority);
      updates.duration = recommendedDuration;
    }

    onUpdate(updates);
  };

  const handleSenioritySelect = async (seniority: SeniorityLevel) => {
    const updates: Partial<AssessmentConfig> = { seniority };

    // Auto-update duration if role and seniority are both selected
    if (config.role) {
      const recommendedDuration = await getRecommendedDuration(config.role, seniority);
      updates.duration = recommendedDuration;
    }

    onUpdate(updates);
  };

  const handleAssessmentTypeSelect = (assessmentType: AssessmentType) => {
    onUpdate({ assessmentType });
  };

  const getIconComponent = (iconName: string): LucideIcon => {
    return (Icons as any)[iconName] || Icons.Circle;
  };

  return (
    <div className="space-y-8">
      {/* Role Selection */}
      <div className="space-y-3">
        <Label required>Select Role</Label>
        {errors.role && (
          <p className="text-sm text-error">{errors.role}</p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
            <span className="ml-2 text-text-secondary">Loading roles...</span>
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          {Object.values(roles).map((role) => {
            const isAvailable = role.availableInTiers?.includes(userTier) ?? true;
            const isActive = role.status === "active";
            const isSelected = config.role === role.id;
            const IconComponent = getIconComponent(role.icon || "Circle");

            return (
              <button
                key={role.id}
                type="button"
                onClick={() => isAvailable && isActive && handleRoleSelect(role.id)}
                disabled={!isAvailable || !isActive}
                className={`
                  p-4 rounded-lg border-2 text-left transition-all
                  ${isSelected
                    ? "border-primary bg-primary/5"
                    : isAvailable && isActive
                      ? "border-border hover:border-border-secondary hover:bg-background-tertiary"
                      : "border-border opacity-50 cursor-not-allowed"
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`
                      p-2 rounded-lg
                      ${isSelected ? "bg-primary text-white" : "bg-background-tertiary text-text-secondary"}
                    `}
                  >
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-text-primary text-sm">
                        {role.name}
                      </h4>
                      {!isActive ? (
                        <Badge variant="default" className="text-xs bg-background-tertiary text-text-secondary border-border hover:bg-background-tertiary">
                          Coming Soon
                        </Badge>
                      ) : !isAvailable ? (
                        <Badge variant="warning" className="text-xs">
                          Upgrade
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-text-tertiary line-clamp-2">
                      {role.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        )}

        {config.role === "custom" && (
          <div className="mt-3">
            <Label>Custom Role Name</Label>
            <Input
              placeholder="e.g., DevOps Engineer, Mobile Developer"
              value={config.customRoleName || ""}
              onChange={(e) => onUpdate({ customRoleName: e.target.value })}
              className="mt-2"
            />
          </div>
        )}
      </div>

      {/* Seniority Selection */}
      <div className="space-y-3">
        <Label required>Select Seniority Level</Label>
        {errors.seniority && (
          <p className="text-sm text-error">{errors.seniority}</p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
            <span className="ml-2 text-text-secondary">Loading seniority levels...</span>
          </div>
        ) : (
        <div className="space-y-2">
          {Object.values(seniorityLevels).map((level) => {
            const isSelected = config.seniority === level.id;

            return (
              <button
                key={level.id}
                type="button"
                onClick={() => handleSenioritySelect(level.id)}
                className={`
                  w-full p-4 rounded-lg border-2 text-left transition-all
                  ${isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border-secondary hover:bg-background-tertiary"
                  }
                `}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-text-primary">
                        {level.name}
                      </h4>
                      <Badge variant="default" className="text-xs">
                        {level.experienceYears}
                      </Badge>
                    </div>
                    <p className="text-sm text-text-secondary mb-3">
                      {level.description}
                    </p>

                    {/* Difficulty Distribution */}
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-success"></div>
                        <span className="text-text-tertiary">
                          Easy: {level.difficultyMix.easy}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-warning"></div>
                        <span className="text-text-tertiary">
                          Medium: {level.difficultyMix.medium}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-error"></div>
                        <span className="text-text-tertiary">
                          Hard: {level.difficultyMix.hard}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-text-tertiary">Recommended</p>
                    <p className="text-sm font-medium text-text-primary">
                      {level.defaultDuration} min
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Assessment Type Selection */}
      <div className="space-y-3">
        <Label required>Assessment Type</Label>
        {errors.assessmentType && (
          <p className="text-sm text-error">{errors.assessmentType}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Real World Problem Card */}
          <button
            type="button"
            onClick={() => handleAssessmentTypeSelect("real_world")}
            className={`
              p-5 rounded-lg border-2 text-left transition-all
              ${config.assessmentType === "real_world"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-border-secondary hover:bg-background-tertiary"
              }
            `}
          >
            <div className="flex items-start gap-3">
              <div
                className={`
                  p-2.5 rounded-lg
                  ${config.assessmentType === "real_world"
                    ? "bg-primary text-white"
                    : "bg-background-tertiary text-text-secondary"}
                `}
              >
                <Icons.Code2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-text-primary mb-1">
                  Real World Problem
                </h4>
                <p className="text-sm text-text-secondary mb-3">
                  Practical coding challenges focused on implementation, testing, and production-ready code.
                </p>
                <div className="space-y-1.5 text-xs text-text-tertiary">
                  <div className="flex items-center gap-2">
                    <Icons.Check className="h-3.5 w-3.5 text-success" />
                    <span>Complete working implementation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.Check className="h-3.5 w-3.5 text-success" />
                    <span>Unit tests & edge cases</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.Check className="h-3.5 w-3.5 text-success" />
                    <span>Error handling & validation</span>
                  </div>
                </div>
              </div>
            </div>
          </button>

          {/* System Design Card */}
          <button
            type="button"
            onClick={() => handleAssessmentTypeSelect("system_design")}
            className={`
              p-5 rounded-lg border-2 text-left transition-all
              ${config.assessmentType === "system_design"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-border-secondary hover:bg-background-tertiary"
              }
            `}
          >
            <div className="flex items-start gap-3">
              <div
                className={`
                  p-2.5 rounded-lg
                  ${config.assessmentType === "system_design"
                    ? "bg-primary text-white"
                    : "bg-background-tertiary text-text-secondary"}
                `}
              >
                <Icons.Network className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-text-primary mb-1">
                  System Design
                </h4>
                <p className="text-sm text-text-secondary mb-3">
                  Architecture-focused challenges combining design documentation with partial implementation.
                </p>
                <div className="space-y-1.5 text-xs text-text-tertiary">
                  <div className="flex items-center gap-2">
                    <Icons.Check className="h-3.5 w-3.5 text-success" />
                    <span>DESIGN.md architecture doc</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.Check className="h-3.5 w-3.5 text-success" />
                    <span>Trade-off analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.Check className="h-3.5 w-3.5 text-success" />
                    <span>API contracts & core logic</span>
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Assessment Type Info */}
        {config.assessmentType && (
          <div className={`p-3 rounded-lg border ${
            config.assessmentType === "real_world"
              ? "bg-primary/5 border-primary/20"
              : "bg-info/5 border-info/20"
          }`}>
            <div className="flex items-center gap-2 text-sm">
              <Icons.Info className={`h-4 w-4 ${
                config.assessmentType === "real_world" ? "text-primary" : "text-info"
              }`} />
              <span className="text-text-secondary">
                {config.assessmentType === "real_world"
                  ? "Evaluation focuses on code quality, testing, and problem completion."
                  : "Evaluation focuses on design clarity, trade-offs, and API design."
                }
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Recommendation */}
      {config.role && config.seniority && config.assessmentType && (
        <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Icons.Lightbulb className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-1">
                Recommended Configuration
              </h4>
              <p className="text-sm text-text-secondary mb-2">
                Based on your selection of{" "}
                <span className="font-medium">{seniorityLevels[config.seniority]?.name}</span>{" "}
                <span className="font-medium">{roles[config.role]?.name}</span>{" "}
                with{" "}
                <span className="font-medium">
                  {config.assessmentType === "real_world" ? "Real World Problem" : "System Design"}
                </span>:
              </p>
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>
                  • <span className="font-medium">Duration:</span>{" "}
                  {config.duration ?? seniorityLevels[config.seniority]?.defaultDuration ?? 60} minutes
                </li>
                <li>
                  • <span className="font-medium">Difficulty Mix:</span>{" "}
                  {seniorityLevels[config.seniority]?.difficultyMix?.easy ?? 20}% Easy,{" "}
                  {seniorityLevels[config.seniority]?.difficultyMix?.medium ?? 60}% Medium,{" "}
                  {seniorityLevels[config.seniority]?.difficultyMix?.hard ?? 20}% Hard
                </li>
                <li>
                  • <span className="font-medium">Evaluation Focus:</span>{" "}
                  {config.assessmentType === "real_world"
                    ? "Problem Completion (30%), Code Quality (25%), Testing (20%), Error Handling (15%), Efficiency (10%)"
                    : "Design Clarity (30%), Trade-offs (25%), API Design (20%), Implementation (15%), Communication (10%)"}
                </li>
                <li>
                  • <span className="font-medium">Role Focus:</span>{" "}
                  {roles[config.role]?.description}
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
