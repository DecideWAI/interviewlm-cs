"use client";

import { useState } from "react";
import { CandidateProfile } from "@/types/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Search,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ThumbsUp,
  Eye,
  PlayCircle
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CandidateTableProps {
  candidates: CandidateProfile[];
}

export function CandidateTable({ candidates }: CandidateTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");

  // Filter and sort candidates
  const filteredCandidates = candidates
    .filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "score") {
        return (b.overallScore || 0) - (a.overallScore || 0);
      }
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });

  const getStatusBadge = (status: CandidateProfile["status"]) => {
    switch (status) {
      case "assessment_completed":
        return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "assessment_in_progress":
        return <Badge variant="info"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "assessment_sent":
        return <Badge variant="default"><Clock className="h-3 w-3 mr-1" />Sent</Badge>;
      case "under_review":
        return <Badge variant="warning"><Eye className="h-3 w-3 mr-1" />Under Review</Badge>;
      case "offer_sent":
        return <Badge variant="success"><ThumbsUp className="h-3 w-3 mr-1" />Offer Sent</Badge>;
      case "offer_accepted":
        return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Offer Accepted</Badge>;
      case "hired":
        return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Hired</Badge>;
      case "rejected":
        return <Badge variant="error"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="default" className="capitalize">{status.replace(/_/g, " ")}</Badge>;
    }
  };

  const getScoreColor = (score?: number) => {
    if (!score) return "text-text-muted";
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-error";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
      {/* Header with Filters */}
      <div className="p-4 border-b border-border bg-background-tertiary">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="assessment_sent">Sent</option>
            <option value="assessment_in_progress">In Progress</option>
            <option value="assessment_completed">Completed</option>
            <option value="under_review">Under Review</option>
            <option value="offer_sent">Offer Sent</option>
            <option value="offer_accepted">Offer Accepted</option>
            <option value="hired">Hired</option>
            <option value="rejected">Rejected</option>
          </Select>

          {/* Sort */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortBy(sortBy === "date" ? "score" : "date")}
          >
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Sort by {sortBy === "date" ? "Date" : "Score"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-background-tertiary border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Candidate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Flags
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Activity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredCandidates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <p className="text-text-secondary">No candidates found</p>
                  <p className="text-sm text-text-tertiary mt-1">
                    Try adjusting your filters
                  </p>
                </td>
              </tr>
            ) : (
              filteredCandidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className="hover:bg-background-tertiary transition-colors"
                >
                  {/* Candidate */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-text-primary">
                        {candidate.name}
                      </p>
                      <p className="text-sm text-text-tertiary">
                        {candidate.email}
                      </p>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm text-text-primary capitalize">
                        {candidate.appliedRole}
                      </p>
                      <p className="text-xs text-text-tertiary capitalize">
                        {candidate.targetSeniority}
                      </p>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(candidate.status)}
                  </td>

                  {/* Score */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {candidate.overallScore ? (
                      <div>
                        <p className={cn(
                          "text-xl font-bold",
                          getScoreColor(candidate.overallScore)
                        )}>
                          {candidate.overallScore}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          AI: {candidate.aiCollaborationScore || "-"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>

                  {/* Flags */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {candidate.redFlags.length > 0 && (
                        <div className="flex items-center gap-1 text-error">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs font-medium">
                            {candidate.redFlags.length}
                          </span>
                        </div>
                      )}
                      {candidate.greenFlags.length > 0 && (
                        <div className="flex items-center gap-1 text-success">
                          <ThumbsUp className="h-4 w-4" />
                          <span className="text-xs font-medium">
                            {candidate.greenFlags.length}
                          </span>
                        </div>
                      )}
                      {candidate.redFlags.length === 0 && candidate.greenFlags.length === 0 && (
                        <span className="text-text-muted text-xs">-</span>
                      )}
                    </div>
                  </td>

                  {/* Activity */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-text-tertiary">
                      {formatDate(candidate.lastActivityAt)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link href={`/candidates/${candidate.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </Link>
                      {candidate.assessmentCompleted && (
                        <Link href={`/dashboard/sessions/${candidate.id}`}>
                          <Button variant="ghost" size="sm">
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Replay
                          </Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
