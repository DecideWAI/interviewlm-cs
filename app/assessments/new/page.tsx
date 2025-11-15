"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssessmentWizard } from "@/components/assessment/AssessmentWizard";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { AssessmentConfig } from "@/types/assessment";

export default function NewAssessmentPage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  // TODO: Get user's actual tier from auth/subscription context
  const userTier = "medium"; // Mock tier for now

  const handleComplete = async (config: AssessmentConfig) => {
    setIsSaving(true);

    try {
      // Extract and flatten tech stack from techStackRequirements
      const techStack: string[] = [];
      if (config.techStackRequirements) {
        const allTech = [
          ...config.techStackRequirements.critical,
          ...config.techStackRequirements.required,
          ...config.techStackRequirements.recommended,
          ...config.techStackRequirements.optional,
        ];
        techStack.push(...allTech.map(tech => tech.name));
      }

      // Map AssessmentConfig to API request format
      const requestBody = {
        title: config.title || "",
        description: config.description || undefined,
        role: config.role || "",
        // Convert seniority to uppercase to match API enum
        seniority: (config.seniority || "mid").toUpperCase(),
        techStack: techStack.length > 0 ? techStack : ["JavaScript"], // Default to avoid validation error
        duration: config.duration || 60,
        enableCoding: config.aiAssistanceEnabled ?? true,
        enableTerminal: config.aiMonitoringEnabled ?? true,
        enableAI: config.aiAssistanceEnabled ?? true,
      };

      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create assessment");
      }

      const data = await response.json();

      // Optionally publish if status is "active"
      if (config.status === "active") {
        await fetch(`/api/assessments/${data.assessment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PUBLISHED" }),
        });
      }

      // Redirect to assessment detail page
      router.push(`/assessments/${data.assessment.id}`);
    } catch (error) {
      console.error("Error saving assessment:", error);
      alert(error instanceof Error ? error.message : "Failed to create assessment");
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/assessments");
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        <PageHeader
          title="Create New Assessment"
          description="Configure and customize your technical assessment in just a few steps"
        />

        <div className="mt-8 max-w-5xl">
          <AssessmentWizard
            userTier={userTier as any}
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        </div>

        {isSaving && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg p-6 max-w-sm">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                <p className="text-text-primary">Creating assessment...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
