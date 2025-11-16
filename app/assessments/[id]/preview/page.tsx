"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Eye, Play, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [isStartingPreview, setIsStartingPreview] = useState(false);

  useEffect(() => {
    fetchAssessment();
  }, [id]);

  const fetchAssessment = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/assessments/${id}`);

      if (!response.ok) {
        throw new Error("Failed to fetch assessment");
      }

      const data = await response.json();
      setAssessment(data.assessment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching assessment:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartLivePreview = async () => {
    setIsStartingPreview(true);

    try {
      const response = await fetch(`/api/assessments/${id}/start-preview`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.error === "Preview limit reached") {
          toast.error("Preview Limit Reached", {
            description: data.message,
            duration: 6000,
          });
        } else {
          throw new Error(data.error || "Failed to start preview");
        }
        setIsStartingPreview(false);
        return;
      }

      // Show success message
      toast.success("Starting preview session", {
        description: `${data.remainingPreviews} preview${data.remainingPreviews !== 1 ? 's' : ''} remaining`,
        duration: 2000,
      });

      // Redirect to full interview session
      router.push(`/interview/${data.candidateId}`);
    } catch (err) {
      console.error("Error starting preview:", err);
      toast.error("Failed to start preview", {
        description: err instanceof Error ? err.message : "Unknown error",
        duration: 4000,
      });
      setIsStartingPreview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <p className="text-text-primary mb-4">{error || "Assessment not found"}</p>
          <Link href="/assessments">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Assessments
            </Button>
          </Link>
        </div>
      </div>
    );
  }

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
                    {assessment.title}
                  </h1>
                </div>
                <p className="text-sm text-text-tertiary">
                  {assessment.role} • {assessment.seniority} • {assessment.duration} min
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={handleStartLivePreview}
                disabled={isStartingPreview || (assessment.previewSessionsUsed >= assessment.previewLimit)}
                loading={isStartingPreview}
              >
                <Play className="h-4 w-4 mr-2" />
                {isStartingPreview ? "Starting..." : "Start Live Preview"}
              </Button>
              <Link href={`/assessments/${id}`}>
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
                <p className="text-xs text-text-tertiary mt-2">
                  💡 Previews remaining: <span className="font-semibold text-primary">{assessment.previewLimit - (assessment.previewSessionsUsed || 0)}</span> / {assessment.previewLimit}
                </p>
              </div>
            </div>
          </div>

          {/* Assessment Details */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="p-4 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary mb-1">Role</p>
              <p className="font-medium text-text-primary">{assessment.role}</p>
            </div>
            <div className="p-4 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary mb-1">Seniority Level</p>
              <p className="font-medium text-text-primary">{assessment.seniority}</p>
            </div>
            <div className="p-4 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary mb-1">Duration</p>
              <p className="font-medium text-text-primary">{assessment.duration} minutes</p>
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
              <Button
                variant="primary"
                onClick={handleStartLivePreview}
                disabled={isStartingPreview || (assessment.previewSessionsUsed >= assessment.previewLimit)}
                loading={isStartingPreview}
              >
                <Play className="h-4 w-4 mr-2" />
                {isStartingPreview ? "Starting..." : "Start Live Preview"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
