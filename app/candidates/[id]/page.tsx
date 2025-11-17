"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { CandidateProfile } from "@/types/analytics";
import {
  ArrowLeft,
  Mail,
  Calendar,
  Clock,
  Award,
  Code,
  Bot,
  FileCode,
  Brain,
  AlertTriangle,
  ThumbsUp,
  CheckCircle2,
  XCircle,
  TrendingUp,
  MessageSquare,
  PlayCircle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CandidateDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CandidateDetailPage({ params }: CandidateDetailPageProps) {
  const { id } = use(params);
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch candidate details from API
  useEffect(() => {
    async function fetchCandidate() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/candidates/${id}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Candidate not found");
          } else {
            throw new Error(`Failed to fetch candidate: ${response.statusText}`);
          }
          return;
        }

        const data = await response.json();
        setCandidate(data.candidate);
      } catch (err) {
        console.error("Error fetching candidate:", err);
        setError(err instanceof Error ? err.message : "Failed to load candidate");
      } finally {
        setLoading(false);
      }
    }

    fetchCandidate();
  }, [id]);

  // Loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <Spinner size="lg" />
            <p className="text-text-secondary">Loading candidate details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Error or not found state
  if (error || !candidate) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="text-center py-12 space-y-4">
            <AlertTriangle className="h-12 w-12 text-error mx-auto" />
            <h2 className="text-xl font-semibold text-text-primary">
              {error || "Candidate not found"}
            </h2>
            <p className="text-text-secondary">
              {error === "Candidate not found"
                ? "The candidate you're looking for doesn't exist or you don't have access to it."
                : "There was an error loading the candidate details."}
            </p>
            <Link href="/candidates">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Candidates
              </Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusBadge = () => {
    switch (candidate.status) {
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
        return <Badge variant="default" className="capitalize">{candidate.status.replace(/_/g, " ")}</Badge>;
    }
  };

  const getScoreColor = (score?: number) => {
    if (!score) return "text-text-muted";
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-error";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-text-primary">
                  {candidate.name}
                </h1>
                {getStatusBadge()}
              </div>
              <div className="flex items-center gap-4 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {candidate.email}
                </span>
                <span className="flex items-center gap-1 capitalize">
                  <Award className="h-4 w-4" />
                  {candidate.appliedRole} • {candidate.targetSeniority}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Applied {new Date(candidate.appliedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline">
              <MessageSquare className="h-4 w-4 mr-2" />
              Leave Note
            </Button>
            {candidate.assessmentCompletedAt && (
              <Button variant="primary">
                <PlayCircle className="h-4 w-4 mr-2" />
                View Session
              </Button>
            )}
          </div>
        </div>

        {/* Overall Score Card */}
        {candidate.overallScore && (
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-8">
            <div className="grid md:grid-cols-5 gap-6">
              {/* Overall Score */}
              <div className="text-center">
                <p className="text-sm text-text-tertiary mb-2">Overall Score</p>
                <p className={cn(
                  "text-5xl font-bold mb-2",
                  getScoreColor(candidate.overallScore)
                )}>
                  {candidate.overallScore}
                </p>
                <p className="text-xs text-text-muted">out of 100</p>
              </div>

              {/* Technical Score */}
              <div className="text-center">
                <Code className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-sm text-text-tertiary mb-1">Technical</p>
                <p className={cn(
                  "text-2xl font-bold",
                  getScoreColor(candidate.technicalScore)
                )}>
                  {candidate.technicalScore}
                </p>
              </div>

              {/* AI Collaboration */}
              <div className="text-center">
                <Bot className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-sm text-text-tertiary mb-1">AI Collaboration</p>
                <p className={cn(
                  "text-2xl font-bold",
                  getScoreColor(candidate.aiCollaborationScore)
                )}>
                  {candidate.aiCollaborationScore}
                </p>
              </div>

              {/* Code Quality */}
              <div className="text-center">
                <FileCode className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-sm text-text-tertiary mb-1">Code Quality</p>
                <p className={cn(
                  "text-2xl font-bold",
                  getScoreColor(candidate.codeQualityScore)
                )}>
                  {candidate.codeQualityScore}
                </p>
              </div>

              {/* Problem Solving */}
              <div className="text-center">
                <Brain className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-sm text-text-tertiary mb-1">Problem Solving</p>
                <p className={cn(
                  "text-2xl font-bold",
                  getScoreColor(candidate.problemSolvingScore)
                )}>
                  {candidate.problemSolvingScore}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Performance Metrics */}
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Performance Metrics
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Completion Rate</span>
                    <span className="text-sm font-medium text-text-primary">
                      {candidate.completionRate !== undefined ? ((candidate.completionRate * 100).toFixed(0) + "%") : "—"}
                    </span>
                  </div>
                  <Progress value={(candidate.completionRate || 0) * 100} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Time Used</span>
                    <span className="text-sm font-medium text-text-primary">
                      {candidate.timeUsed || 0}/{candidate.timeAllocated || "—"} min
                    </span>
                  </div>
                  <Progress
                    value={candidate.timeAllocated && candidate.timeUsed ? ((candidate.timeUsed / candidate.timeAllocated) * 100) : 0}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Problems Solved</span>
                    <span className="text-sm font-medium text-text-primary">
                      {candidate.problemsSolved || 0}/{candidate.problemsAttempted || 0}
                    </span>
                  </div>
                  <Progress
                    value={candidate.problemsAttempted && candidate.problemsSolved ? ((candidate.problemsSolved / candidate.problemsAttempted) * 100) : 0}
                  />
                </div>

                {candidate.testsPassed !== undefined && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-secondary">Tests Passed</span>
                      <span className="text-sm font-medium text-text-primary">
                        {candidate.testsPassed}/{(candidate.testsPassed || 0) + (candidate.testsFailed || 0)}
                      </span>
                    </div>
                    <Progress
                      value={((candidate.testsPassed || 0) / ((candidate.testsPassed || 0) + (candidate.testsFailed || 0))) * 100}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* AI Usage Analysis */}
            {candidate.claudeInteractions && (
              <div className="bg-background-secondary border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  AI Collaboration Analysis
                </h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center p-4 bg-background-tertiary rounded-lg">
                    <p className="text-2xl font-bold text-primary mb-1">
                      {candidate.claudeInteractions}
                    </p>
                    <p className="text-sm text-text-tertiary">AI Interactions</p>
                  </div>
                  <div className="text-center p-4 bg-background-tertiary rounded-lg">
                    <p className="text-2xl font-bold text-primary mb-1">
                      {candidate.avgPromptQuality?.toFixed(1)}/5.0
                    </p>
                    <p className="text-sm text-text-tertiary">Avg Prompt Quality</p>
                  </div>
                  <div className="text-center p-4 bg-background-tertiary rounded-lg">
                    <p className="text-2xl font-bold text-primary mb-1">
                      {((candidate.aiAcceptanceRate || 0) * 100).toFixed(0)}%
                    </p>
                    <p className="text-sm text-text-tertiary">AI Acceptance Rate</p>
                  </div>
                </div>

                {candidate.aiUsagePattern && (
                  <div className="mt-4 p-4 bg-background-tertiary rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium text-text-primary">
                        Usage Pattern:
                      </span>
                      <Badge variant="primary" className="capitalize">
                        {candidate.aiUsagePattern.replace("-", " ")}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Strengths & Areas for Improvement */}
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Assessment Summary
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Strengths */}
                <div>
                  <h4 className="text-sm font-medium text-success mb-3 flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4" />
                    Top Strengths
                  </h4>
                  {candidate.topStrengths.length > 0 ? (
                    <ul className="space-y-2">
                      {candidate.topStrengths.map((strength, i) => (
                        <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                          {strength}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-muted italic">No strengths identified yet</p>
                  )}
                </div>

                {/* Areas for Improvement */}
                <div>
                  <h4 className="text-sm font-medium text-warning mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Areas for Improvement
                  </h4>
                  {candidate.areasForImprovement.length > 0 ? (
                    <ul className="space-y-2">
                      {candidate.areasForImprovement.map((area, i) => (
                        <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                          {area}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-muted italic">No areas identified yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Flags & Timeline */}
          <div className="space-y-6">
            {/* Red Flags */}
            {(candidate.redFlags?.length ?? 0) > 0 && (
              <div className="bg-error/5 border border-error/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-error mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Red Flags ({candidate.redFlags?.length ?? 0})
                </h3>
                <div className="space-y-3">
                  {candidate.redFlags?.map((flag, i) => (
                    <div key={i} className="p-3 bg-background-secondary rounded-lg">
                      <div className="flex items-start justify-between mb-1">
                        <Badge variant="error" className="capitalize">
                          {flag.type.replace("_", " ")}
                        </Badge>
                        <Badge variant="error" className="capitalize text-xs">
                          {flag.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-text-secondary mt-2">
                        {flag.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Green Flags */}
            {(candidate.greenFlags?.length ?? 0) > 0 && (
              <div className="bg-success/5 border border-success/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-success mb-4 flex items-center gap-2">
                  <ThumbsUp className="h-5 w-5" />
                  Green Flags ({candidate.greenFlags?.length ?? 0})
                </h3>
                <div className="space-y-3">
                  {candidate.greenFlags?.map((flag, i) => (
                    <div key={i} className="p-3 bg-background-secondary rounded-lg">
                      <Badge variant="success" className="capitalize mb-2">
                        {flag.type.replace("_", " ")}
                      </Badge>
                      <p className="text-sm text-text-secondary">
                        {flag.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Timeline
              </h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 w-px bg-border mt-2"></div>
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium text-text-primary">Applied</p>
                    <p className="text-xs text-text-tertiary">{formatDate(candidate.appliedAt)}</p>
                  </div>
                </div>

                {candidate.invitedAt && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      {candidate.assessmentStartedAt && <div className="flex-1 w-px bg-border mt-2"></div>}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-text-primary">Invited</p>
                      <p className="text-xs text-text-tertiary">{formatDate(candidate.invitedAt)}</p>
                    </div>
                  </div>
                )}

                {candidate.assessmentStartedAt && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <PlayCircle className="h-4 w-4 text-primary" />
                      </div>
                      {candidate.assessmentCompletedAt && <div className="flex-1 w-px bg-border mt-2"></div>}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-text-primary">Started Assessment</p>
                      <p className="text-xs text-text-tertiary">{formatDate(candidate.assessmentStartedAt)}</p>
                    </div>
                  </div>
                )}

                {candidate.assessmentCompletedAt && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">Completed</p>
                      <p className="text-xs text-text-tertiary">{formatDate(candidate.assessmentCompletedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
