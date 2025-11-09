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
      // TODO: Save assessment to backend
      console.log("Saving assessment:", config);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Redirect to assessments list
      router.push("/assessments");
    } catch (error) {
      console.error("Error saving assessment:", error);
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
