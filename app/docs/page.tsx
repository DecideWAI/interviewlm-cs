"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  BookOpen,
  Code2,
  Zap,
  Shield,
  Users,
  Settings,
  FileText,
  Play,
  ExternalLink,
} from "lucide-react";

export default function DocsPage() {
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
              <BookOpen className="h-3 w-3 mr-1" />
              Documentation
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Learn InterviewLM
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Everything you need to get started with AI-native technical assessments.
            </p>
          </div>
        </Container>
      </section>

      {/* Quick Start */}
      <section className="py-12 bg-background-secondary border-b border-border">
        <Container size="lg">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-text-primary mb-2">Quick Start</h2>
            <p className="text-text-secondary">Get up and running in minutes</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {quickStart.map((item, i) => (
              <Card key={i} className="border-border-secondary hover:border-primary/40 transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                      {i + 1}
                    </div>
                    <h3 className="font-semibold text-text-primary">{item.title}</h3>
                  </div>
                  <p className="text-sm text-text-secondary">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* Documentation Sections */}
      <section className="py-16">
        <Container size="lg">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {docSections.map((section, i) => (
              <Card key={i} className="border-border-secondary hover:border-primary/40 transition-all">
                <CardHeader>
                  <div className="p-3 rounded-lg bg-primary/10 w-fit mb-2">
                    <section.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {section.links.map((link, j) => (
                      <li key={j}>
                        <span className="text-sm text-text-secondary hover:text-primary transition cursor-pointer flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {link}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* API Section */}
      <section className="py-16 bg-background-secondary border-y border-border">
        <Container size="md">
          <Card className="border-border-secondary">
            <CardContent className="pt-8 pb-8">
              <div className="flex items-start gap-6">
                <div className="p-4 rounded-lg bg-primary/10">
                  <Code2 className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-text-primary mb-2">API Reference</h2>
                  <p className="text-text-secondary mb-4">
                    Integrate InterviewLM into your existing hiring workflow with our REST API.
                    Create assessments, invite candidates, and retrieve results programmatically.
                  </p>
                  <div className="flex items-center gap-4">
                    <Badge variant="success">REST API</Badge>
                    <Badge variant="info">Webhooks</Badge>
                    <Badge variant="default">SDK Coming Soon</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-16">
        <Container size="md">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-text-primary mb-4">
              Ready to get started?
            </h2>
            <p className="text-text-secondary mb-8">
              Create your first assessment in minutes with our step-by-step guide.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link href="/auth/signup">
                <Button size="lg">
                  <Play className="h-4 w-4 mr-2" />
                  Start Free Trial
                </Button>
              </Link>
              <Link href="/support">
                <Button variant="outline" size="lg">
                  Get Help
                  <ExternalLink className="h-4 w-4 ml-2" />
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

const quickStart = [
  {
    title: "Create Account",
    description: "Sign up for free and set up your organization profile.",
  },
  {
    title: "Create Assessment",
    description: "Choose a template or create a custom coding challenge.",
  },
  {
    title: "Invite Candidates",
    description: "Send assessment links and review AI-powered results.",
  },
];

const docSections = [
  {
    icon: Zap,
    title: "Getting Started",
    description: "Learn the basics of InterviewLM",
    links: [
      "Platform Overview",
      "Creating Your First Assessment",
      "Understanding Results",
      "Best Practices",
    ],
  },
  {
    icon: Settings,
    title: "Assessment Configuration",
    description: "Customize assessments for your needs",
    links: [
      "Problem Templates",
      "Custom Questions",
      "Time & Difficulty Settings",
      "AI Tool Configuration",
    ],
  },
  {
    icon: Users,
    title: "Candidate Experience",
    description: "What candidates see and do",
    links: [
      "Assessment Flow",
      "Sandbox Environment",
      "Using Claude Code",
      "Troubleshooting",
    ],
  },
  {
    icon: Shield,
    title: "Security & Compliance",
    description: "How we protect your data",
    links: [
      "Anti-Cheating Measures",
      "Data Privacy",
      "SOC 2 Compliance",
      "GDPR & CCPA",
    ],
  },
  {
    icon: Code2,
    title: "API & Integrations",
    description: "Connect with your tools",
    links: [
      "API Authentication",
      "Creating Assessments",
      "Webhook Events",
      "ATS Integration",
    ],
  },
  {
    icon: BookOpen,
    title: "Evaluation & Scoring",
    description: "How we evaluate candidates",
    links: [
      "Scoring Methodology",
      "AI Collaboration Metrics",
      "Code Quality Analysis",
      "Report Interpretation",
    ],
  },
];
