"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CandidateTable } from "@/components/analytics/CandidateTable";
import { MOCK_CANDIDATES } from "@/lib/mock-analytics-data";
import {
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  LayoutGrid,
  List,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { CandidateProfile } from "@/types/analytics";

export default function CandidatesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showFilters, setShowFilters] = useState(false);

  // TODO: Fetch from API
  const candidates = MOCK_CANDIDATES;

  // Smart filters
  const needsAttentionCount = candidates.filter(
    (c) => c.status === "assessment_completed" && !c.overallScore
  ).length;

  const highPerformersCount = candidates.filter(
    (c) => (c.overallScore || 0) >= 80
  ).length;

  const stuckCandidatesCount = candidates.filter(
    (c) => c.status === "assessment_in_progress"
  ).length;

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <PageHeader
            title="Candidates"
            description="Manage and review your candidate pipeline"
          />
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              Invite Candidates
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-primary/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">Total Candidates</p>
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="text-3xl font-bold text-text-primary">{candidates.length}</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-warning/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">Needs Attention</p>
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <p className="text-3xl font-bold text-warning">{needsAttentionCount}</p>
            <p className="text-xs text-text-muted mt-1">Completed, not reviewed</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-success/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">High Performers</p>
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <p className="text-3xl font-bold text-success">{highPerformersCount}</p>
            <p className="text-xs text-text-muted mt-1">Score 80+</p>
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-info/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-tertiary">In Progress</p>
              <Clock className="h-5 w-5 text-info" />
            </div>
            <p className="text-3xl font-bold text-info">{stuckCandidatesCount}</p>
            <p className="text-xs text-text-muted mt-1">Currently taking assessment</p>
          </div>
        </div>

        {/* Smart Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-text-tertiary">Quick filters:</p>
          <Link href="/candidates?filter=needs_attention">
            <Badge variant="warning" className="cursor-pointer hover:opacity-80 transition-opacity">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Needs Attention ({needsAttentionCount})
            </Badge>
          </Link>
          <Link href="/candidates?filter=high_performers">
            <Badge variant="success" className="cursor-pointer hover:opacity-80 transition-opacity">
              <TrendingUp className="h-3 w-3 mr-1" />
              High Performers ({highPerformersCount})
            </Badge>
          </Link>
          <Link href="/candidates?filter=in_progress">
            <Badge variant="info" className="cursor-pointer hover:opacity-80 transition-opacity">
              <Clock className="h-3 w-3 mr-1" />
              In Progress ({stuckCandidatesCount})
            </Badge>
          </Link>
        </div>

        {/* Search & Filters Bar */}
        <div className="bg-background-secondary border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <Input
                placeholder="Search by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-1 bg-background-tertiary rounded-lg p-1">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-8"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className="h-8"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
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

            {/* Export */}
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          {/* Advanced Filters (Collapsible) */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-down">
              <div>
                <label className="text-xs text-text-tertiary mb-2 block">Role</label>
                <Select className="w-full">
                  <option value="all">All Roles</option>
                  <option value="backend">Backend</option>
                  <option value="frontend">Frontend</option>
                  <option value="fullstack">Fullstack</option>
                </Select>
              </div>

              <div>
                <label className="text-xs text-text-tertiary mb-2 block">Seniority</label>
                <Select className="w-full">
                  <option value="all">All Levels</option>
                  <option value="junior">Junior</option>
                  <option value="mid">Mid-Level</option>
                  <option value="senior">Senior</option>
                  <option value="staff">Staff</option>
                  <option value="principal">Principal</option>
                </Select>
              </div>

              <div>
                <label className="text-xs text-text-tertiary mb-2 block">Score Range</label>
                <Select className="w-full">
                  <option value="all">All Scores</option>
                  <option value="80-100">80-100 (Excellent)</option>
                  <option value="60-79">60-79 (Good)</option>
                  <option value="0-59">Below 60</option>
                </Select>
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowFilters(false)}>
                  Clear Filters
                </Button>
                <Button variant="primary" size="sm">
                  Apply Filters
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Candidates Table/Grid */}
        <div>
          {viewMode === "table" ? (
            <CandidateTable candidates={candidates} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {candidates.map((candidate) => (
                <CandidateCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// Card view component for grid layout
function CandidateCard({ candidate }: { candidate: CandidateProfile }) {
  const getStatusBadge = () => {
    switch (candidate.status) {
      case "assessment_completed":
        return <Badge variant="success">Completed</Badge>;
      case "assessment_in_progress":
        return <Badge variant="info">In Progress</Badge>;
      case "under_review":
        return <Badge variant="warning">Under Review</Badge>;
      default:
        return <Badge variant="default">{candidate.status}</Badge>;
    }
  };

  const getScoreColor = (score?: number) => {
    if (!score) return "text-text-muted";
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-error";
  };

  return (
    <Link href={`/candidates/${candidate.id}`}>
      <div className="bg-background-secondary border border-border rounded-lg p-5 hover:border-primary/40 transition-all cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary truncate mb-1">
              {candidate.name}
            </h3>
            <p className="text-sm text-text-tertiary truncate">{candidate.email}</p>
          </div>
          {getStatusBadge()}
        </div>

        {/* Role & Seniority */}
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="default" className="capitalize">{candidate.appliedRole}</Badge>
          <Badge variant="default" className="capitalize">{candidate.targetSeniority}</Badge>
        </div>

        {/* Score */}
        {candidate.overallScore && (
          <div className="mb-4 pb-4 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-tertiary">Overall Score</span>
              <span className={`text-2xl font-bold ${getScoreColor(candidate.overallScore)}`}>
                {candidate.overallScore}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-text-tertiary">Technical:</span>
                <span className="ml-1 font-medium text-text-primary">{candidate.technicalScore}</span>
              </div>
              <div>
                <span className="text-text-tertiary">AI:</span>
                <span className="ml-1 font-medium text-text-primary">{candidate.aiCollaborationScore}</span>
              </div>
            </div>
          </div>
        )}

        {/* Flags */}
        <div className="flex items-center gap-3">
          {candidate.redFlags.length > 0 && (
            <div className="flex items-center gap-1 text-error">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium">{candidate.redFlags.length} red</span>
            </div>
          )}
          {candidate.greenFlags.length > 0 && (
            <div className="flex items-center gap-1 text-success">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">{candidate.greenFlags.length} green</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
