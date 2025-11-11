"use client";

import { AssessmentConfig, PricingTier } from "@/types/assessment";
import { ROLES, SENIORITY_LEVELS, ASSESSMENT_TEMPLATES, getTierLimits } from "@/lib/assessment-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eye,
  FileText,
  Clock,
  Target,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle
} from "lucide-react";

interface ReviewAndPreviewStepProps {
  config: Partial<AssessmentConfig>;
  userTier: PricingTier;
}

export function ReviewAndPreviewStep({ config, userTier }: ReviewAndPreviewStepProps) {
  const tierLimits = getTierLimits(userTier);
  const template = config.templateId
    ? ASSESSMENT_TEMPLATES.find((t) => t.id === config.templateId)
    : null;

  const handlePreview = () => {
    // TODO: Navigate to preview page
    console.log("Preview assessment:", config);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Basic Info */}
        <Card className="border-border-secondary">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Assessment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-text-tertiary">Title</p>
              <p className="text-text-primary font-medium">{config.title || "Untitled"}</p>
            </div>
            {config.description && (
              <div>
                <p className="text-text-tertiary">Description</p>
                <p className="text-text-secondary text-xs line-clamp-2">
                  {config.description}
                </p>
              </div>
            )}
            <div>
              <p className="text-text-tertiary">Duration</p>
              <p className="text-text-primary font-medium">
                <Clock className="h-3 w-3 inline mr-1" />
                {config.duration} minutes
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Role & Seniority */}
        <Card className="border-border-secondary">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Target Candidate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-text-tertiary">Role</p>
              <p className="text-text-primary font-medium">
                {config.role ? ROLES[config.role].name : "Not selected"}
                {config.customRoleName && ` - ${config.customRoleName}`}
              </p>
            </div>
            <div>
              <p className="text-text-tertiary">Seniority Level</p>
              <p className="text-text-primary font-medium">
                {config.seniority
                  ? SENIORITY_LEVELS[config.seniority].name
                  : "Not selected"}
              </p>
              {config.seniority && (
                <p className="text-text-tertiary text-xs">
                  {SENIORITY_LEVELS[config.seniority].experienceYears}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Question Configuration */}
      <Card className="border-border-secondary">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Question Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {config.useTemplate ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="success" className="mb-2">
                    Template-Based
                  </Badge>
                  <p className="text-sm font-medium text-text-primary">
                    {template?.name || "Template not found"}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">
                    {template?.description}
                  </p>
                </div>
              </div>
              {template && (
                <div className="flex items-center gap-4 text-xs text-text-tertiary pt-2 border-t border-border">
                  <span>📋 {template.problemCount} problems</span>
                  <span>⏱️ ~{template.estimatedDuration} min</span>
                  <span>✨ AI-powered evaluation</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="primary">Custom Configuration</Badge>
                <span className="text-sm text-text-secondary">
                  {config.customQuestionSeeds?.length || 0} question seed(s)
                </span>
              </div>

              {config.customQuestionSeeds && config.customQuestionSeeds.length > 0 ? (
                <div className="space-y-2">
                  {config.customQuestionSeeds.map((seed, index) => (
                    <div
                      key={index}
                      className="p-3 bg-background-tertiary rounded-lg border border-border"
                    >
                      <p className="text-xs font-medium text-text-primary mb-1">
                        Seed #{index + 1}
                      </p>
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {seed.instructions}
                      </p>
                      {seed.topics && seed.topics.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {seed.topics.map((topic, i) => (
                            <Badge key={i} variant="default" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">No custom seeds configured</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Configuration */}
      <Card className="border-border-secondary">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Assistant Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">AI Assistance</span>
            <div className="flex items-center gap-2">
              {config.aiAssistanceEnabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-success font-medium">Enabled</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-error" />
                  <span className="text-error font-medium">Disabled</span>
                </>
              )}
            </div>
          </div>
          {config.aiAssistanceEnabled && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">AI Monitoring</span>
              <div className="flex items-center gap-2">
                {config.aiMonitoringEnabled ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-success font-medium">Enabled</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-text-tertiary" />
                    <span className="text-text-tertiary font-medium">Disabled</span>
                  </>
                )}
              </div>
            </div>
          )}
          {config.aiAssistanceEnabled && config.aiMonitoringEnabled && (
            <p className="text-xs text-text-tertiary pt-2 border-t border-border">
              We'll track how candidates interact with AI to evaluate prompt quality,
              iteration patterns, and problem-solving approach.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview Button */}
      <div className="p-6 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-start gap-4">
          <Eye className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h4 className="font-medium text-text-primary mb-1">
              Preview Your Assessment
            </h4>
            <p className="text-sm text-text-secondary mb-4">
              Experience the assessment from a candidate's perspective before publishing.
              Test the questions, difficulty, and overall flow.
            </p>
            <Button variant="primary" onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-2" />
              Launch Preview
            </Button>
            {tierLimits.previewTestRuns !== "unlimited" &&
              tierLimits.previewTestRuns === 0 && (
                <p className="text-xs text-warning mt-2">
                  ⚠️ Preview test runs are not included in your tier. Upgrade to test
                  before publishing.
                </p>
              )}
            {typeof tierLimits.previewTestRuns === "number" &&
              tierLimits.previewTestRuns > 0 && (
                <p className="text-xs text-text-tertiary mt-2">
                  {tierLimits.previewTestRuns} preview test runs available in your tier
                </p>
              )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 bg-background-tertiary border border-border rounded-lg">
        <h4 className="text-sm font-medium text-text-primary mb-3">
          ✅ Assessment Summary
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Total Duration</span>
            <span className="font-medium text-text-primary">{config.duration} min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Question Type</span>
            <span className="font-medium text-text-primary">
              {config.useTemplate ? "Template-Based" : "Custom"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">AI Assistance</span>
            <span className="font-medium text-text-primary">
              {config.aiAssistanceEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Your Tier</span>
            <Badge variant="primary">{userTier.toUpperCase()}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
