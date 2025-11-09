"use client";

import { use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Play } from "lucide-react";

// Dynamic import to avoid SSR issues with xterm.js
const InterviewPreview = dynamic(
  () => import("@/components/demo/InterviewPreview").then((mod) => ({ default: mod.InterviewPreview })),
  { ssr: false }
);

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default function AssessmentPreviewPage({ params }: PreviewPageProps) {
  const { id } = use(params);

  // TODO: Fetch actual assessment config from backend
  const mockAssessment = {
    id,
    title: "Senior Full-Stack Developer Assessment",
    role: "Full-Stack Engineer",
    seniority: "Senior",
    duration: 90,
    description: "Comprehensive assessment for senior full-stack engineering candidates",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Preview Header */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/assessments/new">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Configuration
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">
                    <Eye className="h-3 w-3 mr-1" />
                    Preview Mode
                  </Badge>
                  <h1 className="text-lg font-semibold text-text-primary">
                    {mockAssessment.title}
                  </h1>
                </div>
                <p className="text-sm text-text-tertiary">
                  {mockAssessment.role} • {mockAssessment.seniority} • {mockAssessment.duration} min
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link href={`/interview/demo`}>
                <Button variant="primary">
                  <Play className="h-4 w-4 mr-2" />
                  Start Live Preview
                </Button>
              </Link>
              <Link href="/assessments">
                <Button variant="outline">Exit Preview</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Content */}
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {/* Info Banner */}
          <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-text-primary mb-1">
                  Preview Assessment Interface
                </h3>
                <p className="text-sm text-text-secondary">
                  This is what candidates will see when they take your assessment. The interview
                  environment includes a code editor, terminal, file explorer, and AI chat.
                  Click "Start Live Preview" to experience the full interactive assessment.
                </p>
              </div>
            </div>
          </div>

          {/* Assessment Details */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="p-4 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary mb-1">Role</p>
              <p className="font-medium text-text-primary">{mockAssessment.role}</p>
            </div>
            <div className="p-4 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary mb-1">Seniority Level</p>
              <p className="font-medium text-text-primary">{mockAssessment.seniority}</p>
            </div>
            <div className="p-4 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary mb-1">Duration</p>
              <p className="font-medium text-text-primary">{mockAssessment.duration} minutes</p>
            </div>
          </div>

          {/* Interview Interface Preview */}
          <div className="border border-border-secondary rounded-lg overflow-hidden">
            <div className="bg-background-tertiary px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-text-primary">
                Candidate Interview Environment
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                Three-panel layout: File tree, code editor with terminal, and AI chat
              </p>
            </div>
            <div className="bg-background-secondary">
              <InterviewPreview />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-text-tertiary">
              💡 Test the full interactive experience with "Start Live Preview"
            </p>
            <div className="flex items-center gap-3">
              <Link href="/assessments/new">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Modify Configuration
                </Button>
              </Link>
              <Link href={`/interview/demo`}>
                <Button variant="primary">
                  <Play className="h-4 w-4 mr-2" />
                  Start Live Preview
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
