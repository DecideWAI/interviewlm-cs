"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Container } from "@/components/layout/container";
import {
  Check,
  X,
  ArrowRight,
  Calculator,
  Shield,
  Zap,
  Users,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual");
  const [avgSalary, setAvgSalary] = useState(120000);
  const [assessmentsPerMonth, setAssessmentsPerMonth] = useState(50);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const annualDiscount = 0.17;

  const pricingTiers = [
    {
      name: "Free Trial",
      description: "Perfect for trying out the platform",
      monthlyPrice: 0,
      annualPrice: 0,
      isFree: true,
      features: [
        "14 days unlimited access",
        "Up to 10 candidates",
        "All assessment types",
        "AI-powered evaluation",
        "Basic analytics",
        "Email support",
      ],
      limitations: [
        "No custom branding",
        "Limited integrations",
      ],
      cta: "Start Free Trial",
      variant: "outline" as const,
      badge: null,
    },
    {
      name: "Professional",
      description: "For growing teams and startups",
      monthlyPrice: 149,
      annualPrice: Math.round(149 * 12 * (1 - annualDiscount)),
      assessments: 25,
      features: [
        "25 assessments/month",
        "Unlimited candidates",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Custom branding",
        "Slack/Teams integration",
        "Priority email support",
        "API access",
      ],
      limitations: [
        "$8/additional assessment",
      ],
      cta: "Start 14-Day Trial",
      variant: "outline" as const,
      badge: null,
    },
    {
      name: "Growth",
      description: "For scaling companies",
      monthlyPrice: 399,
      annualPrice: Math.round(399 * 12 * (1 - annualDiscount)),
      assessments: 100,
      features: [
        "100 assessments/month",
        "Unlimited candidates",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Custom branding",
        "All integrations",
        "Dedicated support",
        "API access",
        "Custom problem library",
        "Bulk candidate invites",
        "Collaborative hiring",
      ],
      limitations: [
        "$5/additional assessment",
      ],
      cta: "Start 14-Day Trial",
      variant: "primary" as const,
      badge: "Most Popular",
    },
    {
      name: "Enterprise",
      description: "For large organizations",
      monthlyPrice: 1999,
      annualPrice: null,
      assessments: 500,
      features: [
        "500+ assessments/month",
        "Unlimited candidates",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Custom branding",
        "All integrations",
        "24/7 dedicated support",
        "API access",
        "Custom problem library",
        "Bulk candidate invites",
        "Collaborative hiring",
        "SSO/SAML authentication",
        "Custom contracts",
        "Volume discounts",
        "Dedicated CSM",
      ],
      limitations: [],
      cta: "Contact Sales",
      variant: "outline" as const,
      badge: null,
      isEnterprise: true,
    },
  ];

  const getPrice = (tier: typeof pricingTiers[0]) => {
    if (tier.isFree) return "Free";
    if (tier.isEnterprise) return "Custom";
    if (billingPeriod === "monthly") {
      return `$${tier.monthlyPrice}`;
    }
    return `$${Math.round((tier.annualPrice || 0) / 12)}`;
  };

  const getBillingText = (tier: typeof pricingTiers[0]) => {
    if (tier.isFree) return "14 days";
    if (tier.isEnterprise) return "Contact us";
    if (billingPeriod === "monthly") return "/month";
    return `/month, billed $${tier.annualPrice} annually`;
  };

  // ROI Calculator
  const costPerHire = 4683; // Industry average
  const badHireReplacementCost = avgSalary * 1.5;
  const traditionalTestCostPerCandidate = 20;
  const interviewLMCostPerCandidate = billingPeriod === "monthly" ?
    (pricingTiers[2].monthlyPrice / (pricingTiers[2].assessments || 1)) :
    (pricingTiers[2].annualPrice! / 12 / (pricingTiers[2].assessments || 1));

  const monthlySavings = assessmentsPerMonth * (traditionalTestCostPerCandidate - interviewLMCostPerCandidate);
  const annualSavings = monthlySavings * 12;
  const badHirePrevention = badHireReplacementCost * 0.3; // 30% reduction in bad hires

  const comparisonFeatures = [
    { feature: "AI tool proficiency testing", us: true, traditional: false },
    { feature: "Real-world coding environment", us: true, traditional: false },
    { feature: "Anti-cheating monitoring", us: true, traditional: true },
    { feature: "Automated grading", us: true, traditional: true },
    { feature: "Setup time", us: "< 5 min", traditional: "Hours" },
    { feature: "Cost per assessment", us: "$3-6", traditional: "$15-25" },
    { feature: "AI usage analytics", us: true, traditional: false },
    { feature: "Custom problem library", us: true, traditional: true },
    { feature: "Measures future readiness", us: true, traditional: false },
  ];

  const faqs = [
    {
      question: "How does billing work?",
      answer: "You're billed monthly or annually based on your selected plan. All plans include a 14-day free trial with no credit card required. You can upgrade, downgrade, or cancel anytime.",
    },
    {
      question: "What happens if I exceed my assessment limit?",
      answer: "You'll be charged for additional assessments at the overage rate specified in your plan. Professional: $8/assessment, Growth: $5/assessment. Enterprise plans include custom volume pricing.",
    },
    {
      question: "Can I change plans later?",
      answer: "Yes! You can upgrade or downgrade your plan at any time. When upgrading, you'll be charged the prorated difference. When downgrading, credit will be applied to your next billing cycle.",
    },
    {
      question: "Do you offer refunds?",
      answer: "We offer a 14-day free trial so you can test the platform risk-free. For paid plans, we offer refunds within 30 days if you're not satisfied with the platform.",
    },
    {
      question: "What payment methods do you accept?",
      answer: "We accept all major credit cards (Visa, Mastercard, American Express) and ACH transfers for Enterprise plans. Annual plans can also be paid via invoice.",
    },
    {
      question: "Is there a setup fee?",
      answer: "No setup fees for any plan. You can start using InterviewLM immediately after signing up. Enterprise plans include white-glove onboarding at no extra cost.",
    },
    {
      question: "How does the free trial work?",
      answer: "Start a 14-day free trial of any paid plan with full access to all features. No credit card required. After the trial, you'll be prompted to enter payment information to continue.",
    },
    {
      question: "Can I get a custom plan?",
      answer: "Yes! Enterprise plans are fully customizable based on your needs. Contact our sales team to discuss volume discounts, custom integrations, and SLA requirements.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-xl z-50">
        <Container size="lg">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-white">IL</span>
              </div>
              <span className="text-lg font-semibold text-text-primary">
                InterviewLM
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/#features" className="text-sm text-text-secondary hover:text-text-primary transition">
                Features
              </Link>
              <Link href="/pricing" className="text-sm text-text-primary font-medium">
                Pricing
              </Link>
              <Link href="/#faq" className="text-sm text-text-secondary hover:text-text-primary transition">
                FAQ
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
              Save 17% with annual billing
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Start with a free 14-day trial. No credit card required. Cancel anytime.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 pt-4">
              <span className={`text-sm ${billingPeriod === "monthly" ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                Monthly
              </span>
              <button
                onClick={() => setBillingPeriod(billingPeriod === "monthly" ? "annual" : "monthly")}
                className="relative w-14 h-7 rounded-full transition-colors"
                style={{
                  backgroundColor: billingPeriod === "annual" ? "#5E6AD2" : "#2A2A2A",
                }}
              >
                <div
                  className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{
                    transform: billingPeriod === "annual" ? "translateX(28px)" : "translateX(0)",
                  }}
                />
              </button>
              <span className={`text-sm ${billingPeriod === "annual" ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                Annual
                <span className="text-success ml-1">(Save 17%)</span>
              </span>
            </div>
          </div>
        </Container>
      </section>

      {/* Pricing Tiers */}
      <section className="py-16">
        <Container size="lg">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingTiers.map((tier, index) => (
              <Card
                key={index}
                className={`border-border-secondary relative flex flex-col ${
                  tier.badge ? "border-primary shadow-lg shadow-primary/10" : ""
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="primary">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {tier.badge}
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-8 pt-6">
                  <CardTitle className="text-2xl">{tier.name}</CardTitle>
                  <CardDescription className="text-base">
                    {tier.description}
                  </CardDescription>
                  <div className="pt-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-text-primary">
                        {getPrice(tier)}
                      </span>
                      {!tier.isFree && !tier.isEnterprise && (
                        <span className="text-text-secondary">/mo</span>
                      )}
                    </div>
                    <p className="text-sm text-text-tertiary mt-1">
                      {getBillingText(tier)}
                    </p>
                    {tier.assessments && (
                      <p className="text-sm text-text-secondary mt-2">
                        {tier.assessments} assessments included
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <Link href={tier.isEnterprise ? "/contact" : "/auth/signup"} className="w-full">
                    <Button variant={tier.variant} className="w-full mb-6">
                      {tier.cta}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>

                  <div className="space-y-3 flex-1">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      What's included
                    </p>
                    {tier.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-text-secondary">{feature}</span>
                      </div>
                    ))}
                    {tier.limitations.length > 0 && (
                      <>
                        <div className="pt-2 border-t border-border mt-4">
                          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">
                            Limitations
                          </p>
                        </div>
                        {tier.limitations.map((limitation, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <X className="h-5 w-5 text-text-tertiary flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-text-tertiary">{limitation}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trust Signals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 pt-12 border-t border-border">
            <div className="text-center">
              <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">SOC 2 Compliant</p>
              <p className="text-xs text-text-tertiary mt-1">Enterprise-grade security</p>
            </div>
            <div className="text-center">
              <Zap className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">No Credit Card</p>
              <p className="text-xs text-text-tertiary mt-1">Start free, upgrade later</p>
            </div>
            <div className="text-center">
              <Users className="h-8 w-8 text-info mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">Trusted by 500+</p>
              <p className="text-xs text-text-tertiary mt-1">Companies worldwide</p>
            </div>
            <div className="text-center">
              <Clock className="h-8 w-8 text-warning mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">Cancel Anytime</p>
              <p className="text-xs text-text-tertiary mt-1">No long-term contracts</p>
            </div>
          </div>
        </Container>
      </section>

      {/* ROI Calculator */}
      <section className="py-16 bg-background-secondary border-y border-border">
        <Container size="md">
          <div className="text-center mb-12">
            <Badge variant="primary" className="mb-4">
              <Calculator className="h-3 w-3 mr-1" />
              ROI Calculator
            </Badge>
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Calculate your savings
            </h2>
            <p className="text-lg text-text-secondary">
              See how much you can save by switching to InterviewLM
            </p>
          </div>

          <Card className="border-border-secondary">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <Label htmlFor="avgSalary">Average developer salary</Label>
                  <Input
                    id="avgSalary"
                    type="number"
                    value={avgSalary}
                    onChange={(e) => setAvgSalary(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    Used to calculate bad hire replacement cost
                  </p>
                </div>
                <div>
                  <Label htmlFor="assessments">Assessments per month</Label>
                  <Input
                    id="assessments"
                    type="number"
                    value={assessmentsPerMonth}
                    onChange={(e) => setAssessmentsPerMonth(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    How many candidates you assess monthly
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-background-tertiary border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-5 w-5 text-success" />
                    <p className="text-sm font-medium text-text-secondary">Monthly Savings</p>
                  </div>
                  <p className="text-2xl font-bold text-success">
                    ${Math.round(monthlySavings).toLocaleString()}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    vs traditional testing platforms
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-background-tertiary border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <p className="text-sm font-medium text-text-secondary">Annual Savings</p>
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    ${Math.round(annualSavings).toLocaleString()}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    First year cost reduction
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-background-tertiary border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-info" />
                    <p className="text-sm font-medium text-text-secondary">Bad Hire Prevention</p>
                  </div>
                  <p className="text-2xl font-bold text-info">
                    ${Math.round(badHirePrevention).toLocaleString()}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Avg. cost avoided per prevented bad hire
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm text-text-secondary">
                  <span className="font-semibold text-primary">Total first-year value:</span>{" "}
                  ${Math.round(annualSavings + badHirePrevention).toLocaleString()} in savings and risk reduction
                </p>
              </div>
            </CardContent>
          </Card>
        </Container>
      </section>

      {/* Comparison Table */}
      <section className="py-16">
        <Container size="md">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              How we compare
            </h2>
            <p className="text-lg text-text-secondary">
              InterviewLM vs traditional coding assessment platforms
            </p>
          </div>

          <Card className="border-border-secondary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-background-secondary">
                    <th className="text-left p-4 text-sm font-semibold text-text-secondary">
                      Feature
                    </th>
                    <th className="text-center p-4 text-sm font-semibold text-primary">
                      InterviewLM
                    </th>
                    <th className="text-center p-4 text-sm font-semibold text-text-tertiary">
                      Traditional Tests
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((item, index) => (
                    <tr key={index} className="border-b border-border last:border-0">
                      <td className="p-4 text-sm text-text-primary">
                        {item.feature}
                      </td>
                      <td className="p-4 text-center">
                        {typeof item.us === "boolean" ? (
                          item.us ? (
                            <Check className="h-5 w-5 text-success mx-auto" />
                          ) : (
                            <X className="h-5 w-5 text-text-tertiary mx-auto" />
                          )
                        ) : (
                          <span className="text-sm font-medium text-primary">{item.us}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {typeof item.traditional === "boolean" ? (
                          item.traditional ? (
                            <Check className="h-5 w-5 text-text-tertiary mx-auto" />
                          ) : (
                            <X className="h-5 w-5 text-text-tertiary mx-auto" />
                          )
                        ) : (
                          <span className="text-sm text-text-tertiary">{item.traditional}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Container>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-background-secondary border-y border-border">
        <Container size="md">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Frequently asked questions
            </h2>
            <p className="text-lg text-text-secondary">
              Everything you need to know about pricing and billing
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <Card
                key={index}
                className="border-border-secondary cursor-pointer hover:border-border-hover transition-colors"
                onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        {faq.question}
                      </h3>
                      {expandedFaq === index && (
                        <p className="text-sm text-text-secondary leading-relaxed">
                          {faq.answer}
                        </p>
                      )}
                    </div>
                    {expandedFaq === index ? (
                      <ChevronUp className="h-5 w-5 text-text-secondary flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-text-secondary flex-shrink-0" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-sm text-text-secondary mb-4">
              Still have questions?
            </p>
            <Link href="/contact">
              <Button variant="outline">
                Contact Sales
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <Container size="md">
          <Card className="border-primary bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="pt-12 pb-12 text-center">
              <h2 className="text-3xl font-bold text-text-primary mb-4">
                Ready to transform your hiring?
              </h2>
              <p className="text-lg text-text-secondary mb-8 max-w-2xl mx-auto">
                Start your free 14-day trial today. No credit card required.
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
                    Talk to Sales
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-text-tertiary mt-6">
                14-day free trial • No credit card required • Cancel anytime
              </p>
            </CardContent>
          </Card>
        </Container>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <Container size="lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-4">Product</h3>
              <ul className="space-y-3">
                <li><Link href="/#features" className="text-sm text-text-secondary hover:text-text-primary transition">Features</Link></li>
                <li><Link href="/pricing" className="text-sm text-text-secondary hover:text-text-primary transition">Pricing</Link></li>
                <li><Link href="/security" className="text-sm text-text-secondary hover:text-text-primary transition">Security</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-4">Company</h3>
              <ul className="space-y-3">
                <li><Link href="/about" className="text-sm text-text-secondary hover:text-text-primary transition">About</Link></li>
                <li><Link href="/contact" className="text-sm text-text-secondary hover:text-text-primary transition">Contact</Link></li>
                <li><Link href="/careers" className="text-sm text-text-secondary hover:text-text-primary transition">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-4">Resources</h3>
              <ul className="space-y-3">
                <li><Link href="/docs" className="text-sm text-text-secondary hover:text-text-primary transition">Documentation</Link></li>
                <li><Link href="/blog" className="text-sm text-text-secondary hover:text-text-primary transition">Blog</Link></li>
                <li><Link href="/support" className="text-sm text-text-secondary hover:text-text-primary transition">Support</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-4">Legal</h3>
              <ul className="space-y-3">
                <li><Link href="/privacy" className="text-sm text-text-secondary hover:text-text-primary transition">Privacy</Link></li>
                <li><Link href="/terms" className="text-sm text-text-secondary hover:text-text-primary transition">Terms</Link></li>
                <li><Link href="/security" className="text-sm text-text-secondary hover:text-text-primary transition">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-border text-center">
            <p className="text-sm text-text-tertiary">
              © 2025 InterviewLM. All rights reserved.
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
