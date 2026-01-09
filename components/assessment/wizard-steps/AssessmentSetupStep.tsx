"use client";

import { useState, useEffect } from "react";
import {
  AssessmentConfig,
  Role,
  SeniorityLevel,
  PricingTier,
  RoleMetadata,
  SeniorityMetadata,
} from "@/types/assessment";
import { getRecommendedDuration } from "@/lib/assessment-config";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import * as Icons from "lucide-react";
import { LucideIcon, Loader2, Clock, Pencil } from "lucide-react";

interface AssessmentSetupStepProps {
  config: Partial<AssessmentConfig>;
  onUpdate: (updates: Partial<AssessmentConfig>) => void;
  errors: Record<string, string>;
  userTier: PricingTier;
}

export function AssessmentSetupStep({
  config,
  onUpdate,
  errors,
  userTier,
}: AssessmentSetupStepProps) {
  const [roles, setRoles] = useState<Record<string, RoleMetadata>>({});
  const [seniorityLevels, setSeniorityLevels] = useState<
    Record<string, SeniorityMetadata>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [hasManualTitle, setHasManualTitle] = useState(false);

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

  // Generate title from role and seniority
  const generateTitle = (role: Role, seniority: SeniorityLevel): string => {
    const seniorityName = seniorityLevels[seniority]?.name || "";
    const roleName = roles[role]?.name || "";
    return `${seniorityName} ${roleName} Assessment`.trim();
  };

  const handleRoleSelect = async (role: Role) => {
    const updates: Partial<AssessmentConfig> = { role };

    // Auto-generate title if not manually edited
    if (!hasManualTitle && config.seniority) {
      updates.title = generateTitle(role, config.seniority);
    }

    // Auto-update duration if seniority is already selected
    if (config.seniority) {
      const recommendedDuration = await getRecommendedDuration(
        role,
        config.seniority
      );
      updates.duration = recommendedDuration;
    }

    // Default assessmentType to real_world
    if (!config.assessmentType) {
      updates.assessmentType = "real_world";
    }

    onUpdate(updates);
  };

  const handleSenioritySelect = async (seniority: SeniorityLevel) => {
    const updates: Partial<AssessmentConfig> = { seniority };

    // Auto-generate title if not manually edited
    if (!hasManualTitle && config.role) {
      updates.title = generateTitle(config.role, seniority);
    }

    // Auto-update duration based on seniority
    if (config.role) {
      const recommendedDuration = await getRecommendedDuration(
        config.role,
        seniority
      );
      updates.duration = recommendedDuration;
    } else {
      // Use default duration from seniority if no role selected
      const level = seniorityLevels[seniority];
      if (level?.defaultDuration) {
        updates.duration = level.defaultDuration;
      }
    }

    // Default assessmentType to real_world
    if (!config.assessmentType) {
      updates.assessmentType = "real_world";
    }

    onUpdate(updates);
  };

  const handleTitleChange = (title: string) => {
    setHasManualTitle(true);
    onUpdate({ title });
  };

  const getIconComponent = (iconName: string): LucideIcon => {
    return (Icons as any)[iconName] || Icons.Circle;
  };

  // Duration options
  const DURATION_OPTIONS = [
    { value: 30, label: "30 min" },
    { value: 45, label: "45 min" },
    { value: 60, label: "60 min" },
    { value: 75, label: "75 min" },
    { value: 90, label: "90 min" },
    { value: 120, label: "120 min" },
  ];

  return (
    <div className="space-y-8">
      {/* Role Selection */}
      <div className="space-y-3">
        <Label required>What role are you hiring for?</Label>
        {errors.role && <p className="text-sm text-error">{errors.role}</p>}

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
            <span className="ml-2 text-text-secondary">Loading roles...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.values(roles).map((role) => {
              const isAvailable =
                role.availableInTiers?.includes(userTier) ?? true;
              const isActive = role.status === "active";
              const isSelected = config.role === role.id;
              const IconComponent = getIconComponent(role.icon || "Circle");

              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() =>
                    isAvailable && isActive && handleRoleSelect(role.id)
                  }
                  disabled={!isAvailable || !isActive}
                  className={`
                    p-4 rounded-lg border-2 text-left transition-all
                    ${
                      isSelected
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
                        ${
                          isSelected
                            ? "bg-primary text-white"
                            : "bg-background-tertiary text-text-secondary"
                        }
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
                          <Badge
                            variant="default"
                            className="text-xs bg-background-tertiary text-text-secondary border-border hover:bg-background-tertiary"
                          >
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

      {/* Seniority & Duration Row */}
      {config.role && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seniority Selection */}
            <div className="space-y-2">
              <Label required>Experience Level</Label>
              {errors.seniority && (
                <p className="text-sm text-error">{errors.seniority}</p>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
                </div>
              ) : (
                <Select
                  value={config.seniority || ""}
                  onChange={(e) =>
                    handleSenioritySelect(e.target.value as SeniorityLevel)
                  }
                >
                  <option value="">Select experience level...</option>
                  {Object.values(seniorityLevels).map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name} ({level.experienceYears})
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {/* Duration Selection */}
            <div className="space-y-2">
              <Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Duration
                  {config.seniority && (
                    <Badge variant="default" className="text-xs">
                      Auto-suggested
                    </Badge>
                  )}
                </div>
              </Label>
              <Select
                value={config.duration?.toString() || ""}
                onChange={(e) =>
                  onUpdate({ duration: parseInt(e.target.value) })
                }
              >
                <option value="">Select duration...</option>
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Seniority details (shown when selected) */}
          {config.seniority && seniorityLevels[config.seniority] && (
            <div className="p-3 bg-background-secondary border border-border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-text-secondary">Difficulty Mix:</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-success"></div>
                      <span className="text-text-tertiary">
                        Easy:{" "}
                        {seniorityLevels[config.seniority].difficultyMix.easy}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-warning"></div>
                      <span className="text-text-tertiary">
                        Medium:{" "}
                        {seniorityLevels[config.seniority].difficultyMix.medium}
                        %
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-error"></div>
                      <span className="text-text-tertiary">
                        Hard:{" "}
                        {seniorityLevels[config.seniority].difficultyMix.hard}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Title (Auto-generated) */}
      {config.role && config.seniority && (
        <div className="space-y-2">
          <Label required>
            <div className="flex items-center gap-2">
              Assessment Title
              {!hasManualTitle && (
                <Badge variant="success" className="text-xs">
                  Auto-generated
                </Badge>
              )}
            </div>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g., Senior Backend Developer Assessment"
              value={config.title || ""}
              onChange={(e) => handleTitleChange(e.target.value)}
              error={!!errors.title}
              className="flex-1"
            />
            {hasManualTitle && (
              <button
                type="button"
                onClick={() => {
                  setHasManualTitle(false);
                  onUpdate({
                    title: generateTitle(config.role!, config.seniority!),
                  });
                }}
                className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
                title="Reset to auto-generated title"
              >
                <Icons.RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
          {errors.title && (
            <p className="text-sm text-error">{errors.title}</p>
          )}
        </div>
      )}

      {/* Description (Optional) */}
      {config.role && config.seniority && (
        <div className="space-y-2">
          <Label>Description (Optional)</Label>
          <Textarea
            placeholder="Describe what this assessment evaluates and any special instructions for candidates..."
            value={config.description || ""}
            onChange={(e) => onUpdate({ description: e.target.value })}
            rows={3}
          />
          <p className="text-sm text-text-tertiary">
            This will be shown to candidates before they start the assessment
          </p>
        </div>
      )}

      {/* Summary Card */}
      {config.role && config.seniority && config.duration && (
        <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Icons.CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-1">
                Ready to continue
              </h4>
              <p className="text-sm text-text-secondary">
                <span className="font-medium">
                  {seniorityLevels[config.seniority]?.name}
                </span>{" "}
                <span className="font-medium">{roles[config.role]?.name}</span>{" "}
                assessment · {config.duration} minutes
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
