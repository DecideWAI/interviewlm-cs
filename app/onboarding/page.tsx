"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Rocket,
  Building2,
  Target,
  Sparkles,
  Users,
  Code,
  Zap,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

type OnboardingStep = "welcome" | "organization" | "complete";

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [loading, setLoading] = useState(false);

  // Organization details
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");

  const handleOrganizationSetup = async () => {
    if (!orgName.trim()) {
      toast.error("Organization name is required");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/organization/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName,
          description: orgDescription,
        }),
      });

      if (response.ok) {
        setCurrentStep("complete");
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to set up organization");
      }
    } catch (error) {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
  };

  const handleComplete = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {/* Background effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

      <div className="relative w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-semibold text-text-primary">
            InterviewLM
          </span>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`h-2 w-20 rounded-full ${currentStep === "welcome" ? "bg-primary" : "bg-background-tertiary"}`} />
          <div className={`h-2 w-20 rounded-full ${currentStep === "organization" ? "bg-primary" : "bg-background-tertiary"}`} />
          <div className={`h-2 w-20 rounded-full ${currentStep === "complete" ? "bg-primary" : "bg-background-tertiary"}`} />
        </div>

        {/* Welcome Step */}
        {currentStep === "welcome" && (
          <Card className="border-border-secondary animate-fade-in">
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Rocket className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-3xl mb-2">Welcome to InterviewLM!</CardTitle>
              <CardDescription className="text-base">
                Let's get your account set up in just a few steps
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center mx-auto mb-3">
                    <Code className="h-6 w-6 text-success" />
                  </div>
                  <h3 className="font-medium text-text-primary mb-1">AI-Powered Interviews</h3>
                  <p className="text-sm text-text-secondary">
                    Evaluate candidates with Claude Code assistance
                  </p>
                </div>

                <div className="text-center">
                  <div className="h-12 w-12 rounded-lg bg-info/10 flex items-center justify-center mx-auto mb-3">
                    <Users className="h-6 w-6 text-info" />
                  </div>
                  <h3 className="font-medium text-text-primary mb-1">Team Collaboration</h3>
                  <p className="text-sm text-text-secondary">
                    Invite teammates and review candidates together
                  </p>
                </div>

                <div className="text-center">
                  <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center mx-auto mb-3">
                    <Zap className="h-6 w-6 text-warning" />
                  </div>
                  <h3 className="font-medium text-text-primary mb-1">Real-time Analysis</h3>
                  <p className="text-sm text-text-secondary">
                    Get instant insights on coding ability
                  </p>
                </div>
              </div>

              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg mb-6">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-text-primary mb-1">
                      You've got 3 free trial credits!
                    </p>
                    <p className="text-xs text-text-secondary">
                      Conduct up to 3 interviews to experience the full power of InterviewLM
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSkip}
                >
                  Skip Setup
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => setCurrentStep("organization")}
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Organization Setup Step */}
        {currentStep === "organization" && (
          <Card className="border-border-secondary animate-fade-in">
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-3xl mb-2">Set Up Your Organization</CardTitle>
              <CardDescription className="text-base">
                Tell us a bit about your company
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              <div className="space-y-4 mb-6">
                <div>
                  <label htmlFor="orgName" className="text-sm font-medium text-text-primary mb-2 block">
                    Organization Name <span className="text-error">*</span>
                  </label>
                  <Input
                    id="orgName"
                    placeholder="Acme Inc."
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    autoFocus
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    This will be visible to candidates during interviews
                  </p>
                </div>

                <div>
                  <label htmlFor="orgDescription" className="text-sm font-medium text-text-primary mb-2 block">
                    Description <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <Textarea
                    id="orgDescription"
                    placeholder="We're building the future of..."
                    value={orgDescription}
                    onChange={(e) => setOrgDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setCurrentStep("welcome")}
                  disabled={loading}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSkip}
                  disabled={loading}
                >
                  Skip for Now
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleOrganizationSetup}
                  disabled={loading || !orgName.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complete Step */}
        {currentStep === "complete" && (
          <Card className="border-border-secondary animate-fade-in">
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
              </div>
              <CardTitle className="text-3xl mb-2">You're All Set!</CardTitle>
              <CardDescription className="text-base">
                Your account is ready to start conducting AI-powered interviews
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              <div className="space-y-4 mb-6">
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent hover:border-primary/40 transition cursor-pointer">
                  <Link href="/assessments/new">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Target className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium text-text-primary mb-1">
                            Create Your First Assessment
                          </h3>
                          <p className="text-sm text-text-secondary">
                            Build a custom technical interview in minutes
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-text-tertiary ml-auto flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>

                <Card className="border-border hover:border-border-secondary transition cursor-pointer">
                  <Link href="/interview/demo">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                          <Code className="h-5 w-5 text-success" />
                        </div>
                        <div>
                          <h3 className="font-medium text-text-primary mb-1">
                            Try the Demo Interview
                          </h3>
                          <p className="text-sm text-text-secondary">
                            Experience the candidate view firsthand
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-text-tertiary ml-auto flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>

                <Card className="border-border hover:border-border-secondary transition cursor-pointer">
                  <Link href="/settings?tab=team">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
                          <Users className="h-5 w-5 text-info" />
                        </div>
                        <div>
                          <h3 className="font-medium text-text-primary mb-1">
                            Invite Your Team
                          </h3>
                          <p className="text-sm text-text-secondary">
                            Collaborate with teammates on hiring
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-text-tertiary ml-auto flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              </div>

              <Button
                variant="primary"
                className="w-full"
                size="lg"
                onClick={handleComplete}
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-text-tertiary">
            Need help getting started?{" "}
            <Link href="/docs" className="text-primary hover:text-primary-hover">
              View documentation
            </Link>{" "}
            or{" "}
            <a href="mailto:support@interviewlm.com" className="text-primary hover:text-primary-hover">
              contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
