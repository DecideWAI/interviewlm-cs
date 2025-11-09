"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InterviewPreview } from "@/components/demo/InterviewPreview";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import {
  Sparkles,
  Code2,
  LineChart,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle2,
  Terminal,
  Eye,
  Lock,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  AlertCircle,
  AlertTriangle,
  XCircle,
  BarChart3,
  Users,
  FileText,
  ChevronDown,
  Play,
  Brain,
  Plus,
  Settings,
  Layers,
  ThumbsUp,
} from "lucide-react";

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/95 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo variant="icon" size={32} />
            <span className="text-lg font-semibold text-text-primary">
              InterviewLM
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link href="#features" className="text-sm text-text-secondary hover:text-text-primary transition">
              How It Works
            </Link>
            <Link href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition">
              Pricing
            </Link>
            <Link href="#security" className="text-sm text-text-secondary hover:text-text-primary transition">
              Security
            </Link>
            <Link href="#faq" className="text-sm text-text-secondary hover:text-text-primary transition">
              FAQ
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/auth/signin">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">Start Free Trial</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />

        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="primary" className="mb-6 animate-slide-up">
              <Sparkles className="h-3 w-3 mr-1" />
              Trusted by 500+ Engineering Teams
            </Badge>

            <h1 className="text-5xl md:text-7xl font-bold text-text-primary mb-6 animate-slide-up leading-tight" style={{ animationDelay: "0.1s" }}>
              Stop Hiring Developers Who
              <br />
              <span className="gradient-text">Can't Use AI Tools</span>
            </h1>

            <p className="text-xl md:text-2xl text-text-secondary max-w-4xl mx-auto mb-12 animate-slide-up" style={{ animationDelay: "0.2s" }}>
              Traditional coding tests measure the wrong skills. We evaluate how candidates
              leverage Claude Code and modern AI tools—because that's what matters in 2025.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <Link href="/auth/signup">
                <Button size="xl" className="h-14 px-8 text-base">
                  Start Free Trial
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="xl" variant="outline" className="h-14 px-8 text-base">
                  <Play className="h-4 w-4 mr-2" />
                  Watch Demo
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-tertiary animate-slide-up" style={{ animationDelay: "0.4s" }}>
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
                2-minute setup
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                SOC 2 compliant
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {stats.map((stat, i) => (
              <Card key={i} className="border-border-secondary text-center bg-background-secondary/50">
                <CardContent className="pt-6">
                  <div className="text-3xl md:text-4xl font-bold text-primary mb-1">{stat.value}</div>
                  <div className="text-sm text-text-secondary">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-20 px-6 bg-background-secondary">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="error" className="mb-4">
              <AlertCircle className="h-3 w-3 mr-1" />
              The Problem With Traditional Hiring
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-6">
              You're Testing the Wrong Skills
            </h2>
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">
              95% of developers use AI tools daily, yet your assessments ban them.
              You're missing great candidates and hiring the wrong ones.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {problems.map((problem, i) => (
              <Card key={i} className="border-error/20 bg-error/5">
                <CardContent className="pt-6">
                  <XCircle className="h-8 w-8 text-error mb-4" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {problem.title}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {problem.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="success" className="mb-4">
              <Target className="h-3 w-3 mr-1" />
              Our Solution
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-6">
              Measure Real-World AI-Assisted
              <br />
              Development Skills
            </h2>
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">
              We don't ban AI tools—we measure how effectively candidates use them.
              Get deeper insights into problem-solving, code quality, and AI proficiency.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {solutions.map((solution, i) => (
              <Card key={i} className="border-border-secondary hover:border-primary/40 hover:shadow-glow transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <solution.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        {solution.title}
                      </h3>
                      <p className="text-sm text-text-secondary leading-relaxed mb-3">
                        {solution.description}
                      </p>
                      <ul className="space-y-2">
                        {solution.benefits.map((benefit, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-text-secondary">
                            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Configuration Features */}
      <section className="py-20 px-6 bg-background-secondary">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="primary" className="mb-4">
              <Target className="h-3 w-3 mr-1" />
              Flexible Configuration
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-6">
              Configure Assessments for Your Exact Needs
            </h2>
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">
              Whether you're hiring junior frontend developers or senior ML engineers,
              customize every assessment to match your requirements in minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {configFeatures.map((feature, i) => (
              <Card key={i} className="border-border-secondary hover:border-primary/40 hover:shadow-glow transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-text-secondary mb-3">
                        {feature.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {feature.examples.map((example, j) => (
                          <Badge key={j} variant="default" className="text-xs">
                            {example}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12 p-6 border border-primary/20 bg-primary/5 rounded-lg">
            <div className="flex items-start gap-4">
              <Sparkles className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-text-primary mb-2">
                  Smart Templates & Custom Questions
                </h3>
                <p className="text-sm text-text-secondary mb-4">
                  Start with our battle-tested templates for common roles, or create custom
                  assessments using LLM-powered question generation. Configure difficulty
                  distributions, add custom scenarios, and preview everything before publishing.
                </p>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-text-primary mb-1">Pre-built Templates</div>
                    <div className="text-text-tertiary">Curated for common roles & levels</div>
                  </div>
                  <div>
                    <div className="font-medium text-text-primary mb-1">Custom Question Seeds</div>
                    <div className="text-text-tertiary">AI generates tailored problems</div>
                  </div>
                  <div>
                    <div className="font-medium text-text-primary mb-1">Live Preview</div>
                    <div className="text-text-tertiary">Test before sending to candidates</div>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href="/assessments/new">
                    <Button variant="primary" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Assessment
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How We Prevent Cheating */}
      <section id="security" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="primary" className="mb-4">
              <Shield className="h-3 w-3 mr-1" />
              Anti-Cheating Technology
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-6">
              Zero-Tolerance for Cheating
            </h2>
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">
              Our Secure Sandboxes and real-time monitoring make cheating
              technically impossible—not just difficult.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-border-secondary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  What We Monitor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {monitored.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Eye className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium text-text-primary">{item.title}</div>
                        <div className="text-sm text-text-secondary">{item.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-border-secondary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-success" />
                  Security Measures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {securityMeasures.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-success mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium text-text-primary">{item.title}</div>
                        <div className="text-sm text-text-secondary">{item.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              InterviewLM vs. Traditional Coding Tests
            </h2>
            <p className="text-lg text-text-secondary">
              See how we compare to LeetCode-style assessments and take-home projects
            </p>
          </div>

          <Card className="border-border-secondary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background-tertiary">
                  <tr>
                    <th className="text-left p-4 font-semibold text-text-primary">Feature</th>
                    <th className="text-center p-4 font-semibold text-text-primary">Traditional Tests</th>
                    <th className="text-center p-4 font-semibold text-primary">InterviewLM</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-4 text-text-primary font-medium">{row.feature}</td>
                      <td className="p-4 text-center">
                        {row.traditional === "No" ? (
                          <XCircle className="h-5 w-5 text-error mx-auto" />
                        ) : (
                          <span className="text-text-secondary text-sm">{row.traditional}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {row.interviewlm === "Yes" ? (
                          <CheckCircle2 className="h-5 w-5 text-success mx-auto" />
                        ) : (
                          <span className="text-primary font-medium text-sm">{row.interviewlm}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {/* Code Example */}
      <section id="demo" className="py-20 px-6 bg-background-secondary">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              See It In Action
            </h2>
            <p className="text-lg text-text-secondary">
              Candidates work in a secure sandbox with Claude Code CLI—just like their real workflow
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Card className="border-border-secondary">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Terminal className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-1">Candidate Experience</h3>
                    <p className="text-sm text-text-secondary">
                      Work in familiar environment with AI assistance. Natural workflow, better signal.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border-secondary">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-success/10 shrink-0">
                    <BarChart3 className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-1">Your Dashboard</h3>
                    <p className="text-sm text-text-secondary">
                      Get AI-powered insights, session replays, and detailed scorecards automatically.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <InterviewPreview />

          {/* Dashboard Analytics Showcase */}
          <div className="mt-12 space-y-6">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-text-primary mb-3">
                Actionable Analytics Dashboard
              </h3>
              <p className="text-text-secondary max-w-2xl mx-auto">
                Make data-driven hiring decisions with comprehensive metrics, AI collaboration insights, and automated candidate evaluation
              </p>
            </div>

            {/* Dashboard Features Grid */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="border-border-secondary hover:border-primary/40 transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="font-semibold text-text-primary">Pipeline Tracking</h4>
                  </div>
                  <p className="text-sm text-text-secondary mb-4">
                    Monitor conversion rates at every stage from invitation to hire with visual funnel analytics
                  </p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Invited → Started</span>
                      <span className="text-success font-medium">65%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Completed → Passed</span>
                      <span className="text-warning font-medium">38%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Overall Conversion</span>
                      <span className="text-primary font-medium">8%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border-secondary hover:border-primary/40 transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-success/10">
                      <Brain className="h-5 w-5 text-success" />
                    </div>
                    <h4 className="font-semibold text-text-primary">AI Proficiency Metrics</h4>
                  </div>
                  <p className="text-sm text-text-secondary mb-4">
                    Evaluate how effectively candidates collaborate with AI - a critical skill for modern developers
                  </p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Prompt Quality</span>
                      <span className="text-success font-medium">4.8/5.0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">AI Acceptance Rate</span>
                      <span className="text-success font-medium">73%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Usage Pattern</span>
                      <span className="text-primary font-medium">Goal-oriented</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border-secondary hover:border-primary/40 transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <AlertCircle className="h-5 w-5 text-warning" />
                    </div>
                    <h4 className="font-semibold text-text-primary">Smart Flag Detection</h4>
                  </div>
                  <p className="text-sm text-text-secondary mb-4">
                    Automatically identify red flags (code quality issues, over-reliance on AI) and green flags (excellence indicators)
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ThumbsUp className="h-3 w-3 text-success" />
                      <span className="text-xs text-text-secondary">Top-tier performance</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ThumbsUp className="h-3 w-3 text-success" />
                      <span className="text-xs text-text-secondary">Excellent prompt engineering</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                      <span className="text-xs text-text-secondary">Minor test coverage gaps</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-background-secondary border border-border rounded-lg">
                <p className="text-sm text-text-tertiary mb-1">Active Assessments</p>
                <p className="text-2xl font-bold text-text-primary">12</p>
                <p className="text-xs text-success flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  +20% vs last month
                </p>
              </div>
              <div className="p-4 bg-background-secondary border border-border rounded-lg">
                <p className="text-sm text-text-tertiary mb-1">Avg Score</p>
                <p className="text-2xl font-bold text-text-primary">7.2/10</p>
                <p className="text-xs text-warning flex items-center gap-1 mt-1">
                  <TrendingDown className="h-3 w-3" />
                  -5% vs last month
                </p>
              </div>
              <div className="p-4 bg-background-secondary border border-border rounded-lg">
                <p className="text-sm text-text-tertiary mb-1">Completion Rate</p>
                <p className="text-2xl font-bold text-text-primary">72%</p>
                <p className="text-xs text-success flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  +8% vs last quarter
                </p>
              </div>
              <div className="p-4 bg-background-secondary border border-border rounded-lg">
                <p className="text-sm text-text-tertiary mb-1">Avg AI Proficiency</p>
                <p className="text-2xl font-bold text-text-primary">8.1/10</p>
                <p className="text-xs text-success flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  +12% vs last month
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 p-6 rounded-lg border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-4">
              <Brain className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-text-primary mb-2">Real-Time AI Analysis</h3>
                <p className="text-sm text-text-secondary mb-3">
                  While the candidate works, our AI evaluates:
                </p>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-text-primary">Prompt Quality</div>
                    <div className="text-text-tertiary">9.2/10 - Specific & contextual</div>
                  </div>
                  <div>
                    <div className="font-medium text-text-primary">Code Review</div>
                    <div className="text-text-tertiary">Modified AI output appropriately</div>
                  </div>
                  <div>
                    <div className="font-medium text-text-primary">Problem Solving</div>
                    <div className="text-text-tertiary">Methodical, test-driven approach</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-text-secondary">
              Everything you need to know about InterviewLM
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <Card
                key={i}
                className="border-border-secondary cursor-pointer hover:border-primary/40 transition-all"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-semibold text-text-primary">{faq.question}</h3>
                    <ChevronDown
                      className={`h-5 w-5 text-text-secondary shrink-0 transition-transform ${
                        openFaq === i ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  {openFaq === i && (
                    <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                      {faq.answer}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section id="pricing" className="py-20 px-6 bg-background-secondary">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-text-secondary mb-2">
              $15-20 per assessment. Premium AI evaluation.
            </p>
            <p className="text-sm text-text-tertiary">
              Start with a free 14-day trial • 3 free assessments • No credit card required
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {pricing.map((plan, i) => (
              <Card
                key={i}
                className={`border-border-secondary ${
                  plan.featured ? "border-primary shadow-glow" : ""
                } relative`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="primary">Most Popular</Badge>
                  </div>
                )}
                <CardContent className="pt-8">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-text-primary mb-2">{plan.name}</h3>
                    <div className="mb-4">
                      <span className="text-4xl font-bold text-text-primary">{plan.price}</span>
                      {plan.period && <span className="text-text-secondary">/{plan.period}</span>}
                    </div>
                    <p className="text-sm text-text-secondary">{plan.description}</p>
                  </div>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        <span className="text-text-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.name === "Enterprise" ? "/contact" : "/pricing"}>
                    <Button
                      className="w-full"
                      variant={plan.featured ? "primary" : "outline"}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/pricing">
              <Button variant="outline" size="lg">
                View All Pricing Options
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            Ready to Hire Better Engineers?
          </h2>
          <p className="text-xl text-text-secondary mb-10">
            Join 500+ companies who stopped testing memorization and started measuring real skills
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link href="/auth/signup">
              <Button size="xl" className="h-14 px-8">
                Start Free Trial
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="xl" variant="outline" className="h-14 px-8">
                Book a Demo
              </Button>
            </Link>
          </div>
          <p className="text-sm text-text-tertiary">
            No credit card required • 5 free assessments • SOC 2 compliant
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6 bg-background-secondary">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Logo variant="icon" size={28} />
                <span className="text-base font-semibold text-text-primary">
                  InterviewLM
                </span>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                AI-native technical assessments that measure real-world skills.
              </p>
              <div className="flex gap-3">
                <a href="#" className="text-text-tertiary hover:text-text-primary transition">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"></path></svg>
                </a>
                <a href="#" className="text-text-tertiary hover:text-text-primary transition">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"></path></svg>
                </a>
                <a href="#" className="text-text-tertiary hover:text-text-primary transition">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg>
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><Link href="#features" className="hover:text-text-primary transition">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-text-primary transition">Pricing</Link></li>
                <li><Link href="#security" className="hover:text-text-primary transition">Security</Link></li>
                <li><Link href="/changelog" className="hover:text-text-primary transition">Changelog</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Resources</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><Link href="/docs" className="hover:text-text-primary transition">Documentation</Link></li>
                <li><Link href="/blog" className="hover:text-text-primary transition">Blog</Link></li>
                <li><Link href="/case-studies" className="hover:text-text-primary transition">Case Studies</Link></li>
                <li><Link href="/support" className="hover:text-text-primary transition">Support</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><Link href="/about" className="hover:text-text-primary transition">About</Link></li>
                <li><Link href="/contact" className="hover:text-text-primary transition">Contact</Link></li>
                <li><Link href="/privacy" className="hover:text-text-primary transition">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-text-primary transition">Terms</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-border text-center text-sm text-text-tertiary">
            © 2025 Corrirrus Innovations Pvt Ltd. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

const stats = [
  { value: "500+", label: "Companies" },
  { value: "10K+", label: "Candidates Tested" },
  { value: "92%", label: "Hiring Accuracy" },
  { value: "3x", label: "Faster Hiring" },
];

const configFeatures = [
  {
    icon: Target,
    title: "Role-Based Configuration",
    description: "Select from 6 specialized engineering roles with pre-configured assessments optimized for each discipline.",
    examples: ["Backend Engineer", "Frontend Engineer", "Full-Stack", "ML Engineer", "Security", "Database"],
  },
  {
    icon: Layers,
    title: "Seniority Levels",
    description: "Automatically adjust difficulty, duration, and evaluation criteria based on candidate experience level.",
    examples: ["Junior (0-2 yrs)", "Mid (2-5 yrs)", "Senior (5-8 yrs)", "Staff (8-12 yrs)", "Principal (12+ yrs)"],
  },
  {
    icon: Settings,
    title: "Custom Question Seeds",
    description: "Use LLM instructions to generate tailored coding problems specific to your tech stack and requirements.",
    examples: ["Template-based", "AI-generated", "Custom scenarios", "Difficulty control"],
  },
  {
    icon: Eye,
    title: "Preview & Test",
    description: "Experience assessments from a candidate's perspective before publishing. Test the flow, timing, and difficulty.",
    examples: ["Live preview", "Tier-based test runs", "Iterate quickly", "Validate before sending"],
  },
];

const problems = [
  {
    title: "Banning AI = Missing Great Candidates",
    description: "95% of developers use AI daily. Your no-AI policy filters out productive engineers who work smarter, not harder.",
  },
  {
    title: "LeetCode != Real Work",
    description: "Algorithm memorization doesn't predict job performance. Real work involves using tools, not solving puzzles in a vacuum.",
  },
  {
    title: "Easy to Cheat, Hard to Detect",
    description: "Traditional online tests are plagued by cheating. Hidden ChatGPT windows, screen sharing with friends—you can't catch it all.",
  },
];

const solutions = [
  {
    icon: Terminal,
    title: "Secure AI-Enabled Sandboxes",
    description: "Candidates work in Secure Sandboxes with Claude Code CLI pre-configured. They code naturally while we monitor everything.",
    benefits: [
      "Every AI prompt logged and analyzed for quality",
      "File changes, commands, and code evolution tracked",
      "Network-restricted environment prevents external cheating",
      "Identical setup for all candidates ensures fairness",
    ],
  },
  {
    icon: Brain,
    title: "AI-Powered Deep Evaluation",
    description: "We don't just check if tests pass. Our AI evaluates problem-solving approach, code quality, and AI tool proficiency.",
    benefits: [
      "Prompt quality scoring (specific vs. vague)",
      "Code review behavior (did they blindly accept AI output?)",
      "Problem decomposition and planning methodology",
      "Iterative refinement and debugging approach",
    ],
  },
  {
    icon: Shield,
    title: "Cheat-Proof Architecture",
    description: "Technical controls make cheating impossible. Controlled environment, monitored AI access, behavioral analysis.",
    benefits: [
      "One-time session tokens that expire",
      "Restricted network access (only whitelisted docs)",
      "Tab focus tracking and activity monitoring",
      "Suspicious pattern detection (AI analysis)",
    ],
  },
  {
    icon: BarChart3,
    title: "Actionable Insights, Not Just Scores",
    description: "Get detailed scorecards with strengths, weaknesses, and hiring recommendations. Session replays show exactly how they work.",
    benefits: [
      "Skill breakdown by category (AI usage, code quality, etc.)",
      "Session timeline with key decision points",
      "Comparison against your team's average",
      "Confidence score for hire/no-hire decisions",
    ],
  },
];

const monitored = [
  { title: "Every AI Interaction", description: "All Claude Code prompts and responses logged" },
  { title: "File System Changes", description: "Track every file created, modified, or deleted" },
  { title: "Terminal Commands", description: "Complete command history with timestamps" },
  { title: "Network Requests", description: "What domains they try to access (blocked if unauthorized)" },
  { title: "Clipboard Activity", description: "Copy-paste events between AI and code" },
  { title: "Time Distribution", description: "How long spent on planning vs. coding vs. debugging" },
];

const securityMeasures = [
  { title: "Isolated Containers", description: "Fresh Secure Sandbox per candidate, zero contamination" },
  { title: "Controlled AI Access", description: "All AI calls proxied through our backend for logging" },
  { title: "Network Whitelisting", description: "Only approved documentation sites accessible" },
  { title: "Session Recording", description: "Encrypted storage of all session data (SOC 2 compliant)" },
  { title: "Behavioral Analysis", description: "AI flags suspicious patterns automatically" },
  { title: "One-Time Links", description: "Assessment links work once and expire after duration" },
];

const comparisonData = [
  { feature: "AI Tools Allowed", traditional: "No", interviewlm: "Yes" },
  { feature: "Real-World Environment", traditional: "No", interviewlm: "Yes" },
  { feature: "Measures AI Proficiency", traditional: "No", interviewlm: "Yes" },
  { feature: "Cheat-Proof", traditional: "No", interviewlm: "Yes" },
  { feature: "Session Replay", traditional: "No", interviewlm: "Yes" },
  { feature: "Deep Insights", traditional: "Pass/Fail Only", interviewlm: "AI-Powered" },
  { feature: "Setup Time", traditional: "Hours", interviewlm: "2 Minutes" },
  { feature: "Candidate Experience", traditional: "Poor (Stressful)", interviewlm: "Great (Natural)" },
];

const faqs = [
  {
    question: "How do you prevent candidates from using unauthorized AI tools?",
    answer: "Candidates work in Secure Sandboxes where all network access is controlled. They can only use Claude Code CLI (which we provide and monitor), and attempts to access external AI tools are blocked. We log every AI interaction for quality analysis.",
  },
  {
    question: "Can candidates cheat by sharing screens or getting help from friends?",
    answer: "Our anti-cheating measures include: (1) time pressure that makes collaboration impractical, (2) randomized problem variants, (3) behavioral analysis that flags unusual patterns like long pauses or sudden skill jumps, and (4) optional webcam monitoring. The controlled environment makes traditional cheating methods ineffective.",
  },
  {
    question: "How accurate is your AI-powered evaluation?",
    answer: "Our evaluation combines automated testing (test pass rates, code quality metrics) with AI analysis (prompt quality, problem-solving approach, code review behavior). This multi-dimensional scoring provides 92% correlation with on-the-job performance based on our customer data—far better than traditional coding tests.",
  },
  {
    question: "What AI tools do candidates use during assessments?",
    answer: "Currently, candidates use Claude Code CLI in a pre-configured environment. We're adding support for Cursor and other AI coding assistants soon. The key is that we monitor and analyze how effectively they use these tools—that's what we're measuring.",
  },
  {
    question: "How long does it take to set up an assessment?",
    answer: "About 2 minutes. Choose from our curated problem library (or create custom problems), set duration, select allowed tools, and invite candidates. We handle all the infrastructure—sandbox provisioning, monitoring, and evaluation.",
  },
  {
    question: "Do candidates need to install anything?",
    answer: "No. Candidates access the assessment through their browser. They code in a browser-based VS Code (code-server) running in a Secure Sandbox with Claude Code CLI pre-installed. Zero setup friction.",
  },
  {
    question: "How do you ensure candidate data privacy and security?",
    answer: "We're SOC 2 Type II compliant. All session data is encrypted at rest and in transit. Sandboxes are destroyed after assessment completion. We never share candidate data without explicit permission, and comply with GDPR and CCPA.",
  },
  {
    question: "Can I create custom problems for my specific tech stack?",
    answer: "Yes. While we provide a curated library of problems, you can create custom problems with your own starter code, test cases, and evaluation criteria. This lets you test exactly the skills your team needs.",
  },
];

const pricing = [
  {
    name: "Pay-as-you-go",
    price: "$20",
    period: "assessment",
    description: "Perfect for trying out the platform",
    features: [
      "No commitment required",
      "All assessment types",
      "AI-powered evaluation",
      "Advanced analytics",
      "Email support",
    ],
    cta: "Start Free Trial",
    featured: false,
  },
  {
    name: "Medium Pack",
    price: "$15",
    period: "assessment",
    description: "Best value for scaling teams",
    features: [
      "50 credits for $750",
      "25% discount vs pay-as-you-go",
      "Credits never expire",
      "All assessment types",
      "Priority support",
      "Custom branding",
      "API access",
    ],
    cta: "Buy Credits",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "$10",
    period: "assessment",
    description: "For high-volume hiring",
    features: [
      "500+ credits (up to 50% off)",
      "Dedicated support",
      "Custom integrations",
      "SSO & SAML",
      "SLA guarantee",
      "Volume discounts",
      "White-label option",
    ],
    cta: "Contact Sales",
    featured: false,
  },
];
