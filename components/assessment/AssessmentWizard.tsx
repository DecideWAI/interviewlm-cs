"use client";

import { useState } from "react";
import { AssessmentConfig, PricingTier } from "@/types/assessment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

import { AssessmentSetupStep } from "./wizard-steps/AssessmentSetupStep";
import { TechStackStep } from "./wizard-steps/TechStackStep";
import { QuestionConfigStep } from "./wizard-steps/QuestionConfigStep";

interface AssessmentWizardProps {
  /** Initial tier (from user's subscription) */
  userTier?: PricingTier;
  /** Callback when assessment is created */
  onComplete?: (config: AssessmentConfig) => void;
  /** Callback when cancelled */
  onCancel?: () => void;
}

const STEPS = [
  { id: 1, title: "Setup", description: "Role, seniority & details" },
  { id: 2, title: "Tech Stack", description: "Required technologies" },
  { id: 3, title: "Questions", description: "Configure & create" },
];

export function AssessmentWizard({
  userTier = "payg",
  onComplete,
  onCancel,
}: AssessmentWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<Partial<AssessmentConfig>>({
    tier: userTier,
    aiAssistanceEnabled: true,
    aiMonitoringEnabled: true,
    useTemplate: true,
    status: "draft",
    assessmentType: "real_world", // Default to real_world
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const progress = (currentStep / STEPS.length) * 100;

  const updateConfig = (updates: Partial<AssessmentConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    const updatedFields = Object.keys(updates);
    setErrors((prev) => {
      const newErrors = { ...prev };
      updatedFields.forEach((field) => delete newErrors[field]);
      return newErrors;
    });
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 1: // Setup step (merged role, seniority, title, duration)
        if (!config.role) {
          newErrors.role = "Please select a role";
        }
        if (!config.seniority) {
          newErrors.seniority = "Please select a seniority level";
        }
        if (!config.title?.trim()) {
          newErrors.title = "Assessment title is required";
        }
        // Duration is auto-set from seniority, but validate if manually changed
        if (config.duration && config.duration < 10) {
          newErrors.duration = "Duration must be at least 10 minutes";
        }
        break;

      case 2: // Tech stack (optional but recommended)
        if (
          config.techStackRequirements &&
          config.techStackRequirements.required.length === 0
        ) {
          // Just a warning, not blocking
          console.warn("No required technologies specified");
        }
        break;

      case 3: // Questions (final step with summary)
        if (config.useTemplate && !config.templateId) {
          newErrors.template = "Please select a template or switch to custom questions";
        }
        if (!config.useTemplate && !config.customQuestionSeeds?.length) {
          newErrors.customQuestions = "Please add at least one question configuration";
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleComplete = () => {
    if (validateStep(currentStep)) {
      const completeConfig: AssessmentConfig = {
        ...config,
        id: `assessment-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "current-user", // TODO: Get from auth
      } as AssessmentConfig;

      onComplete?.(completeConfig);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <AssessmentSetupStep
            config={config}
            onUpdate={updateConfig}
            errors={errors}
            userTier={userTier}
          />
        );
      case 2:
        return (
          <TechStackStep
            config={config}
            onUpdate={updateConfig}
            errors={errors}
          />
        );
      case 3:
        return (
          <QuestionConfigStep
            config={config}
            onUpdate={updateConfig}
            errors={errors}
            userTier={userTier}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-text-primary">
              Create Assessment
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-secondary">Progress</p>
            <p className="text-lg font-semibold text-text-primary">{Math.round(progress)}%</p>
          </div>
        </div>

        <Progress value={progress} className="h-2" />

        {/* Step Indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className={`
                    flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                    ${
                      step.id < currentStep
                        ? "bg-success text-white"
                        : step.id === currentStep
                        ? "bg-primary text-white"
                        : "bg-background-tertiary text-text-tertiary"
                    }
                  `}
                >
                  {step.id < currentStep ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      step.id === currentStep
                        ? "text-text-primary"
                        : "text-text-secondary"
                    }`}
                  >
                    {step.title}
                  </p>
                </div>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 mx-2 ${
                    step.id < currentStep
                      ? "bg-success"
                      : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="border-border-secondary">
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].description}</CardTitle>
        </CardHeader>
        <CardContent>{renderStep()}</CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {currentStep > 1 && (
            <Button variant="outline" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}

          {currentStep < STEPS.length ? (
            <Button variant="primary" onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button variant="success" onClick={handleComplete}>
              <Check className="h-4 w-4 mr-1" />
              Create Assessment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
