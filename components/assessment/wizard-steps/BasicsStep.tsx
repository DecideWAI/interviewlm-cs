"use client";

import { AssessmentConfig } from "@/types/assessment";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Clock } from "lucide-react";

interface BasicsStepProps {
  config: Partial<AssessmentConfig>;
  onUpdate: (updates: Partial<AssessmentConfig>) => void;
  errors: Record<string, string>;
}

const DURATION_OPTIONS = [
  { value: 20, label: "20 minutes (Quick screening)" },
  { value: 40, label: "40 minutes (Standard screening)" },
  { value: 60, label: "60 minutes (Mid-level assessment)" },
  { value: 75, label: "75 minutes (Senior assessment)" },
  { value: 90, label: "90 minutes (Comprehensive assessment)" },
  { value: 120, label: "120 minutes (Extended assessment)" },
];

export function BasicsStep({ config, onUpdate, errors }: BasicsStepProps) {
  return (
    <div className="space-y-6">
      {/* Assessment Title */}
      <div className="space-y-2">
        <Label required>Assessment Title</Label>
        <Input
          placeholder="e.g., Senior Full-Stack Developer Assessment"
          value={config.title || ""}
          onChange={(e) => onUpdate({ title: e.target.value })}
          error={!!errors.title}
        />
        {errors.title && (
          <p className="text-sm text-error">{errors.title}</p>
        )}
        <p className="text-sm text-text-tertiary">
          Give your assessment a clear, descriptive name
        </p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Description (Optional)</Label>
        <Textarea
          placeholder="Describe what this assessment evaluates and any special instructions for candidates..."
          value={config.description || ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={4}
        />
        <p className="text-sm text-text-tertiary">
          This will be shown to candidates before they start the assessment
        </p>
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <Label required>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Assessment Duration
          </div>
        </Label>
        <Select
          value={config.duration?.toString() || ""}
          onChange={(e) => onUpdate({ duration: parseInt(e.target.value) })}
          error={!!errors.duration}
        >
          <option value="">Select duration...</option>
          {DURATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {errors.duration && (
          <p className="text-sm text-error">{errors.duration}</p>
        )}
        <p className="text-sm text-text-tertiary">
          Recommended duration will be suggested based on role and seniority
        </p>
      </div>

      {/* Info Card */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <h4 className="text-sm font-medium text-text-primary mb-2">
          💡 Best Practices
        </h4>
        <ul className="space-y-1 text-sm text-text-secondary">
          <li>• Use clear, specific titles that include the role and level</li>
          <li>• Provide context about what you're evaluating in the description</li>
          <li>• Choose duration based on complexity - longer assessments for senior roles</li>
          <li>• Junior roles: 20-40 min | Mid-level: 40-60 min | Senior+: 60-90 min</li>
        </ul>
      </div>
    </div>
  );
}
