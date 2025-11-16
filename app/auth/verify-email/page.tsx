"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";
import { toast } from "sonner";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isVerifying, setIsVerifying] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<"success" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setVerificationStatus("error");
        setErrorMessage("No verification token provided");
        setIsVerifying(false);
        return;
      }

      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setVerificationStatus("success");
          toast.success("Email verified successfully");
          // Redirect to signin after 3 seconds
          setTimeout(() => router.push("/auth/signin"), 3000);
        } else {
          setVerificationStatus("error");
          setErrorMessage(data.error || "Verification failed");
          toast.error(data.error || "Verification failed");
        }
      } catch (error) {
        setVerificationStatus("error");
        setErrorMessage("Something went wrong");
        toast.error("Something went wrong");
      } finally {
        setIsVerifying(false);
      }
    };

    verifyEmail();
  }, [token, router]);

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-text-secondary">Verifying your email...</p>
        </div>
      </div>
    );
  }

  if (verificationStatus === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {/* Background gradient */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

        <div className="relative w-full max-w-md">
          <Link href="/" className="flex items-center justify-center gap-3 mb-8">
            <Logo variant="icon" size={32} />
            <span className="text-xl font-semibold text-text-primary">
              InterviewLM
            </span>
          </Link>

          <Card className="border-border-secondary">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
              </div>
              <CardTitle className="text-2xl">Email verified!</CardTitle>
              <CardDescription>
                Your email has been successfully verified
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="p-4 bg-background-tertiary border border-border rounded-lg">
                <p className="text-sm text-text-secondary text-center">
                  You can now sign in to your account
                </p>
              </div>

              <div className="text-center">
                <p className="text-sm text-text-tertiary mb-4">
                  Redirecting you to sign in...
                </p>
                <Link href="/auth/signin" className="block">
                  <Button className="w-full" size="lg">
                    Continue to sign in
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {/* Background gradient */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

      <div className="relative w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-semibold text-text-primary">
            InterviewLM
          </span>
        </Link>

        <Card className="border-border-secondary">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-error/10 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-error" />
              </div>
            </div>
            <CardTitle className="text-2xl">Verification failed</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="p-4 bg-background-tertiary border border-border rounded-lg">
              <p className="text-sm text-text-secondary">
                The verification link may have expired or is invalid. Please request a new verification email.
              </p>
            </div>

            <Link href="/auth/signin" className="block">
              <Button variant="outline" className="w-full">
                Back to sign in
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
