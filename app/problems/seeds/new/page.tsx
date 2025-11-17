"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Save,
  Sparkles,
  Eye,
  Plus,
  X,
  HelpCircle,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import { ROLES, SENIORITY_LEVELS, TIER_LIMITS } from "@/lib/assessment-config";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function NewSeedPage() {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("backend");
  const [seniority, setSeniority] = useState("mid");
  const [estimatedTime, setEstimatedTime] = useState(45);
  const [instructions, setInstructions] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [examples, setExamples] = useState<string[]>([""]);

  // Difficulty distribution
  const [difficultyEasy, setDifficultyEasy] = useState(20);
  const [difficultyMedium, setDifficultyMedium] = useState(60);
  const [difficultyHard, setDifficultyHard] = useState(20);

  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Current user tier (mock - would come from auth context)
  const currentTier = "medium";
  const tierLimits = TIER_LIMITS[currentTier];

  const handleAddTopic = () => {
    if (newTopic.trim() && !topics.includes(newTopic.trim())) {
      setTopics([...topics, newTopic.trim()]);
      setNewTopic("");
    }
  };

  const handleRemoveTopic = (topic: string) => {
    setTopics(topics.filter((t) => t !== topic));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAddExample = () => {
    setExamples([...examples, ""]);
  };

  const handleRemoveExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };

  const handleExampleChange = (index: number, value: string) => {
    const newExamples = [...examples];
    newExamples[index] = value;
    setExamples(newExamples);
  };

  // Validate difficulty distribution totals 100%
  const totalDifficulty = difficultyEasy + difficultyMedium + difficultyHard;
  const isDifficultyValid = totalDifficulty === 100;

  const isFormValid = () => {
    return (
      title.trim() !== "" &&
      instructions.trim() !== "" &&
      topics.length > 0 &&
      isDifficultyValid
    );
  };

  const handleSave = async (status: "draft" | "active") => {
    if (!isFormValid()) return;

    setIsSaving(true);

    try {
      // Determine difficulty based on distribution
      // Use the highest percentage as the primary difficulty
      const difficulties = [
        { level: "EASY", value: difficultyEasy },
        { level: "MEDIUM", value: difficultyMedium },
        { level: "HARD", value: difficultyHard },
      ];
      const primaryDifficulty = difficulties.reduce((max, curr) =>
        curr.value > max.value ? curr : max
      ).level;

      // Prepare seed data for API
      const seedData = {
        title,
        description,
        difficulty: primaryDifficulty as "EASY" | "MEDIUM" | "HARD",
        category: role, // Use role as category
        tags: tags.filter((t) => t.trim() !== ""),
        topics: topics.filter((t) => t.trim() !== ""),
        language: "javascript", // Default language
        instructions,
        estimatedTime,
        status,
      };

      const response = await fetch("/api/seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seedData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create seed");
      }

      const data = await response.json();
      console.log("Seed created:", data.seed);

      // Redirect to problems page
      router.push("/problems");
    } catch (error) {
      console.error("Error saving seed:", error);
      alert(error instanceof Error ? error.message : "Failed to create seed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/problems">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <PageHeader
              title="Create Problem Seed"
              description="Define an LLM instruction template to generate assessment questions"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Basic Information
              </h3>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="text-sm text-text-secondary mb-2 block">
                    Title *
                  </label>
                  <Input
                    placeholder="e.g., REST API with Authentication"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm text-text-secondary mb-2 block">
                    Description
                  </label>
                  <Textarea
                    placeholder="Brief description of what this seed generates"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Role & Seniority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-text-secondary mb-2 block">
                      Target Role *
                    </label>
                    <Select value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="any">Any Role</option>
                      {Object.values(ROLES).filter(r => r.id !== "custom").map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm text-text-secondary mb-2 block">
                      Target Seniority *
                    </label>
                    <Select value={seniority} onChange={(e) => setSeniority(e.target.value)}>
                      <option value="any">Any Level</option>
                      {Object.values(SENIORITY_LEVELS).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Estimated Time */}
                <div>
                  <label className="text-sm text-text-secondary mb-2 block">
                    Estimated Time (minutes) *
                  </label>
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    value={estimatedTime}
                    onChange={(e) => setEstimatedTime(parseInt(e.target.value) || 45)}
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="text-sm text-text-secondary mb-2 block">
                    Tags
                  </label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add a tag (e.g., API, Security)"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" onClick={handleAddTag}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="default" className="gap-1">
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-error transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* LLM Instructions */}
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">
                  LLM Instructions
                </h3>
                <div className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Lightbulb className="h-4 w-4" />
                  Be specific and detailed
                </div>
              </div>

              <div className="space-y-4">
                {/* Instructions */}
                <div>
                  <label className="text-sm text-text-secondary mb-2 block">
                    Instructions *
                  </label>
                  <Textarea
                    placeholder="Detailed instructions for the LLM to generate a problem. Be specific about requirements, constraints, technologies, and evaluation criteria."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    {instructions.length} characters
                  </p>
                </div>

                {/* Topics */}
                <div>
                  <label className="text-sm text-text-secondary mb-2 block">
                    Topics * (Skills to assess)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add a topic (e.g., REST APIs, Authentication)"
                      value={newTopic}
                      onChange={(e) => setNewTopic(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTopic();
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" onClick={handleAddTopic}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((topic) => (
                      <Badge key={topic} variant="primary" className="gap-1">
                        {topic}
                        <button
                          onClick={() => handleRemoveTopic(topic)}
                          className="hover:text-error transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Difficulty Distribution */}
                <div>
                  <label className="text-sm text-text-secondary mb-3 block">
                    Difficulty Distribution *
                  </label>

                  <div className="space-y-3">
                    {/* Easy */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-text-tertiary">Easy</span>
                        <span className="text-xs font-medium text-success">{difficultyEasy}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={difficultyEasy}
                        onChange={(e) => setDifficultyEasy(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    {/* Medium */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-text-tertiary">Medium</span>
                        <span className="text-xs font-medium text-warning">{difficultyMedium}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={difficultyMedium}
                        onChange={(e) => setDifficultyMedium(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    {/* Hard */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-text-tertiary">Hard</span>
                        <span className="text-xs font-medium text-error">{difficultyHard}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={difficultyHard}
                        onChange={(e) => setDifficultyHard(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    {/* Total */}
                    <div className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      isDifficultyValid
                        ? "bg-success/10 border-success/30 text-success"
                        : "bg-error/10 border-error/30 text-error"
                    )}>
                      <span className="text-sm font-medium">Total</span>
                      <span className="text-sm font-bold">{totalDifficulty}%</span>
                    </div>
                    {!isDifficultyValid && (
                      <p className="text-xs text-error flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Distribution must total 100%
                      </p>
                    )}
                  </div>
                </div>

                {/* Examples */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-text-secondary">
                      Examples (Optional)
                    </label>
                    <Button variant="ghost" size="sm" onClick={handleAddExample}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Example
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {examples.map((example, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder={`Example ${index + 1}`}
                          value={example}
                          onChange={(e) => handleExampleChange(index, e.target.value)}
                          className="font-mono text-sm"
                        />
                        {examples.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveExample(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                Actions
              </h3>

              <div className="space-y-3">
                {/* Preview (Tier-gated) */}
                <div>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={
                      !isFormValid() ||
                      (tierLimits.previewTestRuns === 0 || tierLimits.previewTestRuns === "unlimited")
                    }
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Generation
                  </Button>
                  {tierLimits.previewTestRuns === 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      Upgrade to preview problems
                    </p>
                  )}
                  {typeof tierLimits.previewTestRuns === "number" && tierLimits.previewTestRuns > 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      {tierLimits.previewTestRuns} previews/month
                    </p>
                  )}
                </div>

                <div className="border-t border-border pt-3 space-y-2">
                  {/* Save as Draft */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSave("draft")}
                    disabled={!isFormValid() || isSaving}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? "Saving..." : "Save as Draft"}
                  </Button>

                  {/* Save and Activate */}
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => handleSave("active")}
                    disabled={!isFormValid() || isSaving}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isSaving ? "Saving..." : "Save & Activate"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Help */}
            <div className="bg-background-secondary border border-border-secondary rounded-lg p-6">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-semibold text-text-primary">
                  Writing Great Seeds
                </h3>
              </div>

              <div className="space-y-3 text-sm text-text-secondary">
                <div>
                  <p className="font-medium text-text-primary mb-1">Be Specific</p>
                  <p className="text-xs text-text-tertiary">
                    Include exact technologies, frameworks, and patterns you want tested
                  </p>
                </div>

                <div>
                  <p className="font-medium text-text-primary mb-1">Set Constraints</p>
                  <p className="text-xs text-text-tertiary">
                    Define time limits, complexity, and edge cases to consider
                  </p>
                </div>

                <div>
                  <p className="font-medium text-text-primary mb-1">Add Context</p>
                  <p className="text-xs text-text-tertiary">
                    Provide realistic scenarios and business requirements
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
