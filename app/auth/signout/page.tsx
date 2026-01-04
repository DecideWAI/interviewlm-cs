"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { LogOut, ArrowLeft, Loader2 } from "lucide-react";

export default function SignOutPage() {
  useEffect(() => {
    // Auto sign out after a short delay
    const timer = setTimeout(() => {
      signOut({ callbackUrl: "/" });
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {/* Background gradient */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

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
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            </div>
            <CardTitle className="text-2xl">Signing out...</CardTitle>
            <CardDescription className="text-text-secondary">
              You are being signed out of your account
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3">
              <Button onClick={handleSignOut} variant="primary" className="w-full">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out Now
              </Button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all border border-border text-text-primary hover:bg-background-hover hover:border-border-hover h-9 px-4 w-full"
              >
                <ArrowLeft className="h-4 w-4" />
                Cancel
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Thank you for using InterviewLM
        </p>
      </div>
    </div>
  );
}
