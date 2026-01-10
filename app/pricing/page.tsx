"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/ui/spinner";
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
  Video,
  ShieldCheck,
  Plus,
} from "lucide-react";

// Types for API response
interface PricingPlan {
  slug: string;
  name: string;
  description: string | null;
  credits: number;
  price: number;
  pricePerCredit: number;
  currency: string;
  paddleProductId: string;
  isPopular: boolean;
  badge: string | null;
  features: string[];
  sortOrder: number;
  planType: string;
}

interface AddOn {
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  icon: string | null;
  features: string[];
  paddleProductId: string | null;
}

interface PricingData {
  plans: PricingPlan[];
  addOns: AddOn[];
  summary: {
    basePrice: number;
    priceFloor: number;
    addOnPrices: {
      videoRecording: number;
      liveProctoring: number;
    };
  };
}

export default function PricingPage() {
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [avgSalary, setAvgSalary] = useState(120000);
  const [assessmentsPerMonth, setAssessmentsPerMonth] = useState(50);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  // Fetch pricing data from API
  useEffect(() => {
    async function fetchPricing() {
      try {
        const response = await fetch("/api/pricing");
        if (!response.ok) {
          throw new Error("Failed to fetch pricing");
        }
        const data = await response.json();
        setPricingData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pricing");
      } finally {
        setLoading(false);
      }
    }
    fetchPricing();
  }, []);

  // Toggle add-on selection
  const toggleAddOn = (slug: string) => {
    setSelectedAddOns(prev =>
      prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug]
    );
  };

  // Calculate add-on cost for a plan
  const calculateAddOnCost = (credits: number) => {
    if (!pricingData) return 0;
    return selectedAddOns.reduce((total, slug) => {
      const addon = pricingData.addOns.find(a => a.slug === slug);
      return total + (addon ? addon.price * credits : 0);
    }, 0);
  };

  // ROI Calculator
  const basePrice = pricingData?.summary?.basePrice || 25;
  const traditionalTestCostPerCandidate = 30; // Vervoe charges $30
  const interviewLMCostPerCandidate = pricingData?.plans?.find(p => p.slug === "scale")?.pricePerCredit || 21;

  const monthlySavings = assessmentsPerMonth * (traditionalTestCostPerCandidate - interviewLMCostPerCandidate);
  const annualSavings = monthlySavings * 12;
  const badHireReplacementCost = avgSalary * 1.5;
  const badHirePrevention = badHireReplacementCost * 0.3;

  const comparisonFeatures = [
    { feature: "AI Copilot proficiency testing", us: true, traditional: false },
    { feature: "Real-world coding environment", us: true, traditional: false },
    { feature: "Anti-cheating monitoring", us: true, traditional: true },
    { feature: "Automated AI evaluation", us: true, traditional: true },
    { feature: "Setup time", us: "< 5 min", traditional: "Hours" },
    { feature: "Cost per assessment", us: "$20-25", traditional: "$30+" },
    { feature: "AI usage analytics", us: true, traditional: false },
    { feature: "Video recording add-on", us: true, traditional: false },
    { feature: "Measures future AI readiness", us: true, traditional: false },
  ];

  const faqs = [
    {
      question: "How does credit-based pricing work?",
      answer: "Purchase credits in packs and use them whenever you need to assess candidates. 1 credit = 1 base assessment. Add premium features like Video Recording or Live Proctoring at checkout. Credits never expire.",
    },
    {
      question: "What are add-ons?",
      answer: "Add-ons are premium features you can add to any assessment. Video Recording ($10) captures the full session for playback. Live Proctoring ($15) provides real-time monitoring and anti-cheating measures. Add-ons are charged per assessment.",
    },
    {
      question: "Do credits expire?",
      answer: "No! Credits never expire. Buy them once and use them whenever you need to assess candidates, whether that's next week or next year.",
    },
    {
      question: "What's included in a base assessment?",
      answer: "Every assessment includes: AI-assisted coding environment (Claude Code), automated AI evaluation, detailed candidate report, AI usage analytics, and 30-day result access. Premium add-ons like Video Recording and Live Proctoring are optional.",
    },
    {
      question: "How does volume pricing work?",
      answer: "The more credits you buy, the lower your per-assessment cost. Starter (10 credits) = $25/each, Growth (50) = $22.50/each, Scale (200) = $21/each, Enterprise (500) = $20/each. The $20 floor ensures quality.",
    },
    {
      question: "Is there a free trial?",
      answer: "Yes! Start with a 14-day free trial that includes 3 free assessments. No credit card required. After the trial, purchase credits to continue.",
    },
    {
      question: "Do you offer refunds?",
      answer: "We offer a 30-day money-back guarantee on credit pack purchases if you haven't used any credits.",
    },
    {
      question: "What makes InterviewLM different?",
      answer: "We're the only platform that tests how developers work WITH AI tools. As AI transforms development, we help you hire developers who can leverage AI effectively - a skill no other platform measures.",
    },
  ];

  // Icon component for add-ons
  const AddOnIcon = ({ icon }: { icon: string | null }) => {
    if (icon === "Video") return <Video className="h-5 w-5" />;
    if (icon === "Shield") return <ShieldCheck className="h-5 w-5" />;
    return <Plus className="h-5 w-5" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-8 w-8 mx-auto mb-4" />
          <p className="text-text-secondary">Loading pricing...</p>
        </div>
      </div>
    );
  }

  if (error || !pricingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-error mb-4">{error || "Failed to load pricing"}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

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
              $20-25 per assessment • Premium AI evaluation
            </Badge>
            <h1 className="text-5xl font-bold text-text-primary">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Pay only for what you use. Buy credits that never expire. Add premium features when you need them.
            </p>
            <p className="text-sm text-text-tertiary">
              Start with a free 14-day trial • 3 free assessments • No credit card required
            </p>
          </div>
        </Container>
      </section>

      {/* Premium Add-Ons Section */}
      <section className="py-12 bg-background-secondary border-b border-border">
        <Container size="lg">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Premium Add-Ons
            </h2>
            <p className="text-text-secondary">
              Enhance any assessment with premium features. Select the ones you need.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {pricingData.addOns.map((addon) => (
              <Card
                key={addon.slug}
                className={`cursor-pointer transition-all ${
                  selectedAddOns.includes(addon.slug)
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                    : "border-border-secondary hover:border-border-hover"
                }`}
                onClick={() => toggleAddOn(addon.slug)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedAddOns.includes(addon.slug)
                          ? "bg-primary text-white"
                          : "bg-background-tertiary text-text-secondary"
                      }`}>
                        <AddOnIcon icon={addon.icon} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary">{addon.name}</h3>
                        <p className="text-sm text-text-tertiary">{addon.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">+${addon.price}</p>
                      <p className="text-xs text-text-tertiary">per assessment</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {addon.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                        <Check className="h-4 w-4 text-success flex-shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">
                        {selectedAddOns.includes(addon.slug) ? "Selected" : "Click to add"}
                      </span>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedAddOns.includes(addon.slug)
                          ? "bg-primary border-primary"
                          : "border-border-secondary"
                      }`}>
                        {selectedAddOns.includes(addon.slug) && (
                          <Check className="h-3 w-3 text-white" />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedAddOns.length > 0 && (
            <div className="text-center mt-6">
              <Badge variant="success">
                <Check className="h-3 w-3 mr-1" />
                {selectedAddOns.length} add-on{selectedAddOns.length > 1 ? "s" : ""} selected
              </Badge>
            </div>
          )}
        </Container>
      </section>

      {/* Credit Packs */}
      <section className="py-16">
        <Container size="lg">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Credit Packs
            </h2>
            <p className="text-text-secondary">
              Buy credits once, use them anytime. Credits never expire.
              {selectedAddOns.length > 0 && (
                <span className="text-primary ml-1">
                  (Prices include selected add-ons)
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingData.plans.map((plan) => {
              const addOnCost = calculateAddOnCost(plan.credits);
              const totalPrice = plan.price + addOnCost;
              const effectivePerCredit = totalPrice / plan.credits;
              const savings = plan.slug === "starter" ? 0 : Math.round((1 - plan.pricePerCredit / basePrice) * 100);

              return (
                <Card
                  key={plan.slug}
                  className={`border-border-secondary relative flex flex-col ${
                    plan.isPopular ? "border-primary shadow-lg shadow-primary/10" : ""
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="primary">
                        <Sparkles className="h-3 w-3 mr-1" />
                        {plan.badge}
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-8 pt-6">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription className="text-base">
                      {plan.description}
                    </CardDescription>
                    <div className="pt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-text-primary">
                          ${Math.round(totalPrice).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary mt-2">
                        ${effectivePerCredit.toFixed(2)}/assessment
                        {selectedAddOns.length > 0 && " (with add-ons)"}
                      </p>
                      {savings > 0 && (
                        <Badge variant="success" className="mt-2">
                          Save {savings}%
                        </Badge>
                      )}
                      <p className="text-xs text-text-tertiary mt-2">
                        {plan.credits} credits • Never expires
                      </p>
                      {addOnCost > 0 && (
                        <p className="text-xs text-primary mt-1">
                          +${addOnCost} for add-ons
                        </p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <Link href="/auth/signup" className="w-full">
                      <Button
                        variant={plan.isPopular ? "primary" : "outline"}
                        className="w-full mb-6"
                      >
                        Buy {plan.credits} Credits
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>

                    <div className="space-y-3 flex-1">
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-text-secondary">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* What's Included */}
          <Card className="mt-12 border-border-secondary">
            <CardContent className="pt-8 pb-8">
              <h3 className="text-xl font-bold text-text-primary mb-4 text-center">
                Every Assessment Includes
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  "AI-assisted coding (Claude Code)",
                  "Automated AI evaluation",
                  "Detailed candidate report",
                  "AI usage analytics",
                  "Anti-cheating monitoring",
                  "30-day result access",
                  "Email support",
                  "API access",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check className="h-4 w-4 text-success flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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
              <p className="text-sm font-medium text-text-primary">$20 Floor</p>
              <p className="text-xs text-text-tertiary mt-1">Quality guaranteed</p>
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
              See how much you save compared to Vervoe and other AI platforms ($30+/candidate)
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
                    vs competitors at $30/assessment
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
                      Others
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
                Ready to hire AI-native developers?
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
                <li><Link href="/#security" className="text-sm text-text-secondary hover:text-text-primary transition">Security</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-4">Company</h3>
              <ul className="space-y-3">
                <li><Link href="/about" className="text-sm text-text-secondary hover:text-text-primary transition">About</Link></li>
                <li><Link href="/contact" className="text-sm text-text-secondary hover:text-text-primary transition">Contact</Link></li>
                <li><Link href="/blog" className="text-sm text-text-secondary hover:text-text-primary transition">Blog</Link></li>
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
                <li><Link href="/legal/privacy" className="text-sm text-text-secondary hover:text-text-primary transition">Privacy</Link></li>
                <li><Link href="/legal/terms" className="text-sm text-text-secondary hover:text-text-primary transition">Terms</Link></li>
                <li><Link href="/#security" className="text-sm text-text-secondary hover:text-text-primary transition">Security</Link></li>
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
