"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Filter,
  Download,
  Sparkles,
  Target,
  TrendingUp,
  FileText,
  Star,
  Users,
  Clock,
  BarChart3,
  Eye,
  Edit,
  Copy,
  Archive,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useSeeds, calculateSeedStats, useCloneSeed } from "@/hooks/useSeeds";
import { ROLES, SENIORITY_LEVELS } from "@/lib/assessment-config";
import { cn } from "@/lib/utils";

export default function ProblemsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "archived">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [seniorityFilter, setSeniorityFilter] = useState<string>("all");

  // Fetch seeds from API
  const { seeds, loading, error, refetch } = useSeeds({
    status: statusFilter !== "all" ? statusFilter : undefined,
    includeSystem: true, // Include system seeds for users to clone
  });

  // Get statistics
  const stats = useMemo(() => calculateSeedStats(seeds), [seeds]);

  // Filter seeds (client-side filtering for search)
  const filteredSeeds = useMemo(() => {
    return seeds.filter((seed) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          seed.title.toLowerCase().includes(query) ||
          seed.description?.toLowerCase().includes(query) ||
          seed.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          seed.topics?.some((topic) => topic.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Note: Role and seniority filters removed since seeds don't have these fields
      // in the new schema. They can be added back if needed via topics/tags.

      return true;
    });
  }, [seeds, searchQuery]);

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <PageHeader
            title="Problem Seeds"
            description="LLM instruction templates that generate assessment questions"
          />
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={refetch} disabled={loading}>
              <Download className="h-4 w-4 mr-2" />
              Export Seeds
            </Button>
            <Link href="/problems/seeds/new">
              <Button variant="primary">
                <Plus className="h-4 w-4 mr-2" />
                Create Seed
              </Button>
            </Link>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-text-secondary">Loading seeds...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3" />
              <div>
                <p className="text-red-800 dark:text-red-200 font-medium">Failed to load seeds</p>
                <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={refetch} className="ml-auto">
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-primary/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">Total Seeds</p>
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <p className="text-3xl font-bold text-text-primary">{stats.totalSeeds}</p>
            <p className="text-xs text-text-muted mt-1">
              {stats.activeSeeds} active, {stats.draftSeeds} draft
            </p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-success/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">System Seeds</p>
              <Star className="h-5 w-5 text-success" />
            </div>
            <p className="text-3xl font-bold text-success">{stats.systemSeeds}</p>
            <p className="text-xs text-text-muted mt-1">{stats.customSeeds} custom seeds</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-warning/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">Avg Usage</p>
              <BarChart3 className="h-5 w-5 text-warning" />
            </div>
            <p className="text-3xl font-bold text-warning">{Math.round(stats.avgUsageCount)}</p>
            <p className="text-xs text-text-muted mt-1">Avg times used per seed</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-info/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">Avg Score</p>
              <TrendingUp className="h-5 w-5 text-info" />
            </div>
            <p className="text-3xl font-bold text-info">
              {stats.avgCandidateScore > 0 ? Math.round(stats.avgCandidateScore) : 'N/A'}
            </p>
            <p className="text-xs text-text-muted mt-1">Average candidate score</p>
          </div>
        </div>
        )}

        {/* Smart Filters */}
        {!loading && !error && (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-text-tertiary">Quick filters:</p>
          <Badge
            variant={statusFilter === "all" ? "primary" : "default"}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setStatusFilter("all")}
          >
            All Seeds ({stats.totalSeeds})
          </Badge>
          <Badge
            variant={statusFilter === "active" ? "success" : "default"}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setStatusFilter("active")}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Active ({stats.activeSeeds})
          </Badge>
          <Badge
            variant={statusFilter === "draft" ? "warning" : "default"}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setStatusFilter("draft")}
          >
            <Edit className="h-3 w-3 mr-1" />
            Drafts ({stats.draftSeeds})
          </Badge>
        </div>
        )}

        {/* Search & Filters Bar */}
        <div className="bg-background-secondary border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <Input
                placeholder="Search by title, description, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>

            {/* Results count */}
            <div className="text-sm text-text-tertiary">
              {filteredSeeds.length} {filteredSeeds.length === 1 ? "seed" : "seeds"}
            </div>
          </div>

          {/* Advanced Filters (Collapsible) */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-down">
              <div>
                <label className="text-xs text-text-tertiary mb-2 block">Role</label>
                <Select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full"
                >
                  <option value="all">All Roles</option>
                  <option value="any">Any Role</option>
                  {Object.values(ROLES).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs text-text-tertiary mb-2 block">Seniority</label>
                <Select
                  value={seniorityFilter}
                  onChange={(e) => setSeniorityFilter(e.target.value)}
                  className="w-full"
                >
                  <option value="all">All Levels</option>
                  <option value="any">Any Level</option>
                  {Object.values(SENIORITY_LEVELS).map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs text-text-tertiary mb-2 block">Status</label>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setRoleFilter("all");
                    setSeniorityFilter("all");
                    setShowFilters(false);
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Seeds Grid */}
        <div>
          {filteredSeeds.length === 0 ? (
            <div className="bg-background-secondary border border-border rounded-lg p-12 text-center">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
              <p className="text-text-secondary mb-1">No seeds found</p>
              <p className="text-sm text-text-tertiary">
                Try adjusting your filters or create a new seed
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSeeds.map((seed) => (
                <SeedCard key={seed.id} seed={seed} />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// Seed Card Component
function SeedCard({ seed }: { seed: import("@/hooks/useSeeds").ProblemSeed }) {
  const { cloneSeed, cloning } = useCloneSeed();

  const handleClone = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent Link navigation
    e.stopPropagation();

    try {
      await cloneSeed(seed.id);
      // Show success message (you can add a toast notification here)
      window.location.reload(); // Reload to show new seed
    } catch (error) {
      console.error('Failed to clone seed:', error);
      // Show error message
    }
  };

  const getStatusBadge = () => {
    switch (seed.status) {
      case "active":
        return (
          <Badge variant="success" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="warning" className="text-xs">
            <Edit className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="default" className="text-xs">
            <Archive className="h-3 w-3 mr-1" />
            Archived
          </Badge>
        );
    }
  };

  // Note: Role and seniority removed from seed schema
  // These can be inferred from topics/tags if needed

  const getScoreColor = (score?: number) => {
    if (!score) return "text-text-muted";
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-error";
  };

  return (
    <Link href={`/problems/seeds/${seed.id}`}>
      <div className="bg-background-secondary border border-border rounded-lg p-5 hover:border-primary/40 transition-all cursor-pointer group h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary mb-1 group-hover:text-primary transition-colors">
              {seed.title}
            </h3>
            {seed.description && (
              <p className="text-sm text-text-tertiary line-clamp-2">{seed.description}</p>
            )}
          </div>
          {getStatusBadge()}
        </div>

        {/* Topics & Metadata */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {seed.topics && seed.topics.length > 0 && seed.topics.slice(0, 2).map((topic) => (
            <Badge key={topic} variant="default" className="text-xs capitalize">
              {topic}
            </Badge>
          ))}
          {seed.isSystemSeed && (
            <Badge variant="primary" className="text-xs">
              <Star className="h-3 w-3 mr-1" />
              System
            </Badge>
          )}
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            <Clock className="h-3 w-3" />
            {seed.estimatedTime}m
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-4">
          {seed.tags.slice(0, 4).map((tag, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-1 bg-background-tertiary text-text-secondary rounded border border-border"
            >
              {tag}
            </span>
          ))}
          {seed.tags.length > 4 && (
            <span className="text-xs text-text-muted">+{seed.tags.length - 4} more</span>
          )}
        </div>

        {/* Stats */}
        <div className="mt-auto pt-4 border-t border-border">
          <div className="grid grid-cols-3 gap-3">
            {/* Usage */}
            <div>
              <div className="flex items-center gap-1 text-xs text-text-tertiary mb-1">
                <Users className="h-3 w-3" />
                Usage
              </div>
              <p className="text-sm font-medium text-text-primary">{seed.usageCount}</p>
            </div>

            {/* Score */}
            <div>
              <div className="flex items-center gap-1 text-xs text-text-tertiary mb-1">
                <BarChart3 className="h-3 w-3" />
                Avg Score
              </div>
              <p className={cn("text-sm font-medium", getScoreColor(seed.avgCandidateScore))}>
                {seed.avgCandidateScore || "-"}
              </p>
            </div>

            {/* Rating */}
            <div>
              <div className="flex items-center gap-1 text-xs text-text-tertiary mb-1">
                <Star className="h-3 w-3" />
                Rating
              </div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium text-text-primary">
                  {seed.rating?.toFixed(1) || "-"}
                </p>
                {seed.rating && (
                  <Star className="h-3 w-3 fill-warning text-warning" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Average Score Bar */}
        {seed.avgCandidateScore !== null && seed.avgCandidateScore > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-text-tertiary mb-1">
              <span>Avg Candidate Score</span>
              <span>{Math.round(seed.avgCandidateScore)}/100</span>
            </div>
            <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  seed.avgCandidateScore >= 80
                    ? "bg-success"
                    : seed.avgCandidateScore >= 60
                    ? "bg-warning"
                    : "bg-error"
                )}
                style={{ width: `${seed.avgCandidateScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Quick Actions (Visible on Hover) */}
        <div className="mt-3 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs">
              <Eye className="h-3 w-3 mr-1" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={handleClone}
              disabled={cloning}
            >
              {cloning ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Copy className="h-3 w-3 mr-1" />
              )}
              {cloning ? 'Cloning...' : 'Clone'}
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}
