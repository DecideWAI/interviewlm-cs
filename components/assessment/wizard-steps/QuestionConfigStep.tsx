"use client";

import { useState, useEffect } from "react";
import { AssessmentConfig, QuestionSeed, PricingTier, AssessmentTemplate, RoleMetadata, SeniorityMetadata } from "@/types/assessment";
import { getTierLimits } from "@/lib/assessment-config";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Plus, Trash2, Sparkles, Lock, Zap, Loader2, Clock, Target, Layers, CheckCircle2 } from "lucide-react";
import { IncrementalSeedForm } from "../IncrementalSeedForm";

interface QuestionConfigStepProps {
  config: Partial<AssessmentConfig>;
  onUpdate: (updates: Partial<AssessmentConfig>) => void;
  errors: Record<string, string>;
  userTier: PricingTier;
  /** Show summary panel for final step */
  showSummary?: boolean;
}

export function QuestionConfigStep({
  config,
  onUpdate,
  errors,
  userTier,
  showSummary = true,
}: QuestionConfigStepProps) {
  const tierLimits = getTierLimits(userTier);
  const [localSeeds, setLocalSeeds] = useState<QuestionSeed[]>(
    config.customQuestionSeeds || []
  );
  const [availableTemplates, setAvailableTemplates] = useState<AssessmentTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [roles, setRoles] = useState<Record<string, RoleMetadata>>({});
  const [seniorityLevels, setSeniorityLevels] = useState<Record<string, SeniorityMetadata>>({});

  // Fetch roles and seniority for summary display
  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch("/api/config?type=all");
        if (response.ok) {
          const data = await response.json();
          setRoles(data.data?.roles || {});
          setSeniorityLevels(data.data?.seniorityLevels || {});
        }
      } catch (error) {
        console.error("Error fetching config:", error);
      }
    }
    if (showSummary) {
      fetchConfig();
    }
  }, [showSummary]);

  // Fetch templates from database when role or seniority changes
  useEffect(() => {
    async function fetchTemplates() {
      setIsLoadingTemplates(true);
      try {
        const params = new URLSearchParams();
        if (config.role) params.append("role", config.role);
        if (config.seniority) params.append("seniority", config.seniority);

        const response = await fetch(`/api/assessment-templates?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setAvailableTemplates(data.data || []);
        } else {
          console.error("Failed to fetch templates");
          setAvailableTemplates([]);
        }
      } catch (error) {
        console.error("Error fetching templates:", error);
        setAvailableTemplates([]);
      } finally {
        setIsLoadingTemplates(false);
      }
    }

    fetchTemplates();
  }, [config.role, config.seniority]);

  const handleTemplateSelect = (templateId: string) => {
    onUpdate({ useTemplate: true, templateId });
  };

  const handleAddCustomSeed = () => {
    const newSeed: QuestionSeed = {
      instructions: "",
      topics: [],
      difficultyDistribution: { easy: 20, medium: 50, hard: 30 },
    };
    const newSeeds = [...localSeeds, newSeed];
    setLocalSeeds(newSeeds);
    onUpdate({ useTemplate: false, customQuestionSeeds: newSeeds });
  };

  const handleUpdateSeed = (index: number, updates: Partial<QuestionSeed>) => {
    const newSeeds = [...localSeeds];
    newSeeds[index] = { ...newSeeds[index], ...updates };
    setLocalSeeds(newSeeds);
    onUpdate({ customQuestionSeeds: newSeeds });
  };

  const handleRemoveSeed = (index: number) => {
    const newSeeds = localSeeds.filter((_, i) => i !== index);
    setLocalSeeds(newSeeds);
    onUpdate({ customQuestionSeeds: newSeeds });
  };

  const canAddCustomQuestions = tierLimits.customInstructionsAllowed;
  const customQuestionLimit = tierLimits.maxCustomQuestions;
  const hasReachedLimit =
    typeof customQuestionLimit === "number" &&
    localSeeds.length >= customQuestionLimit;

  // Get template name if selected
  const selectedTemplate = availableTemplates.find(t => t.id === config.templateId);

  // Get tech stack summary
  const techStackSummary = config.techStackRequirements
    ? [...config.techStackRequirements.required, ...config.techStackRequirements.optional]
        .map(t => t.name)
        .slice(0, 5)
    : [];

  return (
    <div className={`${showSummary ? 'flex flex-col lg:flex-row gap-6' : ''}`}>
      {/* Main Content */}
      <div className={`${showSummary ? 'flex-1' : ''} space-y-6`}>
      <Tabs
        defaultValue="template"
        value={config.useTemplate ? "template" : config.useIncremental ? "incremental" : "custom"}
        onValueChange={(value) => onUpdate({
          useTemplate: value === "template",
          useIncremental: value === "incremental"
        })}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="template">
            <FileText className="h-4 w-4 mr-2" />
            Use Template
            <Badge variant="success" className="ml-2 text-xs">
              Recommended
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="incremental" disabled={!canAddCustomQuestions}>
            <Zap className="h-4 w-4 mr-2" />
            Adaptive Assessment
            <Badge variant="primary" className="ml-2 text-xs">
              AI-Powered
            </Badge>
            {!canAddCustomQuestions && <Lock className="h-3 w-3 ml-2" />}
          </TabsTrigger>
          <TabsTrigger value="custom" disabled={!canAddCustomQuestions}>
            <Sparkles className="h-4 w-4 mr-2" />
            Custom Questions
            {!canAddCustomQuestions && <Lock className="h-3 w-3 ml-2" />}
          </TabsTrigger>
        </TabsList>

        {/* Template Selection */}
        <TabsContent value="template" className="space-y-4 mt-4">
          {errors.template && (
            <p className="text-sm text-error">{errors.template}</p>
          )}

          {isLoadingTemplates ? (
            <div className="p-8 text-center border border-border rounded-lg bg-background-secondary">
              <Loader2 className="h-12 w-12 mx-auto mb-3 text-text-tertiary animate-spin" />
              <p className="text-text-secondary">Loading templates...</p>
            </div>
          ) : availableTemplates.length === 0 ? (
            <div className="p-8 text-center border border-border rounded-lg bg-background-secondary">
              <FileText className="h-12 w-12 mx-auto mb-3 text-text-tertiary" />
              <p className="text-text-secondary mb-1">No templates available</p>
              <p className="text-sm text-text-tertiary">
                {config.role && config.seniority
                  ? "No pre-built templates match your role and seniority selection."
                  : "Please select a role and seniority level first."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableTemplates.map((template) => (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-all ${
                    config.templateId === template.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border-secondary"
                  }`}
                  onClick={() => handleTemplateSelect(template.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {template.description}
                        </CardDescription>
                      </div>
                      <Checkbox
                        checked={config.templateId === template.id}
                        onChange={() => handleTemplateSelect(template.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-4 text-sm text-text-tertiary">
                      <span>📋 {template.problemCount} problems</span>
                      <span>⏱️ ~{template.estimatedDuration} min</span>
                      <Badge variant="default" className="text-xs">
                        Curated
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {config.templateId && (
            <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
              <p className="text-sm text-text-secondary">
                💡 This template includes pre-configured questions, difficulty distribution,
                and evaluation criteria optimized for the selected role and level.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Adaptive Assessment */}
        <TabsContent value="incremental" className="space-y-4 mt-4">
          {!canAddCustomQuestions ? (
            <div className="p-8 text-center border border-warning/20 rounded-lg bg-warning/5">
              <Lock className="h-12 w-12 mx-auto mb-3 text-warning" />
              <h4 className="font-medium text-text-primary mb-2">
                Adaptive Assessments Require Upgrade
              </h4>
              <p className="text-sm text-text-secondary mb-4">
                AI-powered adaptive assessments are available in Medium Pack and higher tiers.
              </p>
              <Button variant="primary" size="sm">
                Upgrade to Medium Pack
              </Button>
            </div>
          ) : (
            <>
              {errors.incrementalConfig && (
                <p className="text-sm text-error">{errors.incrementalConfig}</p>
              )}

              <IncrementalSeedForm
                config={config.incrementalConfig || {}}
                onUpdate={(updates) => onUpdate({ incrementalConfig: updates as any })}
                errors={errors}
              />

              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  How Adaptive Assessments Work
                </h4>
                <ul className="space-y-1 text-sm text-text-secondary">
                  <li>• Start with a base problem to establish baseline performance</li>
                  <li>• AI analyzes candidate progress and adapts difficulty dynamically</li>
                  <li>• Questions build incrementally on previous work</li>
                  <li>• 2-5 questions generated based on 70% expertise threshold</li>
                  <li>• Fair scoring with LLM-based difficulty calibration</li>
                </ul>
              </div>
            </>
          )}
        </TabsContent>

        {/* Custom Questions */}
        <TabsContent value="custom" className="space-y-4 mt-4">
          {!canAddCustomQuestions ? (
            <div className="p-8 text-center border border-warning/20 rounded-lg bg-warning/5">
              <Lock className="h-12 w-12 mx-auto mb-3 text-warning" />
              <h4 className="font-medium text-text-primary mb-2">
                Custom Questions Require Upgrade
              </h4>
              <p className="text-sm text-text-secondary mb-4">
                Custom question configuration is available in Medium Pack and higher tiers.
              </p>
              <Button variant="primary" size="sm">
                Upgrade to Medium Pack
              </Button>
            </div>
          ) : (
            <>
              {errors.customQuestions && (
                <p className="text-sm text-error">{errors.customQuestions}</p>
              )}

              {/* Question Seeds List */}
              {localSeeds.length === 0 ? (
                <div className="p-8 text-center border border-border rounded-lg bg-background-secondary">
                  <Sparkles className="h-12 w-12 mx-auto mb-3 text-text-tertiary" />
                  <p className="text-text-secondary mb-1">No custom questions yet</p>
                  <p className="text-sm text-text-tertiary mb-4">
                    Add instructions to generate tailored assessment questions
                  </p>
                  <Button variant="primary" size="sm" onClick={handleAddCustomSeed}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Question Configuration
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {localSeeds.map((seed, index) => (
                    <Card key={index} className="border-border-secondary">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">
                            Question Configuration #{index + 1}
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveSeed(index)}
                          >
                            <Trash2 className="h-4 w-4 text-error" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label required>LLM Instructions</Label>
                          <Textarea
                            value={seed.instructions}
                            onChange={(e) =>
                              handleUpdateSeed(index, { instructions: e.target.value })
                            }
                            placeholder="Describe what kind of problem you want the LLM to generate. Be specific about the context, requirements, and skills being evaluated..."
                            rows={4}
                            className="mt-2"
                          />
                          <p className="text-xs text-text-tertiary mt-1">
                            These instructions guide the AI in generating relevant coding
                            problems
                          </p>
                        </div>

                        <div>
                          <Label>Focus Topics (Optional)</Label>
                          <Input
                            value={seed.topics?.join(", ") || ""}
                            onChange={(e) =>
                              handleUpdateSeed(index, {
                                topics: e.target.value
                                  .split(",")
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="e.g., REST APIs, Authentication, Database Design"
                            className="mt-2"
                          />
                          <p className="text-xs text-text-tertiary mt-1">
                            Comma-separated topics to focus on
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Add Another Button */}
                  {!hasReachedLimit && (
                    <Button
                      variant="outline"
                      onClick={handleAddCustomSeed}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Another Question Configuration
                    </Button>
                  )}

                  {hasReachedLimit && (
                    <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg">
                      <p className="text-sm text-text-secondary">
                        ⚠️ You've reached the limit of {customQuestionLimit} custom question
                        configurations for your tier. Upgrade for more.
                      </p>
                    </div>
                  )}

                  {/* Limit Indicator */}
                  {typeof customQuestionLimit === "number" && (
                    <p className="text-xs text-text-tertiary text-center">
                      {localSeeds.length} of {customQuestionLimit} custom question
                      configurations used
                    </p>
                  )}
                </div>
              )}

              {/* Info */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="text-sm font-medium text-text-primary mb-2">
                  💡 Writing Effective Instructions
                </h4>
                <ul className="space-y-1 text-sm text-text-secondary">
                  <li>• Be specific about the problem context and requirements</li>
                  <li>• Describe the skills and knowledge you want to evaluate</li>
                  <li>• Include any technology constraints (e.g., "must use React hooks")</li>
                  <li>
                    • Specify complexity level (e.g., "suitable for mid-level developers")
                  </li>
                </ul>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* AI Configuration */}
      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-medium text-text-primary mb-3">AI Assistant Settings</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={config.aiAssistanceEnabled ?? true}
              onChange={(e) =>
                onUpdate({ aiAssistanceEnabled: e.target.checked })
              }
            />
            <div className="flex-1">
              <Label className="cursor-pointer">Enable InterviewLM AI Assistant</Label>
              <p className="text-xs text-text-tertiary mt-1">
                Allow candidates to use AI coding assistance during the assessment
              </p>
            </div>
          </div>

          {config.aiAssistanceEnabled && (
            <div className="flex items-start gap-3 ml-6">
              <Checkbox
                checked={config.aiMonitoringEnabled ?? true}
                onChange={(e) =>
                  onUpdate({ aiMonitoringEnabled: e.target.checked })
                }
              />
              <div className="flex-1">
                <Label className="cursor-pointer">Monitor AI Interactions</Label>
                <p className="text-xs text-text-tertiary mt-1">
                  Track and analyze how candidates interact with AI (prompt quality,
                  iteration patterns)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Summary Panel (Right Side) */}
      {showSummary && (
        <div className="lg:w-80 lg:flex-shrink-0">
          <Card className="border-border-secondary sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Assessment Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Role & Duration */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-text-secondary">Target:</span>
                  <span className="font-medium text-text-primary">
                    {config.seniority && seniorityLevels[config.seniority]
                      ? seniorityLevels[config.seniority].name
                      : ""}{" "}
                    {config.role && roles[config.role]
                      ? roles[config.role].name
                      : "Not selected"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-text-secondary">Duration:</span>
                  <span className="font-medium text-text-primary">
                    {config.duration || 0} minutes
                  </span>
                </div>
              </div>

              {/* Tech Stack */}
              {techStackSummary.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-text-secondary">Tech Stack:</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {techStackSummary.map((tech) => (
                      <Badge key={tech} variant="default" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                    {config.techStackRequirements &&
                      config.techStackRequirements.required.length +
                        config.techStackRequirements.optional.length >
                        5 && (
                        <Badge variant="default" className="text-xs">
                          +
                          {config.techStackRequirements.required.length +
                            config.techStackRequirements.optional.length -
                            5}{" "}
                          more
                        </Badge>
                      )}
                  </div>
                </div>
              )}

              {/* Question Config */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-text-secondary">Questions:</span>
                </div>
                {config.useTemplate && selectedTemplate ? (
                  <div className="text-sm">
                    <p className="font-medium text-text-primary">
                      {selectedTemplate.name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {selectedTemplate.problemCount} problems
                    </p>
                  </div>
                ) : config.useIncremental ? (
                  <div className="text-sm">
                    <Badge variant="primary" className="text-xs">
                      Adaptive
                    </Badge>
                    <p className="text-xs text-text-tertiary mt-1">
                      AI-powered question generation
                    </p>
                  </div>
                ) : localSeeds.length > 0 ? (
                  <div className="text-sm">
                    <p className="font-medium text-text-primary">
                      {localSeeds.length} custom seed(s)
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-text-tertiary">Not configured</p>
                )}
              </div>

              {/* AI Settings */}
              <div className="space-y-1 pt-2 border-t border-border text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">AI Assistance</span>
                  <span
                    className={
                      config.aiAssistanceEnabled
                        ? "text-success font-medium"
                        : "text-text-tertiary"
                    }
                  >
                    {config.aiAssistanceEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {config.aiAssistanceEnabled && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">AI Monitoring</span>
                    <span
                      className={
                        config.aiMonitoringEnabled
                          ? "text-success font-medium"
                          : "text-text-tertiary"
                      }
                    >
                      {config.aiMonitoringEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                )}
              </div>

              {/* Tier Badge */}
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">Your Tier</span>
                  <Badge variant="primary">{userTier.toUpperCase()}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Helper Input component (if not already available)
function Input({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary ${className}`}
    />
  );
}
