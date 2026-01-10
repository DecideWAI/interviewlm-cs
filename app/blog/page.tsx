"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  BookOpen,
  Clock,
  User,
} from "lucide-react";

export default function BlogPage() {
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
              Blog
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Insights & Updates
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Thoughts on AI-native hiring, technical assessment best practices, and the future of engineering recruitment.
            </p>
          </div>
        </Container>
      </section>

      {/* Blog Posts */}
      <section className="py-16">
        <Container size="lg">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post, i) => (
              <Card key={i} className="border-border-secondary hover:border-primary/40 transition-all cursor-pointer group">
                <CardContent className="pt-6">
                  <Badge variant={post.categoryVariant} className="mb-4">
                    {post.category}
                  </Badge>
                  <h2 className="text-xl font-bold text-text-primary mb-3 group-hover:text-primary transition">
                    {post.title}
                  </h2>
                  <p className="text-sm text-text-secondary mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between text-xs text-text-tertiary">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {post.author}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {post.readTime}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Coming Soon */}
          <div className="text-center mt-16 pt-16 border-t border-border">
            <h3 className="text-2xl font-bold text-text-primary mb-4">
              More content coming soon
            </h3>
            <p className="text-text-secondary mb-6">
              We&apos;re working on more articles about AI-native hiring and technical assessments.
            </p>
            <Button variant="outline">
              Subscribe to Updates
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
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

const blogPosts = [
  {
    title: "Why Traditional Coding Tests Are Failing Your Hiring Process",
    excerpt: "95% of developers use AI tools daily, yet most technical assessments ban them. We explore why this disconnect is costing companies great candidates and how to fix it.",
    category: "Hiring Strategy",
    categoryVariant: "primary" as const,
    author: "InterviewLM Team",
    readTime: "5 min read",
  },
  {
    title: "The 4 Dimensions of AI Collaboration Skills",
    excerpt: "Not all AI usage is equal. Learn how we measure prompt quality, strategic usage, critical evaluation, and independence trends to identify truly skilled developers.",
    category: "Product",
    categoryVariant: "success" as const,
    author: "InterviewLM Team",
    readTime: "8 min read",
  },
  {
    title: "Building Cheat-Proof Technical Assessments",
    excerpt: "From isolated sandboxes to behavioral analysis, discover the multi-layered approach we use to ensure assessment integrity without creating a hostile candidate experience.",
    category: "Security",
    categoryVariant: "info" as const,
    author: "InterviewLM Team",
    readTime: "6 min read",
  },
  {
    title: "The Future of Technical Hiring in the AI Era",
    excerpt: "AI is transforming how developers work. We discuss what skills will matter most in 2025 and beyond, and how hiring practices need to evolve.",
    category: "Industry Trends",
    categoryVariant: "warning" as const,
    author: "InterviewLM Team",
    readTime: "7 min read",
  },
  {
    title: "How to Evaluate Prompt Engineering Skills",
    excerpt: "The difference between a good and great AI-assisted developer often comes down to how they communicate with AI. Here's how to assess this critical skill.",
    category: "Best Practices",
    categoryVariant: "default" as const,
    author: "InterviewLM Team",
    readTime: "6 min read",
  },
  {
    title: "From LeetCode to Real-World: Rethinking Assessment Design",
    excerpt: "Algorithm puzzles don't predict job performance. We share our approach to designing assessments that mirror actual development work.",
    category: "Product",
    categoryVariant: "success" as const,
    author: "InterviewLM Team",
    readTime: "5 min read",
  },
];
