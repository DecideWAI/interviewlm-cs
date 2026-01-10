"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  Building2,
  TrendingUp,
  Clock,
  Users,
  CheckCircle2,
  Quote,
} from "lucide-react";

export default function CaseStudiesPage() {
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
              <Building2 className="h-3 w-3 mr-1" />
              Customer Stories
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Case Studies
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              See how leading companies are transforming their technical hiring with InterviewLM.
            </p>
          </div>
        </Container>
      </section>

      {/* Stats */}
      <section className="py-12 bg-background-secondary border-b border-border">
        <Container size="lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-sm text-text-secondary">{stat.label}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Case Studies */}
      <section className="py-16">
        <Container size="lg">
          <div className="space-y-12">
            {caseStudies.map((study, i) => (
              <Card key={i} className="border-border-secondary overflow-hidden">
                <CardContent className="p-0">
                  <div className="grid md:grid-cols-3">
                    {/* Company Info */}
                    <div className="p-8 bg-background-secondary border-r border-border">
                      <Badge variant={study.industryVariant} className="mb-4">
                        {study.industry}
                      </Badge>
                      <h2 className="text-2xl font-bold text-text-primary mb-2">
                        {study.company}
                      </h2>
                      <p className="text-sm text-text-secondary mb-6">
                        {study.description}
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-text-tertiary" />
                          <span className="text-text-secondary">{study.size}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Building2 className="h-4 w-4 text-text-tertiary" />
                          <span className="text-text-secondary">{study.location}</span>
                        </div>
                      </div>
                    </div>

                    {/* Results */}
                    <div className="md:col-span-2 p-8">
                      <h3 className="font-semibold text-text-primary mb-4">Results</h3>
                      <div className="grid grid-cols-3 gap-6 mb-8">
                        {study.metrics.map((metric, j) => (
                          <div key={j}>
                            <div className="flex items-center gap-2 mb-1">
                              <TrendingUp className="h-4 w-4 text-success" />
                              <span className="text-2xl font-bold text-success">{metric.value}</span>
                            </div>
                            <p className="text-xs text-text-secondary">{metric.label}</p>
                          </div>
                        ))}
                      </div>

                      <h3 className="font-semibold text-text-primary mb-3">Key Benefits</h3>
                      <ul className="grid md:grid-cols-2 gap-2 mb-6">
                        {study.benefits.map((benefit, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-text-secondary">
                            <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                            {benefit}
                          </li>
                        ))}
                      </ul>

                      {/* Quote */}
                      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                        <Quote className="h-5 w-5 text-primary mb-2" />
                        <p className="text-sm text-text-secondary italic mb-2">
                          &quot;{study.quote}&quot;
                        </p>
                        <p className="text-xs text-text-tertiary">
                          — {study.quoteName}, {study.quoteTitle}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-16 bg-background-secondary border-t border-border">
        <Container size="md">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Ready to transform your hiring?
            </h2>
            <p className="text-text-secondary mb-8">
              Join these companies and start hiring better developers today.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link href="/auth/signup">
                <Button size="lg">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button variant="outline" size="lg">
                  Book a Demo
                </Button>
              </Link>
            </div>
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

const stats = [
  { value: "500+", label: "Companies" },
  { value: "92%", label: "Hiring Accuracy" },
  { value: "3x", label: "Faster Hiring" },
  { value: "60%", label: "Cost Reduction" },
];

const caseStudies = [
  {
    company: "TechCorp Inc.",
    description: "A fast-growing fintech startup that needed to scale their engineering team rapidly while maintaining quality.",
    industry: "Fintech",
    industryVariant: "primary" as const,
    size: "200-500 employees",
    location: "San Francisco, CA",
    metrics: [
      { value: "75%", label: "Reduction in time-to-hire" },
      { value: "3x", label: "More candidates assessed" },
      { value: "40%", label: "Improvement in new hire retention" },
    ],
    benefits: [
      "Identified candidates who could effectively use AI tools",
      "Reduced engineering time spent on interviews",
      "Better alignment between assessment and actual job performance",
      "Candidates reported positive experience",
    ],
    quote: "InterviewLM helped us identify developers who could actually ship code with AI assistance—not just those who memorized algorithms.",
    quoteName: "Sarah Chen",
    quoteTitle: "VP of Engineering",
  },
  {
    company: "CloudScale Systems",
    description: "An enterprise SaaS company looking to modernize their technical hiring process for the AI era.",
    industry: "Enterprise SaaS",
    industryVariant: "success" as const,
    size: "1000+ employees",
    location: "New York, NY",
    metrics: [
      { value: "50%", label: "Cost savings vs previous tools" },
      { value: "92%", label: "Hiring accuracy rate" },
      { value: "2 min", label: "Assessment setup time" },
    ],
    benefits: [
      "Consistent evaluation across all candidates",
      "Deep insights into problem-solving approach",
      "Integration with existing ATS workflow",
      "Reduced bias in technical screening",
    ],
    quote: "The AI collaboration scoring gave us insights we never had before. We can now identify candidates who will thrive in our AI-augmented development environment.",
    quoteName: "Michael Rodriguez",
    quoteTitle: "Director of Talent",
  },
  {
    company: "DataFlow Analytics",
    description: "A data infrastructure company that struggled with candidates gaming traditional coding tests.",
    industry: "Data Infrastructure",
    industryVariant: "info" as const,
    size: "50-200 employees",
    location: "Austin, TX",
    metrics: [
      { value: "0", label: "Detected cheating incidents" },
      { value: "85%", label: "Candidate completion rate" },
      { value: "4.8/5", label: "Candidate satisfaction" },
    ],
    benefits: [
      "Eliminated cheating with secure sandboxes",
      "Candidates prefer realistic assessment format",
      "Better signal on actual coding ability",
      "Reduced false positives and negatives",
    ],
    quote: "Our old coding tests were a cat-and-mouse game with cheaters. InterviewLM's secure environment gave us confidence that results are genuine.",
    quoteName: "Emily Watson",
    quoteTitle: "Head of Engineering",
  },
];
