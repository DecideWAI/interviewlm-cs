"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Code2,
  LineChart,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle2,
  Terminal,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-sm font-bold text-white">IL</span>
            </div>
            <span className="text-base font-semibold text-text-primary">
              InterviewLM
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/features" className="text-sm text-text-secondary hover:text-text-primary transition">
              Features
            </Link>
            <Link href="/pricing" className="text-sm text-text-secondary hover:text-text-primary transition">
              Pricing
            </Link>
            <Link href="/docs" className="text-sm text-text-secondary hover:text-text-primary transition">
              Docs
            </Link>
            <Link href="/auth/signin">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

        <div className="relative max-w-5xl mx-auto text-center">
          <Badge variant="primary" className="mb-6 animate-slide-up">
            <Sparkles className="h-3 w-3 mr-1" />
            The Future of Technical Hiring
          </Badge>

          <h1 className="text-5xl md:text-7xl font-bold text-text-primary mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Hire Developers Who{" "}
            <span className="gradient-text">Excel With AI</span>
          </h1>

          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            Stop testing if candidates can code without AI. Start measuring how effectively
            they leverage Claude Code, Cursor, and modern AI tools—because that's how developers
            actually work in 2025.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <div className="flex gap-3 w-full sm:w-auto">
              <Input
                type="email"
                placeholder="Enter your work email"
                className="h-12 w-full sm:w-80 bg-background-secondary border-border-secondary"
              />
              <Button size="lg" className="h-12">
                Start Free Trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-text-tertiary animate-slide-up" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              5 free assessments
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Setup in 2 minutes
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              Built for the AI Era
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              Evaluate real-world problem-solving skills, not memorization.
              See how candidates think, not just what they produce.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card
                key={i}
                className="group hover:border-primary/40 hover:shadow-glow transition-all duration-300 cursor-pointer"
              >
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-background-secondary">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              How It Works
            </h2>
            <p className="text-lg text-text-secondary">
              Deploy AI-native assessments in minutes
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-primary font-bold mb-4">
                    {i + 1}
                  </div>
                  <h3 className="text-base font-semibold text-text-primary mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-text-secondary">
                    {step.description}
                  </p>
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-[80%] h-0.5 bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              Real-World Assessments
            </h2>
            <p className="text-lg text-text-secondary">
              Candidates work in a secure sandbox with Claude Code CLI pre-configured
            </p>
          </div>

          <Card className="bg-background-tertiary border-border-secondary overflow-hidden">
            <div className="border-b border-border-secondary px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-error/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
              </div>
              <div className="flex items-center gap-2 ml-4 text-sm text-text-secondary">
                <Terminal className="h-4 w-4" />
                <span className="font-mono">Terminal</span>
              </div>
            </div>
            <CardContent className="p-6 font-mono text-sm">
              <div className="space-y-2">
                <div className="flex gap-3">
                  <span className="text-text-tertiary">$</span>
                  <span className="text-text-primary">claude "help me implement user authentication with JWT"</span>
                </div>
                <div className="flex gap-3 text-primary">
                  <span className="text-text-tertiary">→</span>
                  <span>I'll help you implement JWT authentication. Let's start by...</span>
                </div>
                <div className="flex gap-3 mt-4">
                  <span className="text-text-tertiary">$</span>
                  <span className="text-text-primary">npm test</span>
                </div>
                <div className="flex gap-3 text-success">
                  <span className="text-text-tertiary">✓</span>
                  <span>5 passing</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-background-secondary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            Ready to revolutionize your hiring?
          </h2>
          <p className="text-xl text-text-secondary mb-10">
            Join forward-thinking companies who are hiring the best AI-assisted developers
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/signup">
              <Button size="xl" className="h-12">
                Start Free Trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="xl" variant="outline" className="h-12">
                Book a Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
                  <span className="text-sm font-bold text-white">IL</span>
                </div>
                <span className="text-base font-semibold text-text-primary">
                  InterviewLM
                </span>
              </div>
              <p className="text-sm text-text-secondary">
                AI-native technical assessments for modern hiring teams.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><Link href="/features" className="hover:text-text-primary transition">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-text-primary transition">Pricing</Link></li>
                <li><Link href="/docs" className="hover:text-text-primary transition">Documentation</Link></li>
                <li><Link href="/changelog" className="hover:text-text-primary transition">Changelog</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><Link href="/about" className="hover:text-text-primary transition">About</Link></li>
                <li><Link href="/blog" className="hover:text-text-primary transition">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-text-primary transition">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-text-primary transition">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Legal</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><Link href="/privacy" className="hover:text-text-primary transition">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-text-primary transition">Terms</Link></li>
                <li><Link href="/security" className="hover:text-text-primary transition">Security</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-text-tertiary">
              © 2025 Corrirrus Innovations Pvt Ltd. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-text-tertiary">
              <a href="#" className="hover:text-text-primary transition">Twitter</a>
              <a href="#" className="hover:text-text-primary transition">LinkedIn</a>
              <a href="#" className="hover:text-text-primary transition">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: Terminal,
    title: "Claude Code Integration",
    description: "Candidates use Claude Code CLI in a secure sandbox. Every interaction is logged and analyzed for quality and effectiveness.",
  },
  {
    icon: Zap,
    title: "Real-Time Monitoring",
    description: "Track file changes, terminal commands, and AI prompts. Understand the complete problem-solving journey.",
  },
  {
    icon: LineChart,
    title: "AI-Powered Scoring",
    description: "Automated evaluation of code quality, AI usage proficiency, and problem-solving methodology—not just test pass rates.",
  },
  {
    icon: Shield,
    title: "Anti-Cheating Built-In",
    description: "Controlled environment with network restrictions, monitored AI access, and behavioral analysis prevents common cheating methods.",
  },
  {
    icon: Code2,
    title: "Curated Problem Library",
    description: "Choose from pre-built coding challenges or create custom problems. Cover full-stack, algorithms, system design, and more.",
  },
  {
    icon: Sparkles,
    title: "Actionable Insights",
    description: "Get detailed scorecards with strengths, weaknesses, and hiring recommendations. Session replays show how candidates think.",
  },
];

const steps = [
  {
    title: "Create Assessment",
    description: "Choose problems and configure AI tools allowed",
  },
  {
    title: "Invite Candidates",
    description: "Send assessment links via email",
  },
  {
    title: "Candidates Code",
    description: "Work in sandboxed environment with Claude Code",
  },
  {
    title: "Review Results",
    description: "Get AI-powered insights and scorecards",
  },
];
