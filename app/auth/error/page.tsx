"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import BRANDING from "@/lib/branding";

const errorMessages: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: "Server Configuration Error",
    description: "There is a problem with the server configuration. Please contact support if this persists.",
  },
  AccessDenied: {
    title: "Access Denied",
    description: "You do not have permission to sign in. Please contact your administrator.",
  },
  Verification: {
    title: "Verification Error",
    description: "The verification link may have expired or already been used.",
  },
  // B2B-specific errors
  PersonalEmailNotAllowed: {
    title: "Personal Email Not Allowed",
    description: `${BRANDING.name} is for businesses only. Please sign in with your company email address (e.g., you@company.com). Personal email providers like Gmail, Outlook, and Yahoo are not supported.`,
  },
  EmailRequired: {
    title: "Email Required",
    description: "We couldn't retrieve your email from the sign-in provider. Please try again or use a different sign-in method.",
  },
  InvalidOrExpiredToken: {
    title: "Invalid or Expired Link",
    description: "This domain verification link is invalid or has expired. Please request a new verification email from your organization settings.",
  },
  MissingVerificationToken: {
    title: "Missing Verification Token",
    description: "The verification link is incomplete. Please use the full link from your verification email.",
  },
  InvalidVerificationToken: {
    title: "Invalid Verification Token",
    description: "The verification token format is invalid. Please use the link from your verification email.",
  },
  "Domain verification failed": {
    title: "Verification Failed",
    description: "We couldn't verify your domain. Please try again or contact support for assistance.",
  },
  OAuthSignin: {
    title: "OAuth Sign In Error",
    description: "Could not start the sign in process. Please try again.",
  },
  OAuthCallback: {
    title: "OAuth Callback Error",
    description: "Could not complete the sign in process. Please try again.",
  },
  OAuthCreateAccount: {
    title: "Account Creation Error",
    description: "Could not create your account. An account may already exist with this email.",
  },
  EmailCreateAccount: {
    title: "Account Creation Error",
    description: "Could not create your account. Please try again.",
  },
  Callback: {
    title: "Callback Error",
    description: "There was an error during the authentication callback.",
  },
  OAuthAccountNotLinked: {
    title: "Account Not Linked",
    description: "This email is already associated with another account. Please sign in with the original provider.",
  },
  EmailSignin: {
    title: "Email Sign In Error",
    description: "Could not send the verification email. Please try again.",
  },
  CredentialsSignin: {
    title: "Sign In Failed",
    description: "Invalid email or password. Please check your credentials and try again.",
  },
  SessionRequired: {
    title: "Session Required",
    description: "Please sign in to access this page.",
  },
  Default: {
    title: "Authentication Error",
    description: "An unexpected error occurred during authentication.",
  },
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "Default";
  const errorInfo = errorMessages[error] || errorMessages.Default;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {/* Background gradient */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-error/10 rounded-full blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-error/5 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-semibold text-text-primary">
            InterviewLM
          </span>
        </Link>

        <Card className="border-border-secondary">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-error" />
              </div>
            </div>
            <CardTitle className="text-2xl">{errorInfo.title}</CardTitle>
            <CardDescription className="text-text-secondary">
              {errorInfo.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error === "Configuration" && (
              <div className="p-3 rounded-lg bg-background-tertiary text-sm text-text-tertiary">
                <p className="font-medium text-text-secondary mb-1">Technical Details</p>
                <p>Error code: {error}</p>
                <p className="mt-2 text-xs">
                  This usually means OAuth credentials are missing or misconfigured.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all bg-primary text-white hover:bg-primary-hover active:bg-primary-active shadow-sm h-9 px-4 w-full"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all border border-border text-text-primary hover:bg-background-hover hover:border-border-hover h-9 px-4 w-full"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Home
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Need help?{" "}
          <Link href="mailto:support@interviewlm.com" className="underline hover:text-text-secondary">
            Contact Support
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    }>
      <ErrorContent />
    </Suspense>
  );
}
