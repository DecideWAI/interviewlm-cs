"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  X,
  Sparkles,
  RefreshCw,
  Save,
  Target,
  Clock,
  Code,
  CheckCircle2,
  AlertCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratedProblem } from "@/types/problem";
import type { EnhancedQuestionSeed } from "@/lib/mock-seeds-data";

interface SeedPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  seed: EnhancedQuestionSeed;
  tier: "free" | "pay_as_you_go" | "medium" | "enterprise";
  previewsRemaining: number;
  previewsLimit: number;
}

// Mock generated problem (in production, this would call LLM API)
const generateMockProblem = (seed: EnhancedQuestionSeed): GeneratedProblem => {
  return {
    id: `problem-${Date.now()}`,
    seedId: seed.id,
    title: `${seed.title} - Sample Implementation`,
    description: `Build a ${seed.title.toLowerCase()} that demonstrates clean code, proper testing, and modern best practices. This problem assesses your ability to work with AI coding tools to implement production-quality solutions.`,
    requirements: [
      "Implement core functionality according to specifications",
      "Write comprehensive test cases with edge case coverage",
      "Use AI assistance effectively for code generation and debugging",
      "Follow clean code principles and best practices",
      "Document your code with clear comments",
    ],
    difficulty: "medium", // Could be derived from difficultyDistribution
    estimatedTime: seed.estimatedTime,
    language: "typescript",
    starterCode: [
      {
        fileName: "index.ts",
        content: `// TODO: Implement your solution here\n\nexport function solution(input: string): string {\n  // Your code here\n  return "";\n}\n`,
      },
      {
        fileName: "index.test.ts",
        content: `import { solution } from "./index";\n\ndescribe("Solution", () => {\n  it("should pass basic test", () => {\n    expect(solution("test")).toBeDefined();\n  });\n});\n`,
      },
    ],
    testCases: [
      {
        name: "Basic functionality",
        input: '{"data": "test"}',
        expectedOutput: '{"result": "success"}',
        hidden: false,
      },
      {
        name: "Edge case - empty input",
        input: '{"data": ""}',
        expectedOutput: '{"result": "error"}',
        hidden: false,
      },
      {
        name: "Performance test",
        input: '{"data": "large_dataset"}',
        expectedOutput: '{"result": "success"}',
        hidden: true,
      },
    ],
    generatedAt: new Date().toISOString(),
    generatedBy: "llm",
  };
};

export function SeedPreviewModal({
  isOpen,
  onClose,
  seed,
  tier,
  previewsRemaining,
  previewsLimit,
}: SeedPreviewModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedProblem, setGeneratedProblem] = useState<GeneratedProblem | null>(null);

  const handleGenerate = async () => {
    if (previewsRemaining <= 0) {
      toast.error("You've reached your preview limit. Upgrade your plan for unlimited previews.");
      return;
    }

    setIsGenerating(true);

    // Simulate LLM generation delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const problem = generateMockProblem(seed);
    setGeneratedProblem(problem);
    setIsGenerating(false);
  };

  const handleRegenerate = () => {
    setGeneratedProblem(null);
    handleGenerate();
  };

  const handleSaveAsTemplate = () => {
    toast.success("Template saved! You can now use this in assessments.");
    // In production: POST to /api/templates
  };

  const handleUseInAssessment = () => {
    toast.info("Redirecting to assessment builder...");
    // In production: Navigate to assessment builder with this problem
    onClose();
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy":
        return "text-success";
      case "medium":
        return "text-warning";
      case "hard":
        return "text-error";
      default:
        return "text-text-muted";
    }
  };

  // Add effect for escape key and body scroll lock
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
        {/* Backdrop - click to close */}
        <div
          className="absolute inset-0"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Modal content */}
        <div className="relative bg-background-secondary border border-border rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">Seed Preview</h2>
                <p className="text-sm text-text-tertiary">Generate a sample problem from this seed</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-text-tertiary">Previews Remaining</p>
                <p className="text-sm font-semibold text-text-primary">
                  {previewsRemaining}/{previewsLimit}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-background-tertiary rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-text-tertiary" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {!generatedProblem && !isGenerating && (
              <div className="text-center py-12">
                <div className="inline-flex p-4 bg-primary/10 rounded-full mb-4">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  Ready to generate a problem
                </h3>
                <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">
                  Click the button below to generate a sample problem from the &quot;{seed.title}&quot; seed using AI.
                </p>
                <div className="bg-background-tertiary border border-border rounded-lg p-4 mb-6 max-w-md mx-auto">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-info shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="text-sm text-text-secondary">
                        {tier === "free" && "Free tier: Limited to 3 previews"}
                        {tier === "pay_as_you_go" && "Pay-as-you-go: 10 previews per month"}
                        {tier === "medium" && "Medium tier: 50 previews per month"}
                        {tier === "enterprise" && "Enterprise: Unlimited previews"}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  disabled={previewsRemaining <= 0}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Preview
                </Button>
              </div>
            )}

            {isGenerating && (
              <div className="text-center py-12">
                <div className="inline-flex p-4 bg-primary/10 rounded-full mb-4 animate-pulse">
                  <Sparkles className="h-8 w-8 text-primary animate-spin" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  Generating problem...
                </h3>
                <p className="text-sm text-text-secondary">
                  AI is creating a unique problem based on your seed instructions
                </p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            {generatedProblem && (
              <div className="space-y-6">
                {/* Problem Header */}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-2xl font-bold text-text-primary">{generatedProblem.title}</h3>
                    <Badge
                      variant={
                        generatedProblem.difficulty === "easy"
                          ? "success"
                          : generatedProblem.difficulty === "medium"
                          ? "warning"
                          : "error"
                      }
                      className="capitalize"
                    >
                      {generatedProblem.difficulty}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-text-tertiary">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{generatedProblem.estimatedTime} minutes</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Code className="h-4 w-4" />
                      <span className="capitalize">{generatedProblem.language}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <Card className="bg-background-tertiary border-border p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-2">Description</h4>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {generatedProblem.description}
                  </p>
                </Card>

                {/* Requirements */}
                <Card className="bg-background-tertiary border-border p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-3">Requirements</h4>
                  <ul className="space-y-2">
                    {generatedProblem.requirements.map((req, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-text-secondary">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </Card>

                {/* Starter Code */}
                <Card className="bg-background-tertiary border-border p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-3">Starter Code</h4>
                  <div className="space-y-3">
                    {generatedProblem.starterCode.map((file, idx) => (
                      <div key={idx}>
                        <div className="flex items-center gap-2 mb-2">
                          <Code className="h-4 w-4 text-text-tertiary" />
                          <span className="text-xs font-mono text-text-tertiary">{file.fileName}</span>
                        </div>
                        <pre className="bg-background p-3 rounded border border-border overflow-x-auto">
                          <code className="text-xs font-mono text-text-secondary">{file.content}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Test Cases */}
                <Card className="bg-background-tertiary border-border p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-3">Test Cases</h4>
                  <div className="space-y-2">
                    {generatedProblem.testCases.map((test, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-background rounded border border-border"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-primary">{test.name}</p>
                          {!test.hidden && (
                            <p className="text-xs text-text-tertiary mt-1">
                              Input: {test.input} → Output: {test.expectedOutput}
                            </p>
                          )}
                        </div>
                        {test.hidden && (
                          <Badge variant="default" className="text-xs">
                            Hidden
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Metadata */}
                <div className="text-xs text-text-tertiary">
                  Generated {new Date(generatedProblem.generatedAt).toLocaleString()} • Seed ID: {seed.id}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {generatedProblem && (
            <div className="flex items-center justify-between p-6 border-t border-border bg-background">
              <Button variant="outline" onClick={handleRegenerate} disabled={previewsRemaining <= 0}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSaveAsTemplate}>
                  <Save className="h-4 w-4 mr-2" />
                  Save as Template
                </Button>
                <Button variant="primary" onClick={handleUseInAssessment}>
                  <Target className="h-4 w-4 mr-2" />
                  Use in Assessment
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
