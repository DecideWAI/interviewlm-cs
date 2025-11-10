"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Download,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Lightbulb,
  Sparkles,
  Calendar,
} from "lucide-react";
import { MOCK_DASHBOARD_KPIS, MOCK_SOURCE_EFFECTIVENESS } from "@/lib/mock-analytics-data";
import {
  MOCK_ACTIONABLE_INSIGHTS,
  MOCK_OPTIMIZATION_RECOMMENDATIONS,
  MOCK_TREND_DATA,
  MOCK_PERFORMANCE_BY_ROLE,
} from "@/lib/mock-insights-data";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState("last_30_days");

  const kpis = MOCK_DASHBOARD_KPIS;

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <PageHeader
            title="Analytics"
            description="Actionable insights to improve your hiring process"
          />
          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary"
            >
              <option value="last_7_days">Last 7 days</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="last_90_days">Last 90 days</option>
              <option value="this_quarter">This quarter</option>
            </select>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            label="Assessments Completed"
            value={kpis.completedThisMonth.value.toString()}
            change={kpis.completedThisMonth.trend?.percentage || 0}
            isPositive={true}
            icon={<Users className="h-5 w-5" />}
            color="primary"
          />
          <MetricCard
            label="Completion Rate"
            value={kpis.completionRate.value.toString()}
            change={kpis.completionRate.trend?.percentage || 0}
            isPositive={true}
            icon={<Target className="h-5 w-5" />}
            color="success"
          />
          <MetricCard
            label="Pass Rate"
            value={kpis.passRate.value.toString()}
            change={kpis.passRate.trend?.percentage || 0}
            isPositive={false}
            icon={<BarChart3 className="h-5 w-5" />}
            color="warning"
          />
          <MetricCard
            label="Avg AI Proficiency"
            value={kpis.avgAIProficiency.value.toString()}
            change={kpis.avgAIProficiency.trend?.percentage || 0}
            isPositive={true}
            icon={<Sparkles className="h-5 w-5" />}
            color="info"
          />
        </div>

        {/* Actionable Insights */}
        <Card className="bg-background-secondary border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-text-primary">Actionable Insights</h3>
            </div>
            <Badge variant="primary">{MOCK_ACTIONABLE_INSIGHTS.length} active</Badge>
          </div>

          <div className="space-y-4">
            {MOCK_ACTIONABLE_INSIGHTS.slice(0, 3).map((insight) => (
              <ActionableInsightCard key={insight.id} insight={insight} />
            ))}
          </div>

          <div className="mt-4 text-center">
            <Button variant="ghost" size="sm">
              View All Insights ({MOCK_ACTIONABLE_INSIGHTS.length})
            </Button>
          </div>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assessment Volume Trend */}
          <Card className="bg-background-secondary border-border p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Assessment Volume Trend</h3>
            <div className="h-64">
              <SimpleTrendChart data={MOCK_TREND_DATA} />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-text-tertiary">Last 25 days</span>
              <div className="flex items-center gap-2 text-success">
                <ArrowUp className="h-4 w-4" />
                <span>+157% volume growth</span>
              </div>
            </div>
          </Card>

          {/* Performance by Role */}
          <Card className="bg-background-secondary border-border p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Performance by Role</h3>
            <div className="space-y-3">
              {MOCK_PERFORMANCE_BY_ROLE.map((role) => (
                <RolePerformanceRow key={role.role} data={role} />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-text-tertiary">
                💡 Frontend candidates have highest AI skills but lowest pass rate - consider adjusting difficulty
              </p>
            </div>
          </Card>

          {/* Source Effectiveness */}
          <Card className="bg-background-secondary border-border p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Source Effectiveness</h3>
            <div className="space-y-3">
              {MOCK_SOURCE_EFFECTIVENESS.map((source) => (
                <SourceRow key={source.source} data={source} />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-text-tertiary">
                ⭐ Employee Referrals have 8.5x ROI - 4x better than LinkedIn
              </p>
            </div>
          </Card>

          {/* Optimization Recommendations */}
          <Card className="bg-background-secondary border-border p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Optimization Recommendations</h3>
            <div className="space-y-4">
              {MOCK_OPTIMIZATION_RECOMMENDATIONS.map((rec) => (
                <OptimizationCard key={rec.id} recommendation={rec} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Metric Card Component
function MetricCard({
  label,
  value,
  change,
  isPositive,
  icon,
  color,
}: {
  label: string;
  value: string;
  change: number;
  isPositive: boolean;
  icon: React.ReactNode;
  color: "primary" | "success" | "warning" | "info";
}) {
  const colorClasses = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  };

  const getChangeColor = () => {
    if (change === 0) return "text-text-muted";
    const isGoodChange = (change > 0 && isPositive) || (change < 0 && !isPositive);
    return isGoodChange ? "text-success" : "text-error";
  };

  return (
    <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-primary/40 transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-tertiary">{label}</span>
        <div className={colorClasses[color]}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold text-text-primary">{value}</span>
      </div>
      <div className={cn("flex items-center gap-1 text-xs font-medium", getChangeColor())}>
        {change > 0 ? <ArrowUp className="h-3 w-3" /> : change < 0 ? <ArrowDown className="h-3 w-3" /> : null}
        <span>
          {change > 0 ? "+" : ""}
          {change}% vs previous period
        </span>
      </div>
    </div>
  );
}

// Actionable Insight Card
function ActionableInsightCard({ insight }: { insight: typeof MOCK_ACTIONABLE_INSIGHTS[0] }) {
  const severityConfig = {
    high: { bg: "bg-error/10", border: "border-error/30", icon: "text-error", badgeVariant: "error" as const },
    medium: { bg: "bg-warning/10", border: "border-warning/30", icon: "text-warning", badgeVariant: "warning" as const },
    low: { bg: "bg-info/10", border: "border-info/30", icon: "text-info", badgeVariant: "info" as const },
  };

  const typeIcon = {
    opportunity: <TrendingUp className="h-5 w-5" />,
    risk: <AlertCircle className="h-5 w-5" />,
    trend: <BarChart3 className="h-5 w-5" />,
    anomaly: <Sparkles className="h-5 w-5" />,
  };

  const config = severityConfig[insight.severity];

  return (
    <div className={cn("border rounded-lg p-4 transition-all hover:shadow-lg", config.bg, config.border)}>
      <div className="flex items-start gap-3">
        <div className={config.icon}>{typeIcon[insight.type]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="font-semibold text-text-primary">{insight.title}</h4>
            <Badge variant={config.badgeVariant} className="text-xs capitalize shrink-0">
              {insight.severity}
            </Badge>
          </div>
          <p className="text-sm text-text-secondary mb-2">{insight.description}</p>
          <p className="text-sm text-text-primary font-medium mb-3">
            <span className="text-text-tertiary">Impact:</span> {insight.impact}
          </p>
          <div className="flex flex-wrap gap-2">
            {insight.actions.slice(0, 2).map((action, idx) => (
              <Link key={idx} href={action.url || "#"}>
                <Button variant="outline" size="sm">
                  {action.label}
                </Button>
              </Link>
            ))}
            {insight.actions.length > 2 && (
              <Button variant="ghost" size="sm">
                +{insight.actions.length - 2} more
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Trend Chart (SVG-based for simplicity)
function SimpleTrendChart({ data }: { data: typeof MOCK_TREND_DATA }) {
  const maxAssessments = Math.max(...data.map((d) => d.assessments));
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d.assessments / maxAssessments) * 80;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((y) => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#1A1A1A" strokeWidth="0.5" />
      ))}

      {/* Trend line */}
      <polyline points={points} fill="none" stroke="#7B87F4" strokeWidth="2" />

      {/* Gradient fill under line */}
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7B87F4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7B87F4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,100 ${points} 100,100`} fill="url(#gradient)" />
    </svg>
  );
}

// Role Performance Row
function RolePerformanceRow({ data }: { data: typeof MOCK_PERFORMANCE_BY_ROLE[0] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{data.role}</span>
          <span className="text-text-tertiary">({data.candidates} candidates)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-text-secondary">Score: {data.avgScore}</span>
          <span className="text-text-secondary">Pass: {(data.passRate * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 h-2 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${(data.avgScore / 100) * 100}%` }}
          />
        </div>
        <div className="flex-1 h-2 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full"
            style={{ width: `${data.passRate * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Source Row
function SourceRow({ data }: { data: typeof MOCK_SOURCE_EFFECTIVENESS[0] }) {
  return (
    <div className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg">
      <div className="flex-1">
        <p className="font-medium text-text-primary">{data.source}</p>
        <p className="text-xs text-text-tertiary">{data.totalCandidates} candidates</p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="text-right">
          <p className="text-text-secondary">Pass Rate</p>
          <p className="font-medium text-text-primary">{(data.passRate * 100).toFixed(0)}%</p>
        </div>
        <div className="text-right">
          <p className="text-text-secondary">ROI</p>
          <p className="font-medium text-success">{data.roi.toFixed(1)}x</p>
        </div>
      </div>
    </div>
  );
}

// Optimization Card
function OptimizationCard({ recommendation }: { recommendation: typeof MOCK_OPTIMIZATION_RECOMMENDATIONS[0] }) {
  const priorityColors = {
    high: "border-error/30 bg-error/5",
    medium: "border-warning/30 bg-warning/5",
    low: "border-info/30 bg-info/5",
  };

  return (
    <div className={cn("border rounded-lg p-3", priorityColors[recommendation.priority])}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h5 className="font-medium text-text-primary text-sm">{recommendation.title}</h5>
        <Badge
          variant={recommendation.priority === "high" ? "error" : recommendation.priority === "medium" ? "warning" : "info"}
          className="text-xs shrink-0"
        >
          {recommendation.confidence}% confident
        </Badge>
      </div>
      <p className="text-xs text-text-secondary mb-2">{recommendation.recommendation}</p>
      <p className="text-xs text-text-primary font-medium">
        <span className="text-success">Impact:</span> {recommendation.expectedImpact}
      </p>
    </div>
  );
}
