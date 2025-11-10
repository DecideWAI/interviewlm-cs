"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { KPICard } from "@/components/analytics/KPICard";
import { PipelineFunnelChart } from "@/components/analytics/PipelineFunnelChart";
import { PriorityActionsPanel } from "@/components/analytics/PriorityActionsPanel";
import { CandidateTable } from "@/components/analytics/CandidateTable";
import {
  MOCK_DASHBOARD_KPIS,
  MOCK_PIPELINE_FUNNEL,
  MOCK_PRIORITY_ACTIONS,
  MOCK_CANDIDATES,
} from "@/lib/mock-analytics-data";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, Users, Award } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  // TODO: Fetch real data from API
  const kpis = MOCK_DASHBOARD_KPIS;
  const funnel = MOCK_PIPELINE_FUNNEL;
  const priorityActions = MOCK_PRIORITY_ACTIONS;
  const candidates = MOCK_CANDIDATES;

  // Extract key metrics for display
  const primaryKPIs = [
    kpis.activeAssessments,
    kpis.pendingReview,
    kpis.completedThisMonth,
    kpis.averageScore,
  ];

  const secondaryKPIs = [
    kpis.completionRate,
    kpis.passRate,
    kpis.avgAIProficiency,
    kpis.candidatesUsingAI,
  ];

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <PageHeader
            title="Analytics Dashboard"
            description="Monitor your hiring pipeline and candidate performance"
          />
          <Link href="/assessments/new">
            <Button variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              New Assessment
            </Button>
          </Link>
        </div>

        {/* Primary KPIs - Top Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {primaryKPIs.map((kpi) => (
            <KPICard key={kpi.label} metric={kpi} />
          ))}
        </div>

        {/* Quick Insights Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-primary/20 rounded-lg">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-text-primary">
                  {(funnel.overallConversion * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-text-tertiary">Overall Conversion</p>
              </div>
            </div>
            <h4 className="font-medium text-text-primary mb-1">
              Pipeline Health
            </h4>
            <p className="text-sm text-text-secondary">
              8 out of 100 invited candidates are hired
            </p>
          </div>

          <div className="bg-gradient-to-br from-success/10 to-success/5 border border-success/20 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-success/20 rounded-lg">
                <Users className="h-6 w-6 text-success" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-text-primary">
                  {candidates.filter((c) => c.assessmentCompleted).length}
                </p>
                <p className="text-xs text-text-tertiary">Completed</p>
              </div>
            </div>
            <h4 className="font-medium text-text-primary mb-1">
              Active Candidates
            </h4>
            <p className="text-sm text-text-secondary">
              {candidates.filter((c) => c.status === "assessment_in_progress").length} currently taking assessments
            </p>
          </div>

          <div className="bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-warning/20 rounded-lg">
                <Award className="h-6 w-6 text-warning" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-text-primary">
                  {candidates.filter((c) => (c.overallScore || 0) >= 80).length}
                </p>
                <p className="text-xs text-text-tertiary">Top Performers</p>
              </div>
            </div>
            <h4 className="font-medium text-text-primary mb-1">
              High Scorers
            </h4>
            <p className="text-sm text-text-secondary">
              Candidates scoring 80+ across all metrics
            </p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Pipeline Funnel - 2 columns */}
          <div className="lg:col-span-2 bg-background-secondary border border-border rounded-lg p-6">
            <PipelineFunnelChart data={funnel} />
          </div>

          {/* Priority Actions - 1 column */}
          <div className="lg:col-span-1">
            <PriorityActionsPanel actions={priorityActions} />
          </div>
        </div>

        {/* Secondary KPIs */}
        <div>
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            Performance Metrics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {secondaryKPIs.map((kpi) => (
              <KPICard key={kpi.label} metric={kpi} />
            ))}
          </div>
        </div>

        {/* Recent Candidates Table */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text-primary">
              Recent Candidates
            </h3>
            <Link href="/candidates">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>
          <CandidateTable candidates={candidates} />
        </div>
      </div>
    </DashboardLayout>
  );
}
