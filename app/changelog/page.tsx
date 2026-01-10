"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  Sparkles,
  Zap,
  Bug,
  Shield,
  Wrench,
} from "lucide-react";

export default function ChangelogPage() {
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
              <Sparkles className="h-3 w-3 mr-1" />
              What&apos;s New
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Changelog
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Stay up to date with the latest features, improvements, and fixes.
            </p>
          </div>
        </Container>
      </section>

      {/* Changelog Entries */}
      <section className="py-16">
        <Container size="md">
          <div className="space-y-12">
            {changelog.map((release, i) => (
              <div key={i} className="relative">
                {/* Timeline line */}
                {i < changelog.length - 1 && (
                  <div className="absolute left-[11px] top-10 bottom-0 w-0.5 bg-border" />
                )}

                <div className="flex gap-6">
                  {/* Timeline dot */}
                  <div className="relative">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-12">
                    <div className="flex items-center gap-4 mb-4">
                      <h2 className="text-2xl font-bold text-text-primary">{release.version}</h2>
                      <Badge variant="default">{release.date}</Badge>
                    </div>

                    <Card className="border-border-secondary">
                      <CardContent className="pt-6">
                        <div className="space-y-6">
                          {release.sections.map((section, j) => (
                            <div key={j}>
                              <div className="flex items-center gap-2 mb-3">
                                <section.icon className={`h-5 w-5 ${section.color}`} />
                                <h3 className="font-semibold text-text-primary">{section.title}</h3>
                              </div>
                              <ul className="space-y-2 pl-7">
                                {section.items.map((item, k) => (
                                  <li key={k} className="text-sm text-text-secondary list-disc">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ))}
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

const changelog = [
  {
    version: "v1.2.0",
    date: "January 2025",
    sections: [
      {
        icon: Sparkles,
        title: "New Features",
        color: "text-primary",
        items: [
          "Session replay with evidence linking - review candidate sessions with linked evaluation evidence",
          "AI collaboration scoring - 4-dimensional analysis of how candidates use AI tools",
          "Incremental question flow - adaptive difficulty based on candidate performance",
        ],
      },
      {
        icon: Zap,
        title: "Improvements",
        color: "text-success",
        items: [
          "Faster sandbox provisioning - 40% reduction in startup time",
          "Enhanced code editor with better syntax highlighting",
          "Improved terminal responsiveness",
        ],
      },
    ],
  },
  {
    version: "v1.1.0",
    date: "December 2024",
    sections: [
      {
        icon: Sparkles,
        title: "New Features",
        color: "text-primary",
        items: [
          "Custom assessment templates - create and save reusable assessment configurations",
          "Team collaboration - share candidates and assessments with team members",
          "Webhook notifications - get real-time updates on candidate progress",
        ],
      },
      {
        icon: Shield,
        title: "Security",
        color: "text-info",
        items: [
          "Enhanced anti-cheating measures with behavioral analysis",
          "SOC 2 Type II compliance achieved",
          "Improved session encryption",
        ],
      },
      {
        icon: Bug,
        title: "Bug Fixes",
        color: "text-error",
        items: [
          "Fixed terminal resize issues on smaller screens",
          "Resolved file tree not updating after AI-generated changes",
          "Fixed assessment timer display inconsistencies",
        ],
      },
    ],
  },
  {
    version: "v1.0.0",
    date: "November 2024",
    sections: [
      {
        icon: Sparkles,
        title: "Initial Release",
        color: "text-primary",
        items: [
          "AI-native technical assessments with Claude Code integration",
          "Secure sandbox environments powered by Modal",
          "Real-time code editing with CodeMirror",
          "Automated AI-powered evaluation",
          "Candidate management dashboard",
          "Credit-based pricing system",
        ],
      },
      {
        icon: Wrench,
        title: "Platform",
        color: "text-warning",
        items: [
          "Next.js 15 with App Router",
          "PostgreSQL database with Prisma ORM",
          "Paddle payment integration",
          "Email notifications via Resend",
        ],
      },
    ],
  },
];
