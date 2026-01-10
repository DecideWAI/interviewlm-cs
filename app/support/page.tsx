"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  Search,
  BookOpen,
  MessageSquare,
  Mail,
  ChevronDown,
  HelpCircle,
  FileText,
  Zap,
  Shield,
  Users,
} from "lucide-react";

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              <HelpCircle className="h-3 w-3 mr-1" />
              Help Center
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              How can we help?
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Find answers to common questions or get in touch with our support team.
            </p>

            {/* Search */}
            <div className="max-w-xl mx-auto pt-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-tertiary" />
                <Input
                  type="text"
                  placeholder="Search for answers..."
                  className="pl-12 h-12"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Quick Links */}
      <section className="py-12 bg-background-secondary border-b border-border">
        <Container size="lg">
          <div className="grid md:grid-cols-3 gap-6">
            {quickLinks.map((link, i) => (
              <Card
                key={i}
                className="border-border-secondary hover:border-primary/40 transition-all cursor-pointer"
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <link.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary mb-1">{link.title}</h3>
                      <p className="text-sm text-text-secondary">{link.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ Section */}
      <section className="py-16">
        <Container size="md">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-text-secondary">
              Quick answers to common questions about InterviewLM.
            </p>
          </div>

          <div className="space-y-4">
            {filteredFaqs.map((faq, index) => (
              <Card
                key={index}
                className="border-border-secondary cursor-pointer hover:border-border-hover transition-colors"
                onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-text-primary mb-2">
                        {faq.question}
                      </h3>
                      {expandedFaq === index && (
                        <p className="text-sm text-text-secondary leading-relaxed">
                          {faq.answer}
                        </p>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-text-secondary flex-shrink-0 transition-transform ${
                        expandedFaq === index ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredFaqs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-secondary mb-4">No results found for &quot;{searchQuery}&quot;</p>
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                Clear Search
              </Button>
            </div>
          )}
        </Container>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-background-secondary border-t border-border">
        <Container size="md">
          <Card className="border-primary bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="pt-12 pb-12 text-center">
              <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-text-primary mb-4">
                Still need help?
              </h2>
              <p className="text-text-secondary mb-6 max-w-lg mx-auto">
                Our support team is here to help. Reach out and we&apos;ll get back to you within 24 hours.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Link href="/contact">
                  <Button size="lg">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Contact Support
                  </Button>
                </Link>
                <a href="mailto:support@interviewlm.com">
                  <Button variant="outline" size="lg">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Us
                  </Button>
                </a>
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

const quickLinks = [
  {
    icon: BookOpen,
    title: "Documentation",
    description: "Learn how to use InterviewLM with our comprehensive guides.",
  },
  {
    icon: FileText,
    title: "API Reference",
    description: "Integrate InterviewLM with your existing tools and workflows.",
  },
  {
    icon: MessageSquare,
    title: "Contact Support",
    description: "Get personalized help from our support team.",
  },
];

const faqs = [
  {
    question: "How do I create my first assessment?",
    answer: "After signing up, go to your dashboard and click 'Create Assessment'. Choose from our templates or create a custom assessment. You can configure the duration, difficulty, and which AI tools are available to candidates.",
  },
  {
    question: "How do I invite candidates?",
    answer: "From your assessment page, click 'Invite Candidates' and enter their email addresses. They'll receive a unique link to start the assessment. You can also generate shareable links for job postings.",
  },
  {
    question: "What happens if a candidate has technical issues?",
    answer: "Our platform auto-saves progress and candidates can refresh without losing work. If issues persist, they can contact us and we'll work with you to reschedule if needed.",
  },
  {
    question: "How do credits work?",
    answer: "1 credit = 1 assessment. Buy credits in packs and use them whenever you need. Credits never expire. Add-ons like video recording cost extra per assessment.",
  },
  {
    question: "Can I customize the coding environment?",
    answer: "Yes! You can pre-configure the file structure, include starter code, set up test cases, and choose which documentation sites are accessible during the assessment.",
  },
  {
    question: "How do you prevent cheating?",
    answer: "We use multiple layers: isolated sandboxes, network restrictions, AI-controlled access, behavioral analysis, and optional video proctoring. Candidates can only use the AI tools we provide and monitor.",
  },
  {
    question: "What AI tools do candidates have access to?",
    answer: "Currently, candidates use Claude Code CLI in a pre-configured environment. We monitor and analyze all AI interactions to evaluate prompt quality and AI collaboration skills.",
  },
  {
    question: "How long are assessment results stored?",
    answer: "Results are stored for 30 days with standard plans. Enterprise plans include extended storage and data export options.",
  },
];
