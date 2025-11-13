"use client";

import { TechStackRequirements } from "@/types/assessment";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

interface TestCase {
  name: string;
  input: string;
  expectedOutput: string;
  hidden: boolean;
}

interface ProblemPanelProps {
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  constraints?: string[];
  examples?: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  testCases?: TestCase[];
  techStack?: TechStackRequirements;
}

export function ProblemPanel({
  title,
  description,
  difficulty,
  constraints = [],
  examples = [],
  testCases = [],
  techStack,
}: ProblemPanelProps) {
  const visibleTestCases = testCases.filter((tc) => !tc.hidden);

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Problem</h2>
          <Badge
            variant={
              difficulty === "easy"
                ? "success"
                : difficulty === "medium"
                ? "warning"
                : "error"
            }
            className="text-xs"
          >
            {difficulty.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-lg font-bold text-text-primary mb-2">{title}</h1>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {description}
          </p>
        </div>

        {/* Examples */}
        {examples.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Examples
            </h3>
            <div className="space-y-3">
              {examples.map((example, idx) => (
                <Card key={idx} className="bg-background-secondary border-border p-3">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-medium text-text-tertiary mb-1">
                        Input:
                      </p>
                      <code className="text-xs font-mono bg-background-tertiary px-2 py-1 rounded text-primary">
                        {example.input}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-tertiary mb-1">
                        Output:
                      </p>
                      <code className="text-xs font-mono bg-background-tertiary px-2 py-1 rounded text-success">
                        {example.output}
                      </code>
                    </div>
                    {example.explanation && (
                      <p className="text-xs text-text-secondary mt-2">
                        {example.explanation}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Constraints */}
        {constraints.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Constraints
            </h3>
            <ul className="space-y-1.5">
              {constraints.map((constraint, idx) => (
                <li key={idx} className="text-xs text-text-secondary flex items-start gap-2">
                  <span className="text-text-tertiary mt-0.5">•</span>
                  <span>{constraint}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tech Stack Requirements */}
        {techStack && (
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <span className="text-base">🎯</span>
              Tech Stack Requirements
            </h3>

            {techStack.critical.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🔴</span>
                  <p className="text-xs font-medium text-text-secondary">
                    CRITICAL (Must Use):
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {techStack.critical.map((tech) => (
                    <Badge key={tech.id} variant="error" className="text-xs">
                      {tech.name}
                      {tech.version && (
                        <span className="ml-1 opacity-70">{tech.version}</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {techStack.recommended.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🟡</span>
                  <p className="text-xs font-medium text-text-secondary">
                    RECOMMENDED:
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {techStack.recommended.map((tech) => (
                    <Badge key={tech.id} variant="info" className="text-xs">
                      {tech.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {techStack.critical.length > 0 && (
              <Card className="bg-error/5 border-error/20 p-3 mt-3">
                <p className="text-xs text-text-tertiary">
                  ⚠️ <strong>IMPORTANT:</strong> Using a different technology than{" "}
                  <strong className="text-error">
                    {techStack.critical.map((t) => t.name).join(", ")}
                  </strong>{" "}
                  will terminate your session immediately.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Test Cases */}
        {visibleTestCases.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Test Cases
            </h3>
            <div className="space-y-2">
              {visibleTestCases.map((testCase, idx) => (
                <Card
                  key={idx}
                  className="bg-background-secondary border-border p-3"
                >
                  <p className="text-xs font-medium text-text-primary mb-2">
                    {testCase.name}
                  </p>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-xs text-text-tertiary">Input: </span>
                      <code className="text-xs font-mono text-text-secondary">
                        {testCase.input}
                      </code>
                    </div>
                    <div>
                      <span className="text-xs text-text-tertiary">Expected: </span>
                      <code className="text-xs font-mono text-success">
                        {testCase.expectedOutput}
                      </code>
                    </div>
                  </div>
                </Card>
              ))}
              {testCases.some((tc) => tc.hidden) && (
                <p className="text-xs text-text-tertiary italic">
                  + {testCases.filter((tc) => tc.hidden).length} hidden test case(s)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Bottom Padding */}
        <div className="h-4" />
      </div>
    </div>
  );
}
