"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  BarChart3,
  Users,
  Scale,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fairness Dashboard for Administrators
 *
 * Provides visibility into:
 * - Bias detection statistics
 * - Audit log overview
 * - High-risk cases requiring review
 * - Fairness metrics over time
 */

interface BiasStats {
  totalEvaluations: number;
  biasesDetected: number;
  highRiskCases: number;
  pendingReviews: number;
  avgBiasScore: number;
  biasTypeBreakdown: Record<string, number>;
  trendDirection: "improving" | "stable" | "worsening";
  trendPercentage: number;
}

interface AuditLogEntry {
  id: string;
  sessionId: string;
  candidateId: string;
  checkType: string;
  riskLevel: "low" | "medium" | "high";
  biasesDetected: string[];
  humanReviewed: boolean;
  createdAt: string;
  reviewOutcome?: string;
}

// Mock data for demonstration
const mockBiasStats: BiasStats = {
  totalEvaluations: 1250,
  biasesDetected: 89,
  highRiskCases: 12,
  pendingReviews: 5,
  avgBiasScore: 0.92,
  biasTypeBreakdown: {
    language_complexity_bias: 23,
    timing_pressure_bias: 18,
    example_diversity_bias: 15,
    question_difficulty_variance: 14,
    evaluator_drift: 10,
    time_of_day_bias: 9,
  },
  trendDirection: "improving",
  trendPercentage: 8,
};

const mockAuditLogs: AuditLogEntry[] = [
  {
    id: "1",
    sessionId: "sess_abc123",
    candidateId: "cand_xyz789",
    checkType: "response_evaluation",
    riskLevel: "high",
    biasesDetected: ["language_complexity_bias", "evaluator_drift"],
    humanReviewed: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    sessionId: "sess_def456",
    candidateId: "cand_uvw321",
    checkType: "question_generation",
    riskLevel: "medium",
    biasesDetected: ["question_difficulty_variance"],
    humanReviewed: false,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    sessionId: "sess_ghi789",
    candidateId: "cand_rst654",
    checkType: "response_evaluation",
    riskLevel: "high",
    biasesDetected: ["timing_pressure_bias", "example_diversity_bias"],
    humanReviewed: true,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    reviewOutcome: "adjusted",
  },
  {
    id: "4",
    sessionId: "sess_jkl012",
    candidateId: "cand_opq987",
    checkType: "question_generation",
    riskLevel: "low",
    biasesDetected: [],
    humanReviewed: false,
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "5",
    sessionId: "sess_mno345",
    candidateId: "cand_lmn246",
    checkType: "response_evaluation",
    riskLevel: "medium",
    biasesDetected: ["time_of_day_bias"],
    humanReviewed: true,
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    reviewOutcome: "confirmed",
  },
];

export default function FairnessDashboard() {
  const [stats, setStats] = useState<BiasStats>(mockBiasStats);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(mockAuditLogs);
  const [filterRisk, setFilterRisk] = useState<"all" | "high" | "medium" | "low">("all");
  const [isLoading, setIsLoading] = useState(false);

  const filteredLogs = auditLogs.filter((log) => {
    if (filterRisk === "all") return true;
    return log.riskLevel === filterRisk;
  });

  const getRiskBadgeStyle = (risk: AuditLogEntry["riskLevel"]) => {
    switch (risk) {
      case "high":
        return "bg-error/10 text-error border-error/20";
      case "medium":
        return "bg-warning/10 text-warning border-warning/20";
      case "low":
        return "bg-success/10 text-success border-success/20";
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return "Just now";
  };

  const handleRefresh = () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Fairness Dashboard</h1>
              <p className="text-sm text-text-tertiary">
                Monitor bias detection and ensure fair assessments
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="primary" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Evaluations */}
          <Card className="border-border-secondary">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-tertiary">Total Evaluations</p>
                  <p className="text-3xl font-bold text-text-primary">{stats.totalEvaluations.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-info/10">
                  <Users className="h-5 w-5 text-info" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Biases Detected */}
          <Card className="border-border-secondary">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-tertiary">Biases Detected</p>
                  <p className="text-3xl font-bold text-text-primary">{stats.biasesDetected}</p>
                  <p className="text-xs text-text-tertiary">
                    {((stats.biasesDetected / stats.totalEvaluations) * 100).toFixed(1)}% of evaluations
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-warning/10">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* High Risk Cases */}
          <Card className="border-border-secondary">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-tertiary">High Risk Cases</p>
                  <p className="text-3xl font-bold text-error">{stats.highRiskCases}</p>
                  <p className="text-xs text-text-tertiary">
                    {stats.pendingReviews} pending review
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-error/10">
                  <Scale className="h-5 w-5 text-error" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fairness Score */}
          <Card className="border-border-secondary">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-tertiary">Fairness Score</p>
                  <p className="text-3xl font-bold text-success">{Math.round(stats.avgBiasScore * 100)}%</p>
                  <div className="flex items-center gap-1 mt-1">
                    {stats.trendDirection === "improving" ? (
                      <TrendingUp className="h-3 w-3 text-success" />
                    ) : stats.trendDirection === "worsening" ? (
                      <TrendingDown className="h-3 w-3 text-error" />
                    ) : null}
                    <p className={cn(
                      "text-xs",
                      stats.trendDirection === "improving" ? "text-success" :
                      stats.trendDirection === "worsening" ? "text-error" : "text-text-tertiary"
                    )}>
                      {stats.trendDirection === "improving" ? "+" : stats.trendDirection === "worsening" ? "-" : ""}
                      {stats.trendPercentage}% this month
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bias Type Breakdown */}
          <Card className="border-border-secondary lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Bias Type Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(stats.biasTypeBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([biasType, count]) => {
                  const percentage = (count / stats.biasesDetected) * 100;
                  return (
                    <div key={biasType} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">
                          {biasType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </span>
                        <span className="text-text-tertiary">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-background-tertiary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>

          {/* Recent Audit Logs */}
          <Card className="border-border-secondary lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Recent Audit Logs
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-text-tertiary" />
                  <select
                    value={filterRisk}
                    onChange={(e) => setFilterRisk(e.target.value as typeof filterRisk)}
                    className="bg-background-secondary border border-border rounded-md px-2 py-1 text-sm text-text-primary"
                  >
                    <option value="all">All Risks</option>
                    <option value="high">High Risk</option>
                    <option value="medium">Medium Risk</option>
                    <option value="low">Low Risk</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-background-secondary border border-border hover:border-border-secondary transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <Badge className={cn("border", getRiskBadgeStyle(log.riskLevel))}>
                        {log.riskLevel.toUpperCase()}
                      </Badge>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-primary">
                            {log.checkType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                          </p>
                          {log.humanReviewed && (
                            <Badge variant="success" className="text-xs">
                              <Eye className="h-3 w-3 mr-1" />
                              Reviewed
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-text-tertiary">
                            Session: {log.sessionId.slice(0, 12)}...
                          </p>
                          {log.biasesDetected.length > 0 && (
                            <p className="text-xs text-warning">
                              {log.biasesDetected.length} bias{log.biasesDetected.length > 1 ? "es" : ""} detected
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-text-tertiary">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(log.createdAt)}
                        </div>
                        {log.reviewOutcome && (
                          <p className="text-xs text-text-secondary mt-1">
                            Outcome: {log.reviewOutcome}
                          </p>
                        )}
                      </div>
                      {!log.humanReviewed && log.riskLevel !== "low" && (
                        <Button variant="secondary" size="sm">
                          Review
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {filteredLogs.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-text-tertiary">No audit logs matching filter</p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border">
                <Button variant="ghost" className="w-full">
                  View All Audit Logs
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Review Alert */}
        {stats.pendingReviews > 0 && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {stats.pendingReviews} high-risk case{stats.pendingReviews > 1 ? "s" : ""} pending review
                    </p>
                    <p className="text-xs text-text-tertiary">
                      These evaluations may have bias issues that require human verification
                    </p>
                  </div>
                </div>
                <Button variant="primary" size="sm">
                  Review Queue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
