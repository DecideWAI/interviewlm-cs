"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ArrowLeft,
  ArrowRight,
  Filter,
  Search,
  Shield,
  ExternalLink,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Human Review Queue for Administrators
 *
 * Allows admins to:
 * - Review high-risk bias audit cases
 * - Approve, adjust, or flag evaluations
 * - Add notes and document decisions
 * - Track review history
 */

interface ReviewCase {
  id: string;
  sessionId: string;
  candidateId: string;
  evaluationId: string;
  checkType: string;
  riskLevel: "high" | "medium";
  biasesDetected: Array<{
    type: string;
    confidence: number;
    description: string;
    suggestedAction: string;
  }>;
  originalScore: number;
  evaluationContext: {
    questionTitle: string;
    questionDifficulty: string;
    responseTime: number;
    aiInteractions: number;
  };
  candidateInfo: {
    anonymizedId: string;
    seniority: string;
    techStack: string[];
  };
  createdAt: string;
  assignedTo?: string;
}

interface ReviewDecision {
  outcome: "confirmed" | "adjusted" | "dismissed";
  adjustedScore?: number;
  notes: string;
}

// Mock data for demonstration
const mockCases: ReviewCase[] = [
  {
    id: "review_001",
    sessionId: "sess_abc123",
    candidateId: "cand_xyz789",
    evaluationId: "eval_001",
    checkType: "response_evaluation",
    riskLevel: "high",
    biasesDetected: [
      {
        type: "language_complexity_bias",
        confidence: 0.85,
        description: "Response penalized for using simpler language despite correct solution",
        suggestedAction: "Review scoring rubric for language complexity weighting",
      },
      {
        type: "evaluator_drift",
        confidence: 0.72,
        description: "Score inconsistent with similar responses from other candidates",
        suggestedAction: "Compare with baseline scores for this question",
      },
    ],
    originalScore: 62,
    evaluationContext: {
      questionTitle: "Implement a Rate Limiter",
      questionDifficulty: "medium",
      responseTime: 1800,
      aiInteractions: 8,
    },
    candidateInfo: {
      anonymizedId: "CAND-A7X9",
      seniority: "mid",
      techStack: ["Node.js", "TypeScript"],
    },
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "review_002",
    sessionId: "sess_def456",
    candidateId: "cand_uvw321",
    evaluationId: "eval_002",
    checkType: "response_evaluation",
    riskLevel: "high",
    biasesDetected: [
      {
        type: "timing_pressure_bias",
        confidence: 0.78,
        description: "Score may be affected by time pressure rather than capability",
        suggestedAction: "Consider time-adjusted scoring",
      },
    ],
    originalScore: 55,
    evaluationContext: {
      questionTitle: "Design a Caching System",
      questionDifficulty: "hard",
      responseTime: 2400,
      aiInteractions: 12,
    },
    candidateInfo: {
      anonymizedId: "CAND-B3Y2",
      seniority: "senior",
      techStack: ["Python", "Redis"],
    },
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "review_003",
    sessionId: "sess_ghi789",
    candidateId: "cand_rst654",
    evaluationId: "eval_003",
    checkType: "question_generation",
    riskLevel: "medium",
    biasesDetected: [
      {
        type: "question_difficulty_variance",
        confidence: 0.65,
        description: "Generated question may be significantly harder than calibrated difficulty",
        suggestedAction: "Verify question difficulty against seed parameters",
      },
    ],
    originalScore: 48,
    evaluationContext: {
      questionTitle: "Build a Distributed Lock",
      questionDifficulty: "medium",
      responseTime: 2100,
      aiInteractions: 15,
    },
    candidateInfo: {
      anonymizedId: "CAND-C5Z8",
      seniority: "mid",
      techStack: ["Go", "Kubernetes"],
    },
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
];

export default function ReviewQueuePage() {
  const [cases, setCases] = useState<ReviewCase[]>(mockCases);
  const [selectedCase, setSelectedCase] = useState<ReviewCase | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>({
    outcome: "confirmed",
    notes: "",
  });
  const [filterRisk, setFilterRisk] = useState<"all" | "high" | "medium">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedBiases, setExpandedBiases] = useState<Record<string, boolean>>({});

  const filteredCases = cases.filter((c) => {
    if (filterRisk !== "all" && c.riskLevel !== filterRisk) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        c.sessionId.toLowerCase().includes(query) ||
        c.candidateInfo.anonymizedId.toLowerCase().includes(query) ||
        c.evaluationContext.questionTitle.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleSelectCase = (reviewCase: ReviewCase) => {
    setSelectedCase(reviewCase);
    setDecision({ outcome: "confirmed", notes: "" });
  };

  const handleSubmitDecision = () => {
    if (!selectedCase) return;

    // In production, this would call an API
    console.log("Submitting decision:", {
      caseId: selectedCase.id,
      decision,
    });

    // Remove from queue and go to next
    const currentIndex = cases.findIndex((c) => c.id === selectedCase.id);
    const newCases = cases.filter((c) => c.id !== selectedCase.id);
    setCases(newCases);

    if (newCases.length > 0) {
      const nextIndex = Math.min(currentIndex, newCases.length - 1);
      setSelectedCase(newCases[nextIndex]);
    } else {
      setSelectedCase(null);
    }

    setDecision({ outcome: "confirmed", notes: "" });
  };

  const getRiskColor = (risk: ReviewCase["riskLevel"]) => {
    return risk === "high"
      ? "bg-error/10 text-error border-error/20"
      : "bg-warning/10 text-warning border-warning/20";
  };

  const getBiasConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-error";
    if (confidence >= 0.6) return "text-warning";
    return "text-info";
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Left Panel - Case List */}
        <div className="w-1/3 border-r border-border h-screen overflow-y-auto">
          <div className="p-4 border-b border-border sticky top-0 bg-background z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-text-primary">Review Queue</h1>
                <p className="text-xs text-text-tertiary">
                  {cases.length} case{cases.length !== 1 ? "s" : ""} pending review
                </p>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <Input
                  placeholder="Search cases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-text-tertiary" />
                <select
                  value={filterRisk}
                  onChange={(e) => setFilterRisk(e.target.value as typeof filterRisk)}
                  className="bg-background-secondary border border-border rounded-md px-2 py-1 text-sm text-text-primary flex-1"
                >
                  <option value="all">All Risk Levels</option>
                  <option value="high">High Risk Only</option>
                  <option value="medium">Medium Risk Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Case List */}
          <div className="p-2 space-y-2">
            {filteredCases.map((reviewCase) => (
              <div
                key={reviewCase.id}
                onClick={() => handleSelectCase(reviewCase)}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer transition-all",
                  selectedCase?.id === reviewCase.id
                    ? "bg-primary/5 border-primary/30"
                    : "bg-background-secondary border-border hover:border-border-secondary"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge className={cn("border text-xs", getRiskColor(reviewCase.riskLevel))}>
                    {reviewCase.riskLevel.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-text-tertiary">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {new Date(reviewCase.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-text-primary truncate">
                  {reviewCase.evaluationContext.questionTitle}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-text-tertiary">
                    {reviewCase.candidateInfo.anonymizedId}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {reviewCase.biasesDetected.length} bias{reviewCase.biasesDetected.length !== 1 ? "es" : ""}
                  </span>
                </div>
              </div>
            ))}

            {filteredCases.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                <p className="text-sm text-text-tertiary">
                  {cases.length === 0 ? "No cases pending review" : "No cases match filter"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Case Details */}
        <div className="flex-1 h-screen overflow-y-auto">
          {selectedCase ? (
            <div className="p-6 space-y-6">
              {/* Case Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge className={cn("border", getRiskColor(selectedCase.riskLevel))}>
                      {selectedCase.riskLevel.toUpperCase()} RISK
                    </Badge>
                    <span className="text-sm text-text-tertiary">
                      {selectedCase.checkType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-text-primary">
                    {selectedCase.evaluationContext.questionTitle}
                  </h2>
                </div>
                <Button variant="secondary" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Full Session
                </Button>
              </div>

              {/* Context Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="border-border-secondary">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Candidate Info
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">ID</span>
                        <span className="text-text-secondary">{selectedCase.candidateInfo.anonymizedId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Seniority</span>
                        <span className="text-text-secondary capitalize">{selectedCase.candidateInfo.seniority}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Tech Stack</span>
                        <span className="text-text-secondary">{selectedCase.candidateInfo.techStack.join(", ")}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border-secondary">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Evaluation Context
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Difficulty</span>
                        <span className="text-text-secondary capitalize">{selectedCase.evaluationContext.questionDifficulty}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Response Time</span>
                        <span className="text-text-secondary">{formatTime(selectedCase.evaluationContext.responseTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">AI Interactions</span>
                        <span className="text-text-secondary">{selectedCase.evaluationContext.aiInteractions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Original Score</span>
                        <span className="text-text-primary font-semibold">{selectedCase.originalScore}/100</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detected Biases */}
              <Card className="border-border-secondary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Detected Biases ({selectedCase.biasesDetected.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedCase.biasesDetected.map((bias, idx) => {
                    const isExpanded = expandedBiases[`${selectedCase.id}-${idx}`];
                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-lg bg-background-secondary border border-border"
                      >
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() =>
                            setExpandedBiases((prev) => ({
                              ...prev,
                              [`${selectedCase.id}-${idx}`]: !prev[`${selectedCase.id}-${idx}`],
                            }))
                          }
                        >
                          <div className="flex items-center gap-3">
                            <Shield className="h-4 w-4 text-warning" />
                            <div>
                              <p className="text-sm font-medium text-text-primary">
                                {bias.type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                              </p>
                              <p className={cn("text-xs", getBiasConfidenceColor(bias.confidence))}>
                                Confidence: {Math.round(bias.confidence * 100)}%
                              </p>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-text-tertiary" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-text-tertiary" />
                          )}
                        </div>
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-border space-y-3">
                            <div>
                              <p className="text-xs text-text-tertiary mb-1">Description</p>
                              <p className="text-sm text-text-secondary">{bias.description}</p>
                            </div>
                            <div>
                              <p className="text-xs text-text-tertiary mb-1">Suggested Action</p>
                              <p className="text-sm text-info">{bias.suggestedAction}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Review Decision */}
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Your Decision
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Outcome Selection */}
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setDecision((d) => ({ ...d, outcome: "confirmed" }))}
                      className={cn(
                        "p-4 rounded-lg border-2 transition-all text-center",
                        decision.outcome === "confirmed"
                          ? "border-success bg-success/10"
                          : "border-border hover:border-border-secondary"
                      )}
                    >
                      <CheckCircle2
                        className={cn(
                          "h-6 w-6 mx-auto mb-2",
                          decision.outcome === "confirmed" ? "text-success" : "text-text-tertiary"
                        )}
                      />
                      <p className="text-sm font-medium text-text-primary">Confirm</p>
                      <p className="text-xs text-text-tertiary">Score is accurate</p>
                    </button>

                    <button
                      onClick={() => setDecision((d) => ({ ...d, outcome: "adjusted" }))}
                      className={cn(
                        "p-4 rounded-lg border-2 transition-all text-center",
                        decision.outcome === "adjusted"
                          ? "border-warning bg-warning/10"
                          : "border-border hover:border-border-secondary"
                      )}
                    >
                      <Scale
                        className={cn(
                          "h-6 w-6 mx-auto mb-2",
                          decision.outcome === "adjusted" ? "text-warning" : "text-text-tertiary"
                        )}
                      />
                      <p className="text-sm font-medium text-text-primary">Adjust</p>
                      <p className="text-xs text-text-tertiary">Modify the score</p>
                    </button>

                    <button
                      onClick={() => setDecision((d) => ({ ...d, outcome: "dismissed" }))}
                      className={cn(
                        "p-4 rounded-lg border-2 transition-all text-center",
                        decision.outcome === "dismissed"
                          ? "border-error bg-error/10"
                          : "border-border hover:border-border-secondary"
                      )}
                    >
                      <XCircle
                        className={cn(
                          "h-6 w-6 mx-auto mb-2",
                          decision.outcome === "dismissed" ? "text-error" : "text-text-tertiary"
                        )}
                      />
                      <p className="text-sm font-medium text-text-primary">Dismiss</p>
                      <p className="text-xs text-text-tertiary">False positive</p>
                    </button>
                  </div>

                  {/* Adjusted Score Input */}
                  {decision.outcome === "adjusted" && (
                    <div>
                      <label className="text-sm text-text-secondary block mb-2">
                        Adjusted Score (Original: {selectedCase.originalScore})
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={decision.adjustedScore || selectedCase.originalScore}
                        onChange={(e) =>
                          setDecision((d) => ({
                            ...d,
                            adjustedScore: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="w-32"
                      />
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="text-sm text-text-secondary block mb-2">
                      Review Notes {decision.outcome !== "confirmed" && "(required)"}
                    </label>
                    <Textarea
                      placeholder="Add context for this decision..."
                      value={decision.notes}
                      onChange={(e) => setDecision((d) => ({ ...d, notes: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={cases.indexOf(selectedCase) === 0}
                        onClick={() => {
                          const idx = cases.indexOf(selectedCase);
                          if (idx > 0) setSelectedCase(cases[idx - 1]);
                        }}
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={cases.indexOf(selectedCase) === cases.length - 1}
                        onClick={() => {
                          const idx = cases.indexOf(selectedCase);
                          if (idx < cases.length - 1) setSelectedCase(cases[idx + 1]);
                        }}
                      >
                        Next
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleSubmitDecision}
                      disabled={
                        decision.outcome !== "confirmed" && !decision.notes.trim()
                      }
                    >
                      Submit Decision
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Scale className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Select a Case to Review
                </h2>
                <p className="text-sm text-text-tertiary max-w-md">
                  Choose a case from the queue on the left to review detected biases
                  and submit your decision.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
