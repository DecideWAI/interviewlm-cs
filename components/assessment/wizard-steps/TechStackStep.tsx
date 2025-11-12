"use client";

import { useState } from "react";
import {
  AssessmentConfig,
  Technology,
  TechStackRequirements,
  TechPriority,
} from "@/types/assessment";
import {
  LANGUAGES,
  FRAMEWORKS,
  DATABASES,
  TESTING,
  TOOLS,
  getTechSuggestionsForRole,
  TECH_STACK_PRESETS,
} from "@/lib/tech-catalog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import * as Icons from "lucide-react";
import { LucideIcon } from "lucide-react";

interface TechStackStepProps {
  config: Partial<AssessmentConfig>;
  onUpdate: (updates: Partial<AssessmentConfig>) => void;
  errors: Record<string, string>;
}

export function TechStackStep({ config, onUpdate, errors }: TechStackStepProps) {
  const [selectedTech, setSelectedTech] = useState<TechStackRequirements>(
    config.techStackRequirements || {
      critical: [],
      required: [],
      recommended: [],
      optional: [],
    }
  );

  const getIconComponent = (iconName?: string): LucideIcon => {
    if (!iconName) return Icons.Circle;
    return (Icons as any)[iconName] || Icons.Circle;
  };

  const handleTechToggle = (tech: Technology, priority: TechPriority) => {
    const newTechStack = { ...selectedTech };

    // Remove from all priority levels first
    newTechStack.critical = newTechStack.critical.filter((t) => t.id !== tech.id);
    newTechStack.required = newTechStack.required.filter((t) => t.id !== tech.id);
    newTechStack.recommended = newTechStack.recommended.filter((t) => t.id !== tech.id);
    newTechStack.optional = newTechStack.optional.filter((t) => t.id !== tech.id);

    // Check if already selected at this priority level
    const isSelected = selectedTech[priority].some((t) => t.id === tech.id);

    if (!isSelected) {
      // Add to the selected priority level
      newTechStack[priority] = [...newTechStack[priority], tech];
    }

    setSelectedTech(newTechStack);
    onUpdate({ techStackRequirements: newTechStack });
  };

  const isTechSelected = (techId: string): TechPriority | null => {
    if (selectedTech.critical.some((t) => t.id === techId)) return "critical";
    if (selectedTech.required.some((t) => t.id === techId)) return "required";
    if (selectedTech.recommended.some((t) => t.id === techId)) return "recommended";
    if (selectedTech.optional.some((t) => t.id === techId)) return "optional";
    return null;
  };

  const applySmartSuggestions = () => {
    if (!config.role) return;

    const suggestions = getTechSuggestionsForRole(config.role);
    setSelectedTech(suggestions);
    onUpdate({ techStackRequirements: suggestions });
  };

  const applyPreset = (presetKey: string) => {
    const preset = TECH_STACK_PRESETS[presetKey as keyof typeof TECH_STACK_PRESETS];
    if (!preset) return;

    const newTechStack: TechStackRequirements = {
      critical: preset.critical,
      required: preset.required,
      recommended: preset.recommended,
      optional: preset.optional,
    };

    setSelectedTech(newTechStack);
    onUpdate({ techStackRequirements: newTechStack });
  };

  const getPriorityColor = (priority: TechPriority) => {
    switch (priority) {
      case "critical":
        return "text-error";
      case "required":
        return "text-warning";
      case "recommended":
        return "text-info";
      case "optional":
        return "text-success";
    }
  };

  const getPriorityBadge = (priority: TechPriority) => {
    switch (priority) {
      case "critical":
        return "error";
      case "required":
        return "warning";
      case "recommended":
        return "info";
      case "optional":
        return "success";
    }
  };

  const renderTechnologyButton = (tech: Technology, category: string) => {
    const selectedPriority = isTechSelected(tech.id);
    const IconComponent = getIconComponent(tech.icon);

    return (
      <div key={tech.id} className="flex items-center gap-2">
        <button
          onClick={() => {
            if (selectedPriority) {
              // Deselect
              handleTechToggle(tech, selectedPriority);
            }
          }}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all
            ${
              selectedPriority
                ? "border-primary bg-primary/10"
                : "border-border hover:border-border-secondary hover:bg-background-tertiary"
            }
          `}
        >
          <IconComponent className="h-4 w-4" />
          <span>{tech.name}</span>
          {selectedPriority && (
            <Badge variant={getPriorityBadge(selectedPriority)} className="text-xs">
              {selectedPriority}
            </Badge>
          )}
        </button>

        {selectedPriority && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleTechToggle(tech, "critical")}
              className={`px-2 py-1 text-xs rounded ${
                selectedPriority === "critical"
                  ? "bg-error text-white"
                  : "bg-background-tertiary text-text-tertiary hover:bg-background-hover"
              }`}
              title="Critical"
            >
              🔴
            </button>
            <button
              onClick={() => handleTechToggle(tech, "required")}
              className={`px-2 py-1 text-xs rounded ${
                selectedPriority === "required"
                  ? "bg-warning text-white"
                  : "bg-background-tertiary text-text-tertiary hover:bg-background-hover"
              }`}
              title="Required"
            >
              🟠
            </button>
            <button
              onClick={() => handleTechToggle(tech, "recommended")}
              className={`px-2 py-1 text-xs rounded ${
                selectedPriority === "recommended"
                  ? "bg-info text-white"
                  : "bg-background-tertiary text-text-tertiary hover:bg-background-hover"
              }`}
              title="Recommended"
            >
              🟡
            </button>
            <button
              onClick={() => handleTechToggle(tech, "optional")}
              className={`px-2 py-1 text-xs rounded ${
                selectedPriority === "optional"
                  ? "bg-success text-white"
                  : "bg-background-tertiary text-text-tertiary hover:bg-background-hover"
              }`}
              title="Optional"
            >
              🟢
            </button>
          </div>
        )}
      </div>
    );
  };

  const totalSelected =
    selectedTech.critical.length +
    selectedTech.required.length +
    selectedTech.recommended.length +
    selectedTech.optional.length;

  return (
    <div className="space-y-6">
      {/* Header with Presets */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Technology Requirements
          </h3>
          <p className="text-sm text-text-secondary">
            Configure the technology stack with priority levels to enforce requirements
          </p>
        </div>

        {config.role && (
          <Button variant="outline" size="sm" onClick={applySmartSuggestions}>
            <Icons.Sparkles className="h-4 w-4 mr-2" />
            Smart Suggestions
          </Button>
        )}
      </div>

      {/* Priority Legend */}
      <Card className="border-border-secondary bg-background-secondary/50">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-start gap-2">
              <span className="text-xl">🔴</span>
              <div>
                <p className="text-sm font-medium text-text-primary">Critical</p>
                <p className="text-xs text-text-tertiary">Block immediately if violated</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xl">🟠</span>
              <div>
                <p className="text-sm font-medium text-text-primary">Required</p>
                <p className="text-xs text-text-tertiary">Block submission if missing</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xl">🟡</span>
              <div>
                <p className="text-sm font-medium text-text-primary">Recommended</p>
                <p className="text-xs text-text-tertiary">Warn but allow</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xl">🟢</span>
              <div>
                <p className="text-sm font-medium text-text-primary">Optional</p>
                <p className="text-xs text-text-tertiary">Bonus points</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Presets */}
      <div className="space-y-3">
        <Label>Quick Presets</Label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TECH_STACK_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={() => applyPreset(key)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Languages (Critical) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔴</span>
          <Label className="text-base">Primary Language (Critical)</Label>
        </div>
        <p className="text-sm text-text-tertiary">
          Select the primary programming language. Using a different language will block the candidate immediately.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.values(LANGUAGES).map((tech) => renderTechnologyButton(tech, "language"))}
        </div>
      </div>

      {/* Frameworks */}
      <div className="space-y-3">
        <Label className="text-base">Frameworks & Libraries</Label>
        <p className="text-sm text-text-tertiary">
          Click a technology to select it, then choose its priority level (🔴🟠🟡🟢)
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.values(FRAMEWORKS).map((tech) => renderTechnologyButton(tech, "framework"))}
        </div>
      </div>

      {/* Databases */}
      <div className="space-y-3">
        <Label className="text-base">Databases</Label>
        <div className="flex flex-wrap gap-2">
          {Object.values(DATABASES).map((tech) => renderTechnologyButton(tech, "database"))}
        </div>
      </div>

      {/* Testing */}
      <div className="space-y-3">
        <Label className="text-base">Testing Frameworks</Label>
        <div className="flex flex-wrap gap-2">
          {Object.values(TESTING).map((tech) => renderTechnologyButton(tech, "testing"))}
        </div>
      </div>

      {/* Tools */}
      <div className="space-y-3">
        <Label className="text-base">Tools & Infrastructure</Label>
        <div className="flex flex-wrap gap-2">
          {Object.values(TOOLS).map((tech) => renderTechnologyButton(tech, "tool"))}
        </div>
      </div>

      {/* Summary */}
      {totalSelected > 0 && (
        <Card className="border-success/20 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Icons.CheckCircle2 className="h-5 w-5 text-success" />
              Tech Stack Summary ({totalSelected} technologies)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedTech.critical.length > 0 && (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">
                  🔴 Critical ({selectedTech.critical.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedTech.critical.map((tech) => (
                    <Badge key={tech.id} variant="error" className="text-xs">
                      {tech.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTech.required.length > 0 && (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">
                  🟠 Required ({selectedTech.required.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedTech.required.map((tech) => (
                    <Badge key={tech.id} variant="warning" className="text-xs">
                      {tech.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTech.recommended.length > 0 && (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">
                  🟡 Recommended ({selectedTech.recommended.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedTech.recommended.map((tech) => (
                    <Badge key={tech.id} variant="info" className="text-xs">
                      {tech.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTech.optional.length > 0 && (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">
                  🟢 Optional (Bonus) ({selectedTech.optional.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedTech.optional.map((tech) => (
                    <Badge key={tech.id} variant="success" className="text-xs">
                      {tech.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTech.critical.length === 0 && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <p className="text-sm text-text-secondary">
                  ⚠️ <strong>Recommendation:</strong> Add at least one critical technology (primary language) for proper enforcement.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {errors.techStack && (
        <p className="text-sm text-error">{errors.techStack}</p>
      )}
    </div>
  );
}
