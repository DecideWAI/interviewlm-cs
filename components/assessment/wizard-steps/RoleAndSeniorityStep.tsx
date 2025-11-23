"use client";

import { AssessmentConfig, Role, SeniorityLevel, PricingTier } from "@/types/assessment";
import { ROLES, SENIORITY_LEVELS, isRoleAvailableForTier, getRecommendedDuration } from "@/lib/assessment-config";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import * as Icons from "lucide-react";
import { LucideIcon } from "lucide-react";

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
  const handleRoleSelect = (role: Role) => {
    const updates: Partial<AssessmentConfig> = { role };

    // Auto-update duration if role and seniority are both selected
    if (config.seniority) {
      const recommendedDuration = getRecommendedDuration(role, config.seniority);
      updates.duration = recommendedDuration;
    }

    onUpdate(updates);
  };

  const handleSenioritySelect = (seniority: SeniorityLevel) => {
    const updates: Partial<AssessmentConfig> = { seniority };

    // Auto-update duration if role and seniority are both selected
    if (config.role) {
      const recommendedDuration = getRecommendedDuration(config.role, seniority);
      updates.duration = recommendedDuration;
    }

    onUpdate(updates);
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

        <div className="grid grid-cols-2 gap-3">
          {Object.values(ROLES).map((role) => {
            const isAvailable = isRoleAvailableForTier(role.id, userTier);
            const isActive = role.status === "active";
            const isSelected = config.role === role.id;
            const IconComponent = getIconComponent(role.icon);

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

        <div className="space-y-2">
          {Object.values(SENIORITY_LEVELS).map((level) => {
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
      </div>

      {/* Recommendation */}
      {config.role && config.seniority && (
        <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Icons.Lightbulb className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-1">
                Recommended Configuration
              </h4>
              <p className="text-sm text-text-secondary mb-2">
                Based on your selection of{" "}
                <span className="font-medium">{SENIORITY_LEVELS[config.seniority].name}</span>{" "}
                <span className="font-medium">{ROLES[config.role].name}</span>:
              </p>
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>
                  • <span className="font-medium">Duration:</span>{" "}
                  {getRecommendedDuration(config.role, config.seniority)} minutes
                </li>
                <li>
                  • <span className="font-medium">Difficulty Mix:</span>{" "}
                  {SENIORITY_LEVELS[config.seniority].difficultyMix.easy}% Easy,{" "}
                  {SENIORITY_LEVELS[config.seniority].difficultyMix.medium}% Medium,{" "}
                  {SENIORITY_LEVELS[config.seniority].difficultyMix.hard}% Hard
                </li>
                <li>
                  • <span className="font-medium">Focus:</span>{" "}
                  {ROLES[config.role].description}
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
