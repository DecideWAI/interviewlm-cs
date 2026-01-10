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
  Mail,
  MessageSquare,
  Building2,
  Clock,
  CheckCircle2,
  Send,
} from "lucide-react";

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    company: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate form submission
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
              <MessageSquare className="h-3 w-3 mr-1" />
              Get in Touch
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Contact Us
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Have questions about InterviewLM? Want to discuss enterprise pricing?
              We&apos;d love to hear from you.
            </p>
          </div>
        </Container>
      </section>

      {/* Contact Form Section */}
      <section className="py-16">
        <Container size="lg">
          <div className="grid md:grid-cols-3 gap-12">
            {/* Contact Info */}
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-text-primary mb-4">
                  Let&apos;s talk
                </h2>
                <p className="text-text-secondary">
                  Whether you&apos;re curious about features, pricing, or need a custom solution,
                  our team is ready to help.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Email us</h3>
                    <p className="text-sm text-text-secondary mt-1">
                      hello@interviewlm.com
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-success/10">
                    <Building2 className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Enterprise Sales</h3>
                    <p className="text-sm text-text-secondary mt-1">
                      enterprise@interviewlm.com
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-info/10">
                    <Clock className="h-5 w-5 text-info" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Response Time</h3>
                    <p className="text-sm text-text-secondary mt-1">
                      We typically respond within 24 hours
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="md:col-span-2">
              <Card className="border-border-secondary">
                <CardHeader>
                  <CardTitle>Send us a message</CardTitle>
                  <CardDescription>
                    Fill out the form below and we&apos;ll get back to you as soon as possible.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {submitted ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="h-8 w-8 text-success" />
                      </div>
                      <h3 className="text-xl font-semibold text-text-primary mb-2">
                        Message Sent!
                      </h3>
                      <p className="text-text-secondary mb-6">
                        Thank you for reaching out. We&apos;ll get back to you within 24 hours.
                      </p>
                      <Button variant="outline" onClick={() => setSubmitted(false)}>
                        Send Another Message
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-6">
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
                          <Label htmlFor="email">Email *</Label>
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

                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="company">Company</Label>
                          <Input
                            id="company"
                            placeholder="Your company"
                            value={formState.company}
                            onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="subject">Subject *</Label>
                          <Input
                            id="subject"
                            placeholder="How can we help?"
                            value={formState.subject}
                            onChange={(e) => setFormState({ ...formState, subject: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="message">Message *</Label>
                        <Textarea
                          id="message"
                          placeholder="Tell us more about your needs..."
                          rows={6}
                          value={formState.message}
                          onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                          required
                        />
                      </div>

                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                          "Sending..."
                        ) : (
                          <>
                            Send Message
                            <Send className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
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
