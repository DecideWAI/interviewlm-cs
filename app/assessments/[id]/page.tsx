"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CandidateTable } from "@/components/analytics/CandidateTable";
import { InviteCandidateDialog } from "@/components/assessment/InviteCandidateDialog";
import {
  ArrowLeft,
  Eye,
  Users,
  Mail,
  Copy,
  Edit,
  Download,
  MoreVertical,
  CheckCircle2,
  Clock,
  BarChart3,
  Target,
  Sparkles,
  Calendar,
  Settings,
  Archive,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AssessmentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AssessmentDetailPage({ params }: AssessmentDetailPageProps) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    if (!confirm("Are you sure you want to publish this assessment? It will become active and available to candidates.")) {
      return;
    }

    setIsPublishing(true);
    try {
      const response = await fetch(`/api/assessments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PUBLISHED" }),
      });

      if (!response.ok) {
        throw new Error("Failed to publish assessment");
      }

      fetchAssessmentDetail();
    } catch (error) {
      console.error("Error publishing assessment:", error);
      alert("Failed to publish assessment. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  useEffect(() => {
    fetchAssessmentDetail();
  }, [id]);

  const fetchAssessmentDetail = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/assessments/${id}`);

      if (!response.ok) {
        throw new Error("Failed to fetch assessment details");
      }

      const data = await response.json();
      // API returns { assessment, candidates, statistics } as separate properties
      // Combine them for easier access in the component
      setAssessment({
        ...data.assessment,
        candidates: data.candidates || [],
        statistics: data.statistics || {},
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching assessment details:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !assessment) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
          <p className="text-error mb-4">{error || "Assessment not found"}</p>
          <Link href="/assessments">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Assessments
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const assessmentCandidates = assessment.candidates || [];
  const problemSeeds = assessment.questions || [];

  // API returns statistics object with specific property names
  const statistics = assessment.statistics || {
    totalCandidates: 0,
    completedCount: 0,
    inProgressCount: 0,
    invitedCount: 0,
    avgScore: null,
    completionRate: 0,
    passRate: 0,
  };

  const stats = {
    total: statistics.totalCandidates,
    completed: statistics.completedCount,
    inProgress: statistics.inProgressCount,
    invited: statistics.invitedCount,
  };

  const perf = {
    avgScore: statistics.avgScore || 0,
    completionRate: statistics.completionRate,
    passRate: statistics.passRate / 100, // API returns percentage (0-100), convert to decimal
  };

  const getStatusVariant = () => {
    switch (assessment.status) {
      case "PUBLISHED": return "success";
      case "DRAFT": return "warning";
      case "ARCHIVED": return "default";
      default: return "default";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link href="/assessments">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Assessments
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-text-primary">{assessment.title}</h1>
                <Badge variant={getStatusVariant()} className="capitalize">
                  {assessment.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-text-secondary">
                <span className="capitalize">{assessment.role} • {assessment.seniority}</span>
                <span>{assessment.duration} min</span>
                <span>Created {new Date(assessment.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInviteDialogOpen(true)}
            >
              <Mail className="h-4 w-4 mr-2" />
              Invite Candidates
            </Button>
            <Link href={`/assessments/${id}/preview`}>
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </Link>
            <MoreActionsMenu />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard
            label="Total Candidates"
            value={stats.total.toString()}
            icon={<Users className="h-5 w-5" />}
            color="primary"
          />
          <StatCard
            label="Completed"
            value={stats.completed.toString()}
            subtext={`${Math.round(perf.completionRate * 100)}% completion`}
            icon={<CheckCircle2 className="h-5 w-5" />}
            color="success"
          />
          <StatCard
            label="Average Score"
            value={perf.avgScore.toString()}
            icon={<BarChart3 className="h-5 w-5" />}
            color="info"
          />
          <StatCard
            label="Pass Rate"
            value={`${Math.round(perf.passRate * 100)}%`}
            icon={<Target className="h-5 w-5" />}
            color={perf.passRate >= 0.6 ? "success" : "warning"}
          />
          <StatCard
            label="In Progress"
            value={stats.inProgress.toString()}
            icon={<Clock className="h-5 w-5" />}
            color="warning"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column - Tabs */}
          <div className="lg:col-span-2">
            <Card className="bg-background-secondary border-border">
              {/* Tab Navigation */}
              <div className="border-b border-border px-6">
                <div className="flex items-center gap-6">
                  {["overview", "candidates", "analytics", "settings"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "py-4 border-b-2 transition-colors text-sm font-medium capitalize",
                        activeTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-text-tertiary hover:text-text-secondary"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === "overview" && <OverviewTab assessment={assessment} problemSeeds={problemSeeds} />}
                {activeTab === "candidates" && (
                  <CandidatesTab
                    candidates={assessmentCandidates}
                    onInvite={() => setInviteDialogOpen(true)}
                  />
                )}
                {activeTab === "analytics" && <AnalyticsTab performance={perf} />}
                {activeTab === "settings" && <SettingsTab assessment={assessment} onStatusChange={fetchAssessmentDetail} isPublishing={isPublishing} onPublish={handlePublish} />}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card className="bg-background-secondary border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Quick Actions</h3>
              <div className="space-y-2">
                {assessment.status === "DRAFT" && (
                  <Button
                    variant="success"
                    className="w-full justify-start"
                    size="sm"
                    onClick={handlePublish}
                    loading={isPublishing}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Publish Assessment
                  </Button>
                )}
                <Button
                  variant="primary"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() => setInviteDialogOpen(true)}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Invite Candidates
                </Button>
                <Link href={`/assessments/${id}/preview`} className="block">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Interface
                  </Button>
                </Link>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export Results
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Copy className="h-4 w-4 mr-2" />
                  Clone Assessment
                </Button>
              </div>
            </Card>

            {/* Configuration */}
            <Card className="bg-background-secondary border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Configuration</h3>
              <div className="space-y-3 text-sm">
                <InfoRow label="Role" value={assessment.role} capitalize />
                <InfoRow label="Seniority" value={assessment.seniority.toLowerCase()} capitalize />
                <InfoRow label="Duration" value={`${assessment.duration} minutes`} />
                <InfoRow label="Coding" value={assessment.enableCoding ? "Enabled" : "Disabled"} />
                <InfoRow label="Terminal" value={assessment.enableTerminal ? "Enabled" : "Disabled"} />
                <InfoRow label="AI" value={assessment.enableAI ? "Enabled" : "Disabled"} />
                <InfoRow label="Tech Stack" value={assessment.techStack?.join(", ") || "Not specified"} />
              </div>
              <Link href={`/assessments/${id}/edit`}>
                <Button variant="ghost" size="sm" className="mt-4 w-full">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Configuration
                </Button>
              </Link>
            </Card>

            {/* Questions */}
            <Card className="bg-background-secondary border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                Questions ({problemSeeds.length})
              </h3>
              {problemSeeds.length > 0 ? (
                <div className="space-y-2">
                  {problemSeeds.map((question: any) => (
                    <div key={question.id} className="p-3 bg-background-tertiary rounded">
                      <p className="font-medium text-sm text-text-primary">{question.title}</p>
                      <p className="text-xs text-text-tertiary capitalize">{question.difficulty.toLowerCase()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">No questions configured yet</p>
              )}
            </Card>

            {/* Timeline */}
            <Card className="bg-background-secondary border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Recent Activity</h3>
              <div className="space-y-3">
                <TimelineItem
                  event={{
                    type: "created",
                    description: "Assessment created",
                    timestamp: assessment.createdAt
                  }}
                  isLast={!assessment.publishedAt}
                />
                {assessment.publishedAt && (
                  <TimelineItem
                    event={{
                      type: "updated",
                      description: "Assessment published",
                      timestamp: assessment.publishedAt
                    }}
                    isLast={true}
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Invitation Dialog */}
      <InviteCandidateDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        assessmentId={assessment.id}
        assessmentTitle={assessment.title}
        onSuccess={fetchAssessmentDetail}
      />
    </DashboardLayout>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  subtext,
  icon,
  color,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  color: "primary" | "success" | "warning" | "info";
}) {
  const colorClasses = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  };

  return (
    <div className="bg-background-secondary border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-tertiary">{label}</span>
        <div className={colorClasses[color]}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold text-text-primary">{value}</span>
      </div>
      {subtext && <p className="text-xs text-text-muted">{subtext}</p>}
    </div>
  );
}

// Info Row Component
function InfoRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={cn("text-text-primary font-medium", capitalize && "capitalize")}>{value}</span>
    </div>
  );
}

// Timeline Item
function TimelineItem({ event, isLast }: { event: any; isLast: boolean }) {
  const getIcon = () => {
    switch (event.type) {
      case "created": return <Sparkles className="h-3 w-3" />;
      case "updated": return <Edit className="h-3 w-3" />;
      case "candidate_invited": return <Mail className="h-3 w-3" />;
      case "candidate_started": return <Clock className="h-3 w-3" />;
      case "candidate_completed": return <CheckCircle2 className="h-3 w-3" />;
      default: return <Calendar className="h-3 w-3" />;
    }
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
          {getIcon()}
        </div>
        {!isLast && <div className="flex-1 w-px bg-border my-1" />}
      </div>
      <div className="flex-1 pb-3">
        <p className="text-sm text-text-primary">{event.description}</p>
        <p className="text-xs text-text-tertiary mt-1">
          {new Date(event.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// More Actions Dropdown
function MoreActionsMenu() {
  return (
    <div className="relative">
      <Button variant="ghost" size="sm">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Tab Components
function OverviewTab({ assessment, problemSeeds }: any) {
  return (
    <div className="space-y-6">
      {assessment.description && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-2">Description</h3>
          <p className="text-sm text-text-secondary">{assessment.description}</p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Invitation Link</h3>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={`https://interviewlm.com/interview/${assessment.id}`}
            className="flex-1 px-3 py-2 bg-background-tertiary border border-border rounded text-sm text-text-primary"
          />
          <Button variant="outline" size="sm">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Questions</h3>
        {problemSeeds.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {problemSeeds.map((question: any) => (
              <div key={question.id} className="p-4 bg-background-tertiary border border-border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-text-primary">{question.title}</h4>
                  <Badge variant="default" className="text-xs capitalize">
                    {question.difficulty.toLowerCase()}
                  </Badge>
                </div>
                {question.description && (
                  <p className="text-sm text-text-secondary">{question.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">No questions configured yet</p>
        )}
      </div>
    </div>
  );
}

function CandidatesTab({ candidates, onInvite }: any) {
  if (candidates.length === 0) {
    return (
      <div className="py-12 text-center">
        <Users className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
        <p className="text-text-secondary mb-1">No candidates yet</p>
        <p className="text-sm text-text-tertiary mb-4">
          Send invitations to start assessing candidates
        </p>
        <Button variant="primary" size="sm" onClick={onInvite}>
          <Mail className="h-4 w-4 mr-2" />
          Invite Candidates
        </Button>
      </div>
    );
  }

  return (
    <div>
      <CandidateTable candidates={candidates} />
    </div>
  );
}

function AnalyticsTab({ performance }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-background-tertiary rounded-lg">
          <p className="text-sm text-text-tertiary mb-1">Average Score</p>
          <p className="text-2xl font-bold text-text-primary">
            {performance.avgScore ? performance.avgScore.toFixed(1) : "—"}
          </p>
        </div>
        <div className="p-4 bg-background-tertiary rounded-lg">
          <p className="text-sm text-text-tertiary mb-1">Completion Rate</p>
          <p className="text-2xl font-bold text-text-primary">
            {Math.round(performance.completionRate * 100)}%
          </p>
        </div>
        <div className="p-4 bg-background-tertiary rounded-lg">
          <p className="text-sm text-text-tertiary mb-1">Pass Rate</p>
          <p className="text-2xl font-bold text-text-primary">
            {Math.round(performance.passRate * 100)}%
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Performance Insights</h3>
        <div className="p-4 bg-background-tertiary rounded-lg text-center">
          <p className="text-sm text-text-tertiary">
            Detailed analytics will be available once more candidates complete the assessment
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({
  assessment,
  onStatusChange,
  isPublishing,
  onPublish,
}: {
  assessment: any;
  onStatusChange: () => void;
  isPublishing: boolean;
  onPublish: () => void;
}) {
  const [isArchiving, setIsArchiving] = useState(false);

  const handleArchive = async () => {
    if (!confirm("Are you sure you want to archive this assessment? It will no longer accept new candidates.")) {
      return;
    }

    setIsArchiving(true);
    try {
      const response = await fetch(`/api/assessments/${assessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });

      if (!response.ok) {
        throw new Error("Failed to archive assessment");
      }

      onStatusChange();
    } catch (error) {
      console.error("Error archiving assessment:", error);
      alert("Failed to archive assessment. Please try again.");
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Status Management</h3>
        <div className="space-y-3">
          {assessment.status === "DRAFT" && (
            <Button
              variant="success"
              className="w-full justify-start"
              size="sm"
              onClick={onPublish}
              loading={isPublishing}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Publish Assessment
            </Button>
          )}
          <Link href={`/assessments/${assessment.id}/edit`}>
            <Button variant="outline" className="w-full justify-start" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Edit Assessment Configuration
            </Button>
          </Link>
          {assessment.status !== "ARCHIVED" && (
            <Button
              variant="outline"
              className="w-full justify-start"
              size="sm"
              onClick={handleArchive}
              loading={isArchiving}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive Assessment
            </Button>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-error mb-4">Danger Zone</h3>
        <div className="space-y-3">
          <Button variant="outline" className="w-full justify-start border-error text-error hover:bg-error hover:text-white" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Assessment
          </Button>
          <p className="text-xs text-text-muted">
            Warning: This action cannot be undone. All candidate data will be permanently deleted.
          </p>
        </div>
      </div>
    </div>
  );
}
