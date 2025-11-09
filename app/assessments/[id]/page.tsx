"use client";

import { use, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CandidateTable } from "@/components/analytics/CandidateTable";
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
} from "lucide-react";
import { MOCK_ASSESSMENT_DETAIL } from "@/lib/mock-assessment-detail-data";
import { MOCK_CANDIDATES } from "@/lib/mock-analytics-data";
import { MOCK_PROBLEM_SEEDS } from "@/lib/mock-seeds-data";
import { cn } from "@/lib/utils";

interface AssessmentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AssessmentDetailPage({ params }: AssessmentDetailPageProps) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("overview");

  // In production, fetch from API
  const assessment = MOCK_ASSESSMENT_DETAIL;

  // Filter candidates for this assessment
  const assessmentCandidates = MOCK_CANDIDATES.filter(c =>
    assessment.candidateIds.includes(c.id)
  );

  // Get problem seeds
  const problemSeeds = MOCK_PROBLEM_SEEDS.filter(s =>
    assessment.problemSeedIds.includes(s.id)
  );

  const stats = assessment.candidateStats;
  const perf = assessment.performance;

  const getStatusVariant = () => {
    switch (assessment.status) {
      case "active": return "success";
      case "draft": return "warning";
      case "completed": return "primary";
      case "archived": return "default";
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
            <Button variant="outline" size="sm">
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
                {activeTab === "candidates" && <CandidatesTab candidates={assessmentCandidates} />}
                {activeTab === "analytics" && <AnalyticsTab performance={assessment.performance} aiMetrics={assessment.aiMetrics} />}
                {activeTab === "settings" && <SettingsTab assessment={assessment} />}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card className="bg-background-secondary border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Button variant="primary" className="w-full justify-start" size="sm">
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
                <InfoRow label="Seniority" value={assessment.seniority} capitalize />
                <InfoRow label="Duration" value={`${assessment.duration} minutes`} />
                <InfoRow label="AI Assistance" value={assessment.aiAssistanceEnabled ? "Enabled" : "Disabled"} />
                <InfoRow label="AI Monitoring" value={assessment.aiMonitoringEnabled ? "Enabled" : "Disabled"} />
                <InfoRow label="Created By" value={assessment.createdBy} />
              </div>
              <Button variant="ghost" size="sm" className="mt-4 w-full">
                <Edit className="h-4 w-4 mr-2" />
                Edit Configuration
              </Button>
            </Card>

            {/* Problem Seeds */}
            <Card className="bg-background-secondary border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                Problem Seeds ({problemSeeds.length})
              </h3>
              <div className="space-y-2">
                {problemSeeds.map((seed) => (
                  <Link key={seed.id} href={`/problems/seeds/${seed.id}`}>
                    <div className="p-3 bg-background-tertiary rounded hover:bg-background-hover transition-colors cursor-pointer">
                      <p className="font-medium text-sm text-text-primary">{seed.title}</p>
                      <p className="text-xs text-text-tertiary">{seed.estimatedTime} min</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            {/* Timeline */}
            <Card className="bg-background-secondary border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {assessment.timeline.slice(0, 5).map((event, idx) => (
                  <TimelineItem key={event.id} event={event} isLast={idx === 4} />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
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
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Description</h3>
        <p className="text-sm text-text-secondary">{assessment.description}</p>
      </div>

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
        <h3 className="text-sm font-semibold text-text-primary mb-3">Problem Seeds</h3>
        <div className="grid grid-cols-1 gap-3">
          {problemSeeds.map((seed: any) => (
            <div key={seed.id} className="p-4 bg-background-tertiary border border-border rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-medium text-text-primary">{seed.title}</h4>
                <Badge variant="default" className="text-xs">{seed.estimatedTime} min</Badge>
              </div>
              {seed.description && (
                <p className="text-sm text-text-secondary mb-2">{seed.description}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {seed.topics?.map((topic: string, idx: number) => (
                  <span key={idx} className="text-xs px-2 py-1 bg-background-secondary text-text-tertiary rounded">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CandidatesTab({ candidates }: any) {
  if (candidates.length === 0) {
    return (
      <div className="py-12 text-center">
        <Users className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
        <p className="text-text-secondary mb-1">No candidates yet</p>
        <p className="text-sm text-text-tertiary mb-4">
          Send invitations to start assessing candidates
        </p>
        <Button variant="primary" size="sm">
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

function AnalyticsTab({ performance, aiMetrics }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Score Distribution</h3>
        <div className="space-y-3">
          {performance.scoreDistribution.map((bucket: any) => (
            <div key={bucket.range}>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-text-secondary">{bucket.range}</span>
                <span className="text-text-primary font-medium">{bucket.count} candidates</span>
              </div>
              <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${(bucket.count / 15) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-background-tertiary rounded-lg">
          <p className="text-sm text-text-tertiary mb-1">Avg Time to Complete</p>
          <p className="text-2xl font-bold text-text-primary">{performance.avgTimeToComplete} min</p>
        </div>
        <div className="p-4 bg-background-tertiary rounded-lg">
          <p className="text-sm text-text-tertiary mb-1">Completion Rate</p>
          <p className="text-2xl font-bold text-text-primary">
            {Math.round(performance.completionRate * 100)}%
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-4">AI Usage Metrics</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-background-tertiary rounded-lg">
            <p className="text-sm text-text-tertiary mb-1">Avg Interactions</p>
            <p className="text-2xl font-bold text-text-primary">{aiMetrics.avgInteractions}</p>
          </div>
          <div className="p-4 bg-background-tertiary rounded-lg">
            <p className="text-sm text-text-tertiary mb-1">Prompt Quality</p>
            <p className="text-2xl font-bold text-text-primary">{aiMetrics.avgPromptQuality.toFixed(1)}/5.0</p>
          </div>
          <div className="p-4 bg-background-tertiary rounded-lg">
            <p className="text-sm text-text-tertiary mb-1">Acceptance Rate</p>
            <p className="text-2xl font-bold text-text-primary">
              {Math.round(aiMetrics.avgAcceptanceRate * 100)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ assessment }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Status Management</h3>
        <div className="space-y-3">
          <Button variant="outline" className="w-full justify-start" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Edit Assessment Configuration
          </Button>
          <Button variant="outline" className="w-full justify-start" size="sm">
            <Archive className="h-4 w-4 mr-2" />
            Archive Assessment
          </Button>
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
