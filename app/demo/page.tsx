"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Play,
  Clock,
  Users,
  Sparkles,
  Video,
} from "lucide-react";

export default function DemoPage() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    company: "",
    teamSize: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-xl z-50">
        <Container size="lg">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <Logo variant="icon" size={32} />
              <span className="text-lg font-semibold text-text-primary">
                InterviewLM
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/#features" className="text-sm text-text-secondary hover:text-text-primary transition">
                Features
              </Link>
              <Link href="/pricing" className="text-sm text-text-secondary hover:text-text-primary transition">
                Pricing
              </Link>
              <Link href="/auth/signin">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/auth/signup">
                <Button size="sm">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-12 border-b border-border">
        <Container size="md">
          <div className="text-center space-y-6">
            <Badge variant="primary" className="mx-auto">
              <Video className="h-3 w-3 mr-1" />
              See It In Action
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Book a Demo
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              See how InterviewLM can transform your technical hiring process.
              Get a personalized walkthrough from our team.
            </p>
          </div>
        </Container>
      </section>

      {/* Main Content */}
      <section className="py-16">
        <Container size="lg">
          <div className="grid md:grid-cols-2 gap-12">
            {/* Benefits */}
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-text-primary mb-4">
                  What you&apos;ll learn
                </h2>
                <p className="text-text-secondary">
                  In just 30 minutes, we&apos;ll show you how InterviewLM helps you
                  hire better developers faster.
                </p>
              </div>

              <div className="space-y-4">
                {benefits.map((benefit, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <benefit.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">{benefit.title}</h3>
                      <p className="text-sm text-text-secondary mt-1">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Card className="border-border-secondary bg-background-secondary">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Clock className="h-8 w-8 text-primary" />
                    <div>
                      <h3 className="font-semibold text-text-primary">30-minute session</h3>
                      <p className="text-sm text-text-secondary">
                        Quick, focused demo tailored to your needs
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="pt-4">
                <p className="text-sm text-text-tertiary mb-3">Or try it yourself:</p>
                <Link href="/interview/demo">
                  <Button variant="outline" className="w-full">
                    <Play className="h-4 w-4 mr-2" />
                    Try Interactive Demo
                  </Button>
                </Link>
              </div>
            </div>

            {/* Form */}
            <Card className="border-border-secondary">
              <CardHeader>
                <CardTitle>Request a Demo</CardTitle>
                <CardDescription>
                  Fill out the form and we&apos;ll reach out to schedule a time that works for you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submitted ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="h-8 w-8 text-success" />
                    </div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">
                      Request Received!
                    </h3>
                    <p className="text-text-secondary mb-6">
                      We&apos;ll be in touch within 24 hours to schedule your demo.
                    </p>
                    <Button variant="outline" onClick={() => setSubmitted(false)}>
                      Submit Another Request
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                          id="name"
                          placeholder="Your name"
                          value={formState.name}
                          onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Work Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          value={formState.email}
                          onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="company">Company *</Label>
                        <Input
                          id="company"
                          placeholder="Company name"
                          value={formState.company}
                          onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="teamSize">Team Size</Label>
                        <Input
                          id="teamSize"
                          placeholder="e.g., 10-50"
                          value={formState.teamSize}
                          onChange={(e) => setFormState({ ...formState, teamSize: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">What would you like to learn about?</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us about your hiring challenges..."
                        rows={4}
                        value={formState.message}
                        onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        "Submitting..."
                      ) : (
                        <>
                          Request Demo
                          <Calendar className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <Container size="lg">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Logo variant="icon" size={24} />
              <span className="text-sm text-text-secondary">
                © 2025 Corrirrus Innovations Pvt Ltd
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/legal/privacy" className="text-sm text-text-secondary hover:text-text-primary transition">
                Privacy
              </Link>
              <Link href="/legal/terms" className="text-sm text-text-secondary hover:text-text-primary transition">
                Terms
              </Link>
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}

const benefits = [
  {
    icon: Sparkles,
    title: "AI-Powered Assessment Platform",
    description: "See how candidates work with Claude Code in a secure sandbox environment.",
  },
  {
    icon: Users,
    title: "Team Collaboration Features",
    description: "Learn how your team can review candidates, share notes, and make decisions.",
  },
  {
    icon: CheckCircle2,
    title: "Anti-Cheating Technology",
    description: "Understand our multi-layered approach to ensuring assessment integrity.",
  },
];
