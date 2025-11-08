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
  CreditCard,
  Package,
} from "lucide-react";

export default function PricingPage() {
  const [pricingModel, setPricingModel] = useState<"credits" | "subscription">("credits");
  const [avgSalary, setAvgSalary] = useState(120000);
  const [assessmentsPerMonth, setAssessmentsPerMonth] = useState(50);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  // Credit Pack Pricing
  const creditPacks = [
    {
      name: "Pay-as-you-go",
      description: "Perfect for trying out the platform",
      credits: 1,
      totalPrice: 10,
      pricePerAssessment: 10,
      discount: 0,
      features: [
        "No commitment required",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Email support",
      ],
      cta: "Buy Single Credit",
      variant: "outline" as const,
      badge: null,
    },
    {
      name: "Small Pack",
      description: "For growing teams",
      credits: 10,
      totalPrice: 90,
      pricePerAssessment: 9,
      discount: 10,
      features: [
        "10 assessments",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Custom branding",
        "Priority email support",
        "API access",
      ],
      cta: "Buy 10 Credits",
      variant: "outline" as const,
      badge: null,
    },
    {
      name: "Medium Pack",
      description: "For scaling companies",
      credits: 50,
      totalPrice: 375,
      pricePerAssessment: 7.5,
      discount: 25,
      features: [
        "50 assessments",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Custom branding",
        "All integrations",
        "Priority support",
        "API access",
        "Custom problem library",
      ],
      cta: "Buy 50 Credits",
      variant: "primary" as const,
      badge: "Best Value",
    },
    {
      name: "Large Pack",
      description: "For high-volume hiring",
      credits: 200,
      totalPrice: 1200,
      pricePerAssessment: 6,
      discount: 40,
      features: [
        "200 assessments",
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
      cta: "Buy 200 Credits",
      variant: "outline" as const,
      badge: null,
    },
  ];

  // Subscription Pricing
  const subscriptionTiers = [
    {
      name: "Starter",
      description: "For small teams",
      monthlyPrice: 79,
      includedAssessments: 10,
      overagePrice: 8,
      features: [
        "10 assessments/month included",
        "$8 per additional assessment",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Email support",
      ],
      cta: "Start Starter Plan",
      variant: "outline" as const,
      badge: null,
    },
    {
      name: "Professional",
      description: "For growing teams",
      monthlyPrice: 199,
      includedAssessments: 30,
      overagePrice: 7,
      features: [
        "30 assessments/month included",
        "$7 per additional assessment",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Custom branding",
        "Priority email support",
        "API access",
      ],
      cta: "Start Professional Plan",
      variant: "outline" as const,
      badge: null,
    },
    {
      name: "Growth",
      description: "For scaling companies",
      monthlyPrice: 499,
      includedAssessments: 100,
      overagePrice: 5,
      features: [
        "100 assessments/month included",
        "$5 per additional assessment",
        "All assessment types",
        "AI-powered evaluation",
        "Advanced analytics",
        "Custom branding",
        "All integrations",
        "Dedicated support",
        "API access",
        "Custom problem library",
        "Bulk candidate invites",
      ],
      cta: "Start Growth Plan",
      variant: "primary" as const,
      badge: "Most Popular",
    },
    {
      name: "Scale",
      description: "For enterprises",
      monthlyPrice: 1299,
      includedAssessments: 300,
      overagePrice: 4,
      features: [
        "300 assessments/month included",
        "$4 per additional assessment",
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
        "Custom SLA",
      ],
      cta: "Contact Sales",
      variant: "outline" as const,
      badge: null,
    },
  ];

  // ROI Calculator
  const costPerHire = 4683; // Industry average
  const badHireReplacementCost = avgSalary * 1.5;
  const traditionalTestCostPerCandidate = 18; // Industry average $15-25
  const interviewLMCostPerCandidate = pricingModel === "credits" ?
    7.5 : // Medium pack average
    (assessmentsPerMonth <= 10 ? 7.9 : assessmentsPerMonth <= 30 ? 6.63 : assessmentsPerMonth <= 100 ? 4.99 : 4.33);

  const monthlySavings = assessmentsPerMonth * (traditionalTestCostPerCandidate - interviewLMCostPerCandidate);
  const annualSavings = monthlySavings * 12;
  const badHirePrevention = badHireReplacementCost * 0.3; // 30% reduction in bad hires

  const comparisonFeatures = [
    { feature: "AI tool proficiency testing", us: true, traditional: false },
    { feature: "Real-world coding environment", us: true, traditional: false },
    { feature: "Anti-cheating monitoring", us: true, traditional: true },
    { feature: "Automated grading", us: true, traditional: true },
    { feature: "Setup time", us: "< 5 min", traditional: "Hours" },
    { feature: "Cost per assessment", us: "$6-10", traditional: "$15-25" },
    { feature: "AI usage analytics", us: true, traditional: false },
    { feature: "Custom problem library", us: true, traditional: true },
    { feature: "Measures future readiness", us: true, traditional: false },
  ];

  const faqs = [
    {
      question: "How does credit-based pricing work?",
      answer: "Purchase credits in packs and use them whenever you need to assess candidates. 1 credit = 1 assessment. Credits never expire and can be used anytime. The more credits you buy upfront, the lower your cost per assessment.",
    },
    {
      question: "Do credits expire?",
      answer: "No! Credits never expire. Buy them once and use them whenever you need to assess candidates, whether that's next week or next year.",
    },
    {
      question: "What's the difference between credits and subscriptions?",
      answer: "Credits are prepaid and never expire - perfect if your hiring needs vary month-to-month. Subscriptions include a set number of assessments monthly with discounted overage pricing - ideal for consistent hiring volume.",
    },
    {
      question: "Can I switch between credit packs and subscriptions?",
      answer: "Yes! You can start with credits to test the platform, then switch to a subscription if you have consistent hiring needs. Unused credits remain available even if you have an active subscription.",
    },
    {
      question: "What happens if I exceed my subscription limit?",
      answer: "You'll be charged the overage rate specified in your plan. Starter: $8/assessment, Professional: $7/assessment, Growth: $5/assessment, Scale: $4/assessment. You can also buy credit packs for better rates.",
    },
    {
      question: "Is there a free trial?",
      answer: "Yes! Start with a 14-day free trial that includes 3 free assessments. No credit card required. After the trial, purchase credits or choose a subscription plan.",
    },
    {
      question: "Do you offer refunds?",
      answer: "We offer a 30-day money-back guarantee on credit pack purchases if you haven't used any credits. For subscriptions, we offer refunds within 30 days if you're not satisfied with the platform.",
    },
    {
      question: "Can I get a custom enterprise plan?",
      answer: "Yes! For teams needing 500+ assessments/year, we offer custom enterprise plans with volume discounts (up to 50% off), dedicated account managers, custom integrations, and SLA agreements. Contact our sales team to discuss your needs.",
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
              $10 per assessment • No hidden fees
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Pay only for what you use. Buy credits that never expire, or choose a monthly plan.
            </p>
            <p className="text-sm text-text-tertiary">
              Start with a free 14-day trial • 3 free assessments • No credit card required
            </p>

            {/* Pricing Model Toggle */}
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setPricingModel("credits")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  pricingModel === "credits"
                    ? "bg-primary text-white"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-hover"
                }`}
              >
                <Package className="h-4 w-4" />
                <span className="text-sm font-medium">Credit Packs</span>
                <Badge variant={pricingModel === "credits" ? "success" : "default"} className="text-xs">
                  Never Expire
                </Badge>
              </button>
              <button
                onClick={() => setPricingModel("subscription")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  pricingModel === "subscription"
                    ? "bg-primary text-white"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-hover"
                }`}
              >
                <CreditCard className="h-4 w-4" />
                <span className="text-sm font-medium">Monthly Plans</span>
              </button>
            </div>
          </div>
        </Container>
      </section>

      {/* Pricing Tiers */}
      <section className="py-16">
        <Container size="lg">
          {pricingModel === "credits" ? (
            <>
              <div className="text-center mb-12">
                <h2 className="text-2xl font-bold text-text-primary mb-2">
                  Prepaid Credit Packs
                </h2>
                <p className="text-text-secondary">
                  Buy credits once, use them anytime. Credits never expire.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {creditPacks.map((pack, index) => (
                  <Card
                    key={index}
                    className={`border-border-secondary relative flex flex-col ${
                      pack.badge ? "border-primary shadow-lg shadow-primary/10" : ""
                    }`}
                  >
                    {pack.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge variant="primary">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {pack.badge}
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="pb-8 pt-6">
                      <CardTitle className="text-2xl">{pack.name}</CardTitle>
                      <CardDescription className="text-base">
                        {pack.description}
                      </CardDescription>
                      <div className="pt-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-text-primary">
                            ${pack.totalPrice}
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary mt-2">
                          ${pack.pricePerAssessment}/assessment
                        </p>
                        {pack.discount > 0 && (
                          <Badge variant="success" className="mt-2">
                            Save {pack.discount}%
                          </Badge>
                        )}
                        <p className="text-xs text-text-tertiary mt-2">
                          {pack.credits} {pack.credits === 1 ? "credit" : "credits"} • Never expires
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <Link href="/auth/signup" className="w-full">
                        <Button variant={pack.variant} className="w-full mb-6">
                          {pack.cta}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>

                      <div className="space-y-3 flex-1">
                        {pack.features.map((feature, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-text-secondary">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Enterprise Option */}
              <Card className="mt-12 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
                <CardContent className="pt-8 pb-8">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-text-primary mb-2">
                        Enterprise Volume Packs
                      </h3>
                      <p className="text-text-secondary mb-4">
                        500+ assessments with up to 50% discount. Includes dedicated support, custom integrations, and SLA.
                      </p>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-sm text-text-tertiary">Starting at</p>
                          <p className="text-3xl font-bold text-primary">$5/assessment</p>
                        </div>
                        <div className="h-12 w-px bg-border"></div>
                        <div>
                          <p className="text-sm text-text-tertiary">500 credits</p>
                          <p className="text-lg font-semibold text-text-primary">$2,500</p>
                        </div>
                      </div>
                    </div>
                    <Link href="/contact">
                      <Button size="lg">
                        Contact Sales
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <div className="text-center mb-12">
                <h2 className="text-2xl font-bold text-text-primary mb-2">
                  Monthly Subscription Plans
                </h2>
                <p className="text-text-secondary">
                  Fixed monthly price with included assessments and discounted overages.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {subscriptionTiers.map((tier, index) => (
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
                            ${tier.monthlyPrice}
                          </span>
                          <span className="text-text-secondary">/mo</span>
                        </div>
                        <p className="text-sm text-text-secondary mt-2">
                          {tier.includedAssessments} assessments included
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          ${tier.overagePrice} per additional assessment
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <Link href={tier.name === "Scale" ? "/contact" : "/auth/signup"} className="w-full">
                        <Button variant={tier.variant} className="w-full mb-6">
                          {tier.cta}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>

                      <div className="space-y-3 flex-1">
                        {tier.features.map((feature, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-text-secondary">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* Trust Signals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 pt-12 border-t border-border">
            <div className="text-center">
              <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">SOC 2 Compliant</p>
              <p className="text-xs text-text-tertiary mt-1">Enterprise-grade security</p>
            </div>
            <div className="text-center">
              <Zap className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">No Expiration</p>
              <p className="text-xs text-text-tertiary mt-1">Credits never expire</p>
            </div>
            <div className="text-center">
              <Users className="h-8 w-8 text-info mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">Trusted by 500+</p>
              <p className="text-xs text-text-tertiary mt-1">Companies worldwide</p>
            </div>
            <div className="text-center">
              <Clock className="h-8 w-8 text-warning mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">30-Day Guarantee</p>
              <p className="text-xs text-text-tertiary mt-1">Money-back guarantee</p>
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
                Start your free 14-day trial today. 3 free assessments included. No credit card required.
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
                14-day free trial • 3 free assessments • No credit card required
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
