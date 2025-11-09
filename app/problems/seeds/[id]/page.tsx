"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Edit,
  Copy,
  Archive,
  Sparkles,
  Eye,
  BarChart3,
  Users,
  TrendingUp,
  Clock,
  Star,
  Target,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { MOCK_PROBLEM_SEEDS } from "@/lib/mock-seeds-data";
import { ROLES, SENIORITY_LEVELS } from "@/lib/assessment-config";
import { cn } from "@/lib/utils";

export default function SeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const seedId = params.id as string;

  // Find seed (in production, fetch from API)
  const seed = MOCK_PROBLEM_SEEDS.find((s) => s.id === seedId);

  const [activeTab, setActiveTab] = useState("overview");

  if (!seed) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="bg-background-secondary border border-border rounded-lg p-12 text-center">
            <AlertCircle className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
            <p className="text-text-secondary mb-1">Seed not found</p>
            <p className="text-sm text-text-tertiary mb-4">
              The seed you're looking for doesn't exist
            </p>
            <Link href="/problems">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Seeds
              </Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusBadge = () => {
    switch (seed.status) {
      case "active":
        return (
          <Badge variant="success">
            <Sparkles className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="warning">
            <Edit className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="default">
            <Archive className="h-3 w-3 mr-1" />
            Archived
          </Badge>
        );
    }
  };

  const getRoleLabel = () => {
    if (seed.role === "any") return "Any Role";
    return ROLES[seed.role]?.name || seed.role;
  };

  const getSeniorityLabel = () => {
    if (seed.seniority === "any") return "Any Level";
    return SENIORITY_LEVELS[seed.seniority]?.name || seed.seniority;
  };

  const getScoreColor = (score?: number) => {
    if (!score) return "text-text-muted";
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-error";
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/problems">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-text-primary">{seed.title}</h1>
                {getStatusBadge()}
              </div>
              {seed.description && (
                <p className="text-sm text-text-tertiary">{seed.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" size="sm">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-primary" />
              <p className="text-xs text-text-tertiary">Usage</p>
            </div>
            <p className="text-2xl font-bold text-text-primary">{seed.usageCount}</p>
            <p className="text-xs text-text-muted mt-1">times used</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-success" />
              <p className="text-xs text-text-tertiary">Avg Score</p>
            </div>
            <p className={cn("text-2xl font-bold", getScoreColor(seed.avgCandidateScore))}>
              {seed.avgCandidateScore || "-"}
            </p>
            <p className="text-xs text-text-muted mt-1">out of 100</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-info" />
              <p className="text-xs text-text-tertiary">Completion</p>
            </div>
            <p className="text-2xl font-bold text-info">
              {seed.avgCompletionRate ? Math.round(seed.avgCompletionRate * 100) : "-"}%
            </p>
            <p className="text-xs text-text-muted mt-1">completion rate</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-warning" />
              <p className="text-xs text-text-tertiary">Rating</p>
            </div>
            <div className="flex items-center gap-1">
              <p className="text-2xl font-bold text-warning">
                {seed.rating?.toFixed(1) || "-"}
              </p>
              {seed.rating && <Star className="h-4 w-4 fill-warning text-warning" />}
            </div>
            <p className="text-xs text-text-muted mt-1">out of 5.0</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-text-tertiary" />
              <p className="text-xs text-text-tertiary">Duration</p>
            </div>
            <p className="text-2xl font-bold text-text-primary">{seed.estimatedTime}</p>
            <p className="text-xs text-text-muted mt-1">minutes</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-background-secondary border border-border rounded-lg">
          <div className="border-b border-border px-6">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setActiveTab("overview")}
                className={cn(
                  "py-4 border-b-2 transition-colors text-sm font-medium",
                  activeTab === "overview"
                    ? "border-primary text-primary"
                    : "border-transparent text-text-tertiary hover:text-text-secondary"
                )}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab("instructions")}
                className={cn(
                  "py-4 border-b-2 transition-colors text-sm font-medium",
                  activeTab === "instructions"
                    ? "border-primary text-primary"
                    : "border-transparent text-text-tertiary hover:text-text-secondary"
                )}
              >
                LLM Instructions
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={cn(
                  "py-4 border-b-2 transition-colors text-sm font-medium",
                  activeTab === "analytics"
                    ? "border-primary text-primary"
                    : "border-transparent text-text-tertiary hover:text-text-secondary"
                )}
              >
                Analytics
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-text-tertiary mb-2">Target Role</p>
                    <Badge variant="default" className="capitalize">
                      {getRoleLabel()}
                    </Badge>
                  </div>

                  <div>
                    <p className="text-sm text-text-tertiary mb-2">Target Seniority</p>
                    <Badge variant="default" className="capitalize">
                      {getSeniorityLabel()}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-text-tertiary mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {seed.tags.map((tag, idx) => (
                      <Badge key={idx} variant="default">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-text-tertiary mb-2">Topics Assessed</p>
                  <div className="flex flex-wrap gap-2">
                    {seed.topics?.map((topic, idx) => (
                      <Badge key={idx} variant="primary">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-text-tertiary mb-3">Difficulty Distribution</p>
                  <div className="space-y-3">
                    {seed.difficultyDistribution && (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-tertiary">Easy</span>
                            <span className="text-xs font-medium text-success">
                              {seed.difficultyDistribution.easy}%
                            </span>
                          </div>
                          <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success rounded-full"
                              style={{ width: `${seed.difficultyDistribution.easy}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-tertiary">Medium</span>
                            <span className="text-xs font-medium text-warning">
                              {seed.difficultyDistribution.medium}%
                            </span>
                          </div>
                          <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-warning rounded-full"
                              style={{ width: `${seed.difficultyDistribution.medium}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-tertiary">Hard</span>
                            <span className="text-xs font-medium text-error">
                              {seed.difficultyDistribution.hard}%
                            </span>
                          </div>
                          <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-error rounded-full"
                              style={{ width: `${seed.difficultyDistribution.hard}%` }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {seed.examples && seed.examples.length > 0 && (
                  <div>
                    <p className="text-sm text-text-tertiary mb-2">Examples</p>
                    <div className="space-y-2">
                      {seed.examples.map((example, idx) => (
                        <div
                          key={idx}
                          className="bg-background-tertiary border border-border rounded p-3 font-mono text-sm text-text-secondary"
                        >
                          {example}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm text-text-tertiary mb-2">Metadata</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-text-tertiary">Created by:</span>
                      <span className="ml-2 text-text-primary">{seed.createdBy}</span>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Created:</span>
                      <span className="ml-2 text-text-primary">
                        {new Date(seed.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Updated:</span>
                      <span className="ml-2 text-text-primary">
                        {new Date(seed.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {seed.lastPreviewedAt && (
                      <div>
                        <span className="text-text-tertiary">Last previewed:</span>
                        <span className="ml-2 text-text-primary">
                          {new Date(seed.lastPreviewedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Instructions Tab */}
            {activeTab === "instructions" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3">
                    LLM Instructions
                  </h3>
                  <div className="bg-background-tertiary border border-border rounded-lg p-4">
                    <pre className="text-sm text-text-secondary whitespace-pre-wrap font-mono">
                      {seed.instructions}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === "analytics" && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
                  <p className="text-text-secondary mb-1">Analytics Coming Soon</p>
                  <p className="text-sm text-text-tertiary">
                    Detailed usage analytics and candidate performance metrics
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
