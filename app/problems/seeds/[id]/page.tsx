"use client";

import { useState, useEffect } from "react";
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
  Loader2,
} from "lucide-react";
import { EnhancedProblemSeed } from "@/types/seed";
import { ROLES, SENIORITY_LEVELS } from "@/lib/assessment-config";
import { cn } from "@/lib/utils";
import { SeedPreviewModal } from "@/components/problems/SeedPreviewModal";

export default function SeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const seedId = params.id as string;

  const [seed, setSeed] = useState<EnhancedProblemSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Mock tier data (in production, fetch from user context)
  const mockTier = "medium" as const;
  const mockPreviewsRemaining = 45;
  const mockPreviewsLimit = 50;

  useEffect(() => {
    fetchSeed();
  }, [seedId]);

  const fetchSeed = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/seeds/${seedId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Seed not found');
        } else {
          throw new Error('Failed to fetch seed');
        }
        return;
      }

      const data = await response.json();
      setSeed(data.seed);
    } catch (err) {
      console.error('Error fetching seed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load seed');
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

  if (error || !seed) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="bg-background-secondary border border-border rounded-lg p-12 text-center">
            <AlertCircle className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
            <p className="text-text-secondary mb-1">{error || 'Seed not found'}</p>
            <p className="text-sm text-text-tertiary mb-4">
              The seed you're looking for doesn't exist or you don't have access
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

  const getScoreColor = (score?: number | null) => {
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
            <Button variant="outline" size="sm" onClick={() => setIsPreviewModalOpen(true)}>
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
              <Target className="h-4 w-4 text-primary" />
              <p className="text-xs text-text-tertiary">Difficulty</p>
            </div>
            <Badge
              variant={
                seed.difficulty === 'EASY' ? 'success' :
                seed.difficulty === 'HARD' ? 'error' : 'warning'
              }
              className="text-sm"
            >
              {seed.difficulty}
            </Badge>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-info" />
              <p className="text-xs text-text-tertiary">Category</p>
            </div>
            <p className="text-sm font-medium text-text-primary capitalize">{seed.category}</p>
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
                {seed.tags && seed.tags.length > 0 && (
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
                )}

                {seed.topics && seed.topics.length > 0 && (
                  <div>
                    <p className="text-sm text-text-tertiary mb-2">Topics Assessed</p>
                    <div className="flex flex-wrap gap-2">
                      {seed.topics.map((topic, idx) => (
                        <Badge key={idx} variant="primary">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-text-tertiary mb-2">Language</p>
                    <Badge variant="default" className="capitalize">
                      {seed.language}
                    </Badge>
                  </div>

                  <div>
                    <p className="text-sm text-text-tertiary mb-2">Category</p>
                    <Badge variant="default" className="capitalize">
                      {seed.category}
                    </Badge>
                  </div>
                </div>

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
                  </div>
                </div>
              </div>
            )}

            {/* Instructions Tab */}
            {activeTab === "instructions" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3">
                    LLM Instructions for Question Generation
                  </h3>
                  {seed.instructions ? (
                    <div className="bg-background-tertiary border border-border rounded-lg p-4">
                      <pre className="text-sm text-text-secondary whitespace-pre-wrap font-mono">
                        {seed.instructions}
                      </pre>
                    </div>
                  ) : (
                    <div className="bg-background-tertiary border border-border rounded-lg p-6 text-center">
                      <p className="text-sm text-text-tertiary">
                        No instructions provided for this seed
                      </p>
                    </div>
                  )}
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

      {/* Preview Modal */}
      <SeedPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        seed={seed}
        tier={mockTier}
        previewsRemaining={mockPreviewsRemaining}
        previewsLimit={mockPreviewsLimit}
      />
    </DashboardLayout>
  );
}
