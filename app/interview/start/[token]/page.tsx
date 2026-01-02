"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Code,
  Terminal,
  MessageSquare,
  AlertCircle,
  Calendar,
  User,
  Building2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

interface CandidateData {
  candidate: {
    id: string;
    name: string;
    email: string;
    status: string;
    invitedAt: string;
    invitationExpiresAt: string;
    deadlineAt: string | null;
  };
  assessment: {
    id: string;
    title: string;
    description: string;
    role: string;
    seniority: string;
    duration: number;
    techStack: string[];
  };
  organization: {
    name: string;
    slug: string;
  };
  isValid: boolean;
  isExpired: boolean;
  isCompleted: boolean;
  canStart: boolean;
  sessionId?: string;
}

export default function CandidateLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CandidateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchCandidateData();
  }, []);

  const fetchCandidateData = async () => {
    try {
      const response = await fetch(`/api/interview/validate/${token}`);

      if (response.ok) {
        const json = await response.json();
        setData(json);
      } else {
        const json = await response.json();
        setError(json.error || "Invalid invitation link");
      }
    } catch (err) {
      setError("Failed to load interview details");
    } finally {
      setLoading(false);
    }
  };

  const handleStartInterview = async () => {
    setStarting(true);

    try {
      const response = await fetch(`/api/interview/start/${token}`, {
        method: "POST",
      });

      if (response.ok) {
        const json = await response.json();
        router.push(`/interview/${json.candidateId}`);
      } else {
        const json = await response.json();
        toast.error(json.error || "Failed to start interview");
        setStarting(false);
      }
    } catch (err) {
      toast.error("Something went wrong");
      setStarting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-text-secondary">Loading interview details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="relative w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Logo variant="icon" size={32} />
            <span className="text-xl font-semibold text-text-primary">
              InterviewLM
            </span>
          </div>

          <Card className="border-border-secondary">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-full bg-error/10 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-error" />
                </div>
              </div>
              <CardTitle className="text-2xl">Invalid Invitation</CardTitle>
              <CardDescription>{error || "This invitation link is not valid"}</CardDescription>
            </CardHeader>

            <CardContent>
              <div className="p-4 bg-background-tertiary border border-border rounded-lg">
                <p className="text-sm text-text-secondary">
                  This could mean the link has expired, was already used, or is incorrect.
                  Please contact the company that invited you for a new link.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Expired state
  if (data.isExpired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="relative w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Logo variant="icon" size={32} />
            <span className="text-xl font-semibold text-text-primary">
              InterviewLM
            </span>
          </div>

          <Card className="border-border-secondary">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-warning" />
                </div>
              </div>
              <CardTitle className="text-2xl">Invitation Expired</CardTitle>
              <CardDescription>
                This invitation expired on {formatDate(data.candidate.invitationExpiresAt)}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="p-4 bg-background-tertiary border border-border rounded-lg mb-6">
                <p className="text-sm text-text-secondary">
                  Please contact {data.organization.name} to request a new invitation link.
                </p>
              </div>

              <div className="text-center">
                <p className="text-xs text-text-tertiary">
                  If you believe this is an error, please reach out to the company that invited you.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Already completed state
  if (data.isCompleted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="relative w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Logo variant="icon" size={32} />
            <span className="text-xl font-semibold text-text-primary">
              InterviewLM
            </span>
          </div>

          <Card className="border-border-secondary">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
              </div>
              <CardTitle className="text-2xl">Interview Completed</CardTitle>
              <CardDescription>
                You've already completed this interview
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="p-4 bg-background-tertiary border border-border rounded-lg">
                <p className="text-sm text-text-secondary">
                  Thank you for completing the {data.assessment.title} assessment.
                  {data.organization.name} will review your submission and be in touch soon.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Valid invitation - show details and start button
  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

      <div className="relative max-w-4xl mx-auto px-4 py-12">
        {/* Logo and Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-semibold text-text-primary">
            InterviewLM
          </span>
        </div>

        {/* Main Card */}
        <Card className="border-border-secondary mb-6">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Code className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-3xl mb-2">You're Invited!</CardTitle>
            <CardDescription className="text-base">
              {data.organization.name} has invited you to complete a technical interview
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Candidate Info */}
            <div className="p-4 bg-background-tertiary border border-border rounded-lg mb-6">
              <div className="flex items-center gap-3 mb-3">
                <User className="h-5 w-5 text-text-tertiary" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{data.candidate.name}</p>
                  <p className="text-xs text-text-tertiary">{data.candidate.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-text-tertiary" />
                <p className="text-sm text-text-secondary">Invited by {data.organization.name}</p>
              </div>
            </div>

            {/* Assessment Details */}
            <div className="space-y-4 mb-6">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  {data.assessment.title}
                </h3>
                {data.assessment.description && (
                  <p className="text-sm text-text-secondary mb-4">
                    {data.assessment.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">{data.assessment.role}</Badge>
                  <Badge variant="default">{data.assessment.seniority}</Badge>
                  <Badge variant="default">
                    <Clock className="h-3 w-3 mr-1" />
                    {data.assessment.duration} minutes
                  </Badge>
                </div>
              </div>

              {data.assessment.techStack && data.assessment.techStack.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-text-secondary mb-2">Technologies</p>
                  <div className="flex flex-wrap gap-2">
                    {data.assessment.techStack.map((tech) => (
                      <Badge key={tech} variant="info">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* What to Expect */}
            <div className="space-y-3 mb-6">
              <h4 className="text-sm font-semibold text-text-primary">What to Expect</h4>

              <div className="flex items-start gap-3 p-3 bg-background-tertiary rounded-lg">
                <Code className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Live Coding Environment</p>
                  <p className="text-xs text-text-secondary">
                    Write and test your code in a real development environment
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-background-tertiary rounded-lg">
                <MessageSquare className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-text-primary">AI Assistant</p>
                  <p className="text-xs text-text-secondary">
                    Use Claude Code to help you solve problems - just like a real project
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-background-tertiary rounded-lg">
                <Terminal className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Integrated Terminal</p>
                  <p className="text-xs text-text-secondary">
                    Run tests and commands in a sandboxed environment
                  </p>
                </div>
              </div>
            </div>

            {/* Deadline Warning */}
            {data.candidate.deadlineAt && (
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg mb-6">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-text-primary mb-1">
                      Complete by {formatDate(data.candidate.deadlineAt)}
                    </p>
                    <p className="text-xs text-text-secondary">
                      Please complete this interview before the deadline
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* CTA */}
            <Button
              variant="primary"
              className="w-full"
              size="lg"
              onClick={handleStartInterview}
              disabled={starting || !data.canStart}
            >
              {starting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Starting Interview...
                </>
              ) : (
                <>
                  Start Interview
                  <ArrowRight className="h-5 w-5 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-text-tertiary mb-4">
            This interview will be recorded for evaluation purposes
          </p>
          <p className="text-xs text-text-muted">
            By starting this interview, you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-text-secondary">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-text-secondary">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
