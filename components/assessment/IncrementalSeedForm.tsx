"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Plus, X, AlertCircle, Check } from "lucide-react";
import type { TechSpec, TechPriority } from "@/types/seed";

interface IncrementalSeedConfig {
  domain: string;
  requiredTech: {
    languages: TechSpec[];
    frameworks: TechSpec[];
    databases: TechSpec[];
    tools?: TechSpec[];
  };
  baseProblem: {
    title: string;
    description: string;
    starterCode: string;
    estimatedTime: number;
  };
  progressionHints: {
    extensionTopics: string[];
    simplificationTopics: string[];
  };
  seniorityExpectations?: {
    junior?: string[];
    mid?: string[];
    senior?: string[];
    staff?: string[];
    principal?: string[];
  };
}

interface IncrementalSeedFormProps {
  config: Partial<IncrementalSeedConfig>;
  onUpdate: (config: Partial<IncrementalSeedConfig>) => void;
  errors?: Record<string, string>;
}

export function IncrementalSeedForm({ config, onUpdate, errors = {} }: IncrementalSeedFormProps) {
  const [newTech, setNewTech] = useState({ type: "languages", name: "", priority: "required" as TechPriority });
  const [newExtensionTopic, setNewExtensionTopic] = useState("");
  const [newSimplificationTopic, setNewSimplificationTopic] = useState("");

  const handleAddTech = () => {
    if (!newTech.name.trim()) return;

    const techSpec: TechSpec = {
      name: newTech.name.trim().toLowerCase(),
      priority: newTech.priority,
    };

    const currentTech = config.requiredTech || { languages: [], frameworks: [], databases: [], tools: [] };
    const techArray = currentTech[newTech.type as keyof typeof currentTech] || [];

    onUpdate({
      requiredTech: {
        ...currentTech,
        [newTech.type]: [...techArray, techSpec],
      },
    });

    setNewTech({ ...newTech, name: "" });
  };

  const handleRemoveTech = (type: string, index: number) => {
    const currentTech = config.requiredTech || { languages: [], frameworks: [], databases: [], tools: [] };
    const techArray = [...(currentTech[type as keyof typeof currentTech] || [])];
    techArray.splice(index, 1);

    onUpdate({
      requiredTech: {
        ...currentTech,
        [type]: techArray,
      },
    });
  };

  const handleAddExtensionTopic = () => {
    if (!newExtensionTopic.trim()) return;

    const currentHints = config.progressionHints || { extensionTopics: [], simplificationTopics: [] };
    onUpdate({
      progressionHints: {
        ...currentHints,
        extensionTopics: [...currentHints.extensionTopics, newExtensionTopic.trim()],
      },
    });
    setNewExtensionTopic("");
  };

  const handleAddSimplificationTopic = () => {
    if (!newSimplificationTopic.trim()) return;

    const currentHints = config.progressionHints || { extensionTopics: [], simplificationTopics: [] };
    onUpdate({
      progressionHints: {
        ...currentHints,
        simplificationTopics: [...currentHints.simplificationTopics, newSimplificationTopic.trim()],
      },
    });
    setNewSimplificationTopic("");
  };

  const handleRemoveTopic = (type: "extensionTopics" | "simplificationTopics", index: number) => {
    const currentHints = config.progressionHints || { extensionTopics: [], simplificationTopics: [] };
    const topics = [...currentHints[type]];
    topics.splice(index, 1);

    onUpdate({
      progressionHints: {
        ...currentHints,
        [type]: topics,
      },
    });
  };

  const getPriorityColor = (priority: TechPriority) => {
    switch (priority) {
      case "critical":
        return "error";
      case "required":
        return "warning";
      case "recommended":
        return "default";
    }
  };

  const getPriorityIcon = (priority: TechPriority) => {
    switch (priority) {
      case "critical":
        return "🔴";
      case "required":
        return "🟡";
      case "recommended":
        return "🟢";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            Adaptive Assessment Configuration
          </h3>
          <p className="text-xs text-text-secondary">
            Create assessments where questions adapt based on candidate performance. Define a base
            problem and the system will generate 2-5 incremental questions tailored to each
            candidate's skill level.
          </p>
        </div>
      </div>

      {/* Domain */}
      <div>
        <Label required>Domain / Context</Label>
        <Input
          value={config.domain || ""}
          onChange={(e) => onUpdate({ domain: e.target.value })}
          placeholder="e.g., E-commerce, Social Media, FinTech, Healthcare"
          className="mt-2"
        />
        {errors.domain && <p className="text-xs text-error mt-1">{errors.domain}</p>}
        <p className="text-xs text-text-tertiary mt-1">
          The business domain or application context for all questions
        </p>
      </div>

      {/* Required Tech Stack */}
      <Card className="border-border-secondary">
        <CardHeader>
          <CardTitle className="text-base">Required Technology Stack</CardTitle>
          <CardDescription>
            Specify technologies that candidates must use. Critical tech violations will block
            question completion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tech Stack Display */}
          <div className="space-y-3">
            {["languages", "frameworks", "databases", "tools"].map((type) => {
              const techs = config.requiredTech?.[type as keyof typeof config.requiredTech] || [];
              if (techs.length === 0) return null;

              return (
                <div key={type}>
                  <Label className="text-xs capitalize">{type}</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {techs.map((tech: TechSpec, index: number) => (
                      <Badge
                        key={index}
                        variant={getPriorityColor(tech.priority)}
                        className="gap-1.5 group"
                      >
                        {getPriorityIcon(tech.priority)} {tech.name}
                        {tech.version && <span className="text-xs opacity-75">v{tech.version}</span>}
                        <button
                          onClick={() => handleRemoveTech(type, index)}
                          className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Tech */}
          <div className="flex gap-2">
            <Select
              value={newTech.type}
              onValueChange={(value) => setNewTech({ ...newTech, type: value })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="languages">Language</SelectItem>
                <SelectItem value="frameworks">Framework</SelectItem>
                <SelectItem value="databases">Database</SelectItem>
                <SelectItem value="tools">Tool</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={newTech.name}
              onChange={(e) => setNewTech({ ...newTech, name: e.target.value })}
              placeholder="e.g., Python, FastAPI, MongoDB"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTech();
                }
              }}
            />

            <Select
              value={newTech.priority}
              onValueChange={(value) => setNewTech({ ...newTech, priority: value as TechPriority })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">🔴 Critical</SelectItem>
                <SelectItem value="required">🟡 Required</SelectItem>
                <SelectItem value="recommended">🟢 Recommended</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleAddTech} variant="outline" size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {errors.requiredTech && <p className="text-xs text-error">{errors.requiredTech}</p>}

          {/* Priority Legend */}
          <div className="p-3 bg-background-tertiary rounded border border-border text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span>🔴 <strong>Critical:</strong></span>
              <span className="text-text-tertiary">MUST use or question fails</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🟡 <strong>Required:</strong></span>
              <span className="text-text-tertiary">Should use, flagged if missing</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🟢 <strong>Recommended:</strong></span>
              <span className="text-text-tertiary">Optional, bonus if used</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Base Problem */}
      <Card className="border-border-secondary">
        <CardHeader>
          <CardTitle className="text-base">Base Problem (Question 1)</CardTitle>
          <CardDescription>
            The starting point for all candidates. Should be substantial (20-30 minutes) and use the
            required tech stack.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label required>Problem Title</Label>
            <Input
              value={config.baseProblem?.title || ""}
              onChange={(e) =>
                onUpdate({
                  baseProblem: { ...config.baseProblem, title: e.target.value } as any,
                })
              }
              placeholder="e.g., Build a Product Catalog API"
              className="mt-2"
            />
            {errors["baseProblem.title"] && (
              <p className="text-xs text-error mt-1">{errors["baseProblem.title"]}</p>
            )}
          </div>

          <div>
            <Label required>Problem Description</Label>
            <Textarea
              value={config.baseProblem?.description || ""}
              onChange={(e) =>
                onUpdate({
                  baseProblem: { ...config.baseProblem, description: e.target.value } as any,
                })
              }
              placeholder="Describe the problem context, requirements, and expectations..."
              rows={6}
              className="mt-2"
            />
            {errors["baseProblem.description"] && (
              <p className="text-xs text-error mt-1">{errors["baseProblem.description"]}</p>
            )}
            <p className="text-xs text-text-tertiary mt-1">
              Include specific requirements, constraints, and what you're evaluating
            </p>
          </div>

          <div>
            <Label>Starter Code (Optional)</Label>
            <Textarea
              value={config.baseProblem?.starterCode || ""}
              onChange={(e) =>
                onUpdate({
                  baseProblem: { ...config.baseProblem, starterCode: e.target.value } as any,
                })
              }
              placeholder="// Starter code or TODO comments..."
              rows={4}
              className="mt-2 font-mono text-sm"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Provide scaffolding code or TODOs to guide candidates
            </p>
          </div>

          <div>
            <Label required>Estimated Time (minutes)</Label>
            <Input
              type="number"
              min={10}
              max={60}
              value={config.baseProblem?.estimatedTime || 25}
              onChange={(e) =>
                onUpdate({
                  baseProblem: {
                    ...config.baseProblem,
                    estimatedTime: parseInt(e.target.value) || 25,
                  } as any,
                })
              }
              className="mt-2"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Recommended: 20-30 minutes for substantial problems
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Progression Hints */}
      <Card className="border-border-secondary">
        <CardHeader>
          <CardTitle className="text-base">Progression Hints</CardTitle>
          <CardDescription>
            Guide how questions adapt based on candidate performance. Questions 2-5 are generated
            dynamically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Extension Topics */}
          <div>
            <Label>Extension Topics (for high performers)</Label>
            <div className="space-y-2 mt-2">
              {config.progressionHints?.extensionTopics?.map((topic, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success flex-shrink-0" />
                  <span className="flex-1 text-sm text-text-primary">{topic}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveTopic("extensionTopics", index)}
                  >
                    <X className="h-4 w-4 text-error" />
                  </Button>
                </div>
              ))}

              <div className="flex gap-2">
                <Input
                  value={newExtensionTopic}
                  onChange={(e) => setNewExtensionTopic(e.target.value)}
                  placeholder="e.g., Add caching layer, Implement rate limiting"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddExtensionTopic();
                    }
                  }}
                />
                <Button onClick={handleAddExtensionTopic} variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-text-tertiary mt-1">
              Topics to explore when candidates score ≥75% - adds complexity
            </p>
          </div>

          {/* Simplification Topics */}
          <div>
            <Label>Simplification Topics (for struggling candidates)</Label>
            <div className="space-y-2 mt-2">
              {config.progressionHints?.simplificationTopics?.map((topic, index) => (
                <div key={index} className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
                  <span className="flex-1 text-sm text-text-primary">{topic}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveTopic("simplificationTopics", index)}
                  >
                    <X className="h-4 w-4 text-error" />
                  </Button>
                </div>
              ))}

              <div className="flex gap-2">
                <Input
                  value={newSimplificationTopic}
                  onChange={(e) => setNewSimplificationTopic(e.target.value)}
                  placeholder="e.g., Basic validation, Simple error handling"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSimplificationTopic();
                    }
                  }}
                />
                <Button onClick={handleAddSimplificationTopic} variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-text-tertiary mt-1">
              Topics to focus on when candidates score &lt;50% - provides support
            </p>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <div className="p-4 bg-background-tertiary rounded border border-border">
        <h4 className="text-sm font-medium text-text-primary mb-3">How Adaptive Assessments Work</h4>
        <ul className="space-y-2 text-xs text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-primary">1.</span>
            <span>All candidates start with the same base problem (Q1)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">2.</span>
            <span>
              After completing each question, the system analyzes performance and generates Q2-Q5
              dynamically
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">3.</span>
            <span>
              High performers (≥75%) get extension topics, struggling candidates (&lt;50%) get
              simplification topics
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">4.</span>
            <span>
              LLM-based difficulty calibration ensures fair scoring - harder questions earn more
              points
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">5.</span>
            <span>Candidates typically complete 2-3 questions, max 5 for exceptional performers</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
