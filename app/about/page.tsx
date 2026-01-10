"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  Target,
  Sparkles,
  Users,
  Zap,
  Shield,
  Brain,
  Heart,
} from "lucide-react";

export default function AboutPage() {
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
      <section className="pt-20 pb-16 border-b border-border">
        <Container size="md">
          <div className="text-center space-y-6">
            <Badge variant="primary" className="mx-auto">
              <Sparkles className="h-3 w-3 mr-1" />
              Our Story
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Building the Future of
              <br />
              <span className="gradient-text">Technical Hiring</span>
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              We believe the best developers aren&apos;t those who memorize algorithms—
              they&apos;re the ones who know how to leverage AI tools to build great software.
            </p>
          </div>
        </Container>
      </section>

      {/* Mission Section */}
      <section className="py-20">
        <Container size="lg">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="primary" className="mb-4">
                <Target className="h-3 w-3 mr-1" />
                Our Mission
              </Badge>
              <h2 className="text-3xl font-bold text-text-primary mb-6">
                Measuring the skills that actually matter
              </h2>
              <p className="text-text-secondary mb-4">
                Traditional coding assessments were built for a world where developers worked alone,
                without AI assistance. But that world no longer exists.
              </p>
              <p className="text-text-secondary mb-4">
                Today, 95% of developers use AI tools daily. The best engineers aren&apos;t those
                who can implement a red-black tree from memory—they&apos;re the ones who can
                effectively collaborate with AI to ship great software, fast.
              </p>
              <p className="text-text-secondary">
                InterviewLM was built to measure these modern skills: prompt engineering,
                AI collaboration, critical evaluation of AI output, and real-world problem solving.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {stats.map((stat, i) => (
                <Card key={i} className="border-border-secondary">
                  <CardContent className="pt-6 text-center">
                    <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                    <div className="text-sm text-text-secondary">{stat.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-background-secondary border-y border-border">
        <Container size="lg">
          <div className="text-center mb-16">
            <Badge variant="primary" className="mb-4">
              <Heart className="h-3 w-3 mr-1" />
              Our Values
            </Badge>
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              What drives us
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              These principles guide everything we do at InterviewLM.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, i) => (
              <Card key={i} className="border-border-secondary hover:border-primary/40 transition-all">
                <CardContent className="pt-6">
                  <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {value.title}
                  </h3>
                  <p className="text-sm text-text-secondary">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* Company Info */}
      <section className="py-20">
        <Container size="md">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              About Our Company
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              InterviewLM is built by Corrirrus Innovations Pvt Ltd, a technology company
              focused on solving hard problems in technical hiring.
            </p>
          </div>

          <Card className="border-border-secondary">
            <CardContent className="pt-8 pb-8">
              <div className="grid md:grid-cols-3 gap-8 text-center">
                <div>
                  <h3 className="font-semibold text-text-primary mb-2">Founded</h3>
                  <p className="text-text-secondary">2025</p>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary mb-2">Headquarters</h3>
                  <p className="text-text-secondary">Bengaluru, India</p>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary mb-2">Focus</h3>
                  <p className="text-text-secondary">AI-Native Technical Assessment</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Container>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-background-secondary border-t border-border">
        <Container size="md">
          <Card className="border-primary bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="pt-12 pb-12 text-center">
              <h2 className="text-3xl font-bold text-text-primary mb-4">
                Ready to transform your hiring?
              </h2>
              <p className="text-lg text-text-secondary mb-8 max-w-2xl mx-auto">
                Join hundreds of companies that have already modernized their technical assessments.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Link href="/auth/signup">
                  <Button size="lg">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" size="lg">
                    Contact Us
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
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

const stats = [
  { value: "500+", label: "Companies" },
  { value: "10K+", label: "Candidates Assessed" },
  { value: "92%", label: "Hiring Accuracy" },
  { value: "3x", label: "Faster Hiring" },
];

const values = [
  {
    icon: Brain,
    title: "AI-First Thinking",
    description: "We embrace AI as a tool that amplifies human capabilities, not replaces them.",
  },
  {
    icon: Users,
    title: "Candidate Experience",
    description: "Assessments should feel like real work, not artificial puzzles that create anxiety.",
  },
  {
    icon: Shield,
    title: "Fairness & Integrity",
    description: "Every candidate deserves a level playing field with cheat-proof assessments.",
  },
  {
    icon: Zap,
    title: "Actionable Insights",
    description: "Data should inform decisions, not just generate reports that collect dust.",
  },
];
