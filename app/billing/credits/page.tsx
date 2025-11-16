"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, CreditCard, Zap, TrendingUp, Building2 } from "lucide-react";
import { toast } from "sonner";

const CREDIT_PACKAGES = [
  {
    id: "SINGLE",
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_SINGLE || "pri_01hzf9kj",
    name: "Pay As You Go",
    credits: 1,
    price: 20,
    pricePerCredit: 20,
    icon: Zap,
    description: "Perfect for trying out the platform",
    features: [
      "1 technical assessment",
      "Full AI-powered coding interview",
      "Detailed candidate evaluation",
      "Session recording & replay",
    ],
    popular: false,
  },
  {
    id: "MEDIUM",
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_MEDIUM || "pri_01hzf9km",
    name: "Medium Pack",
    credits: 50,
    price: 750,
    pricePerCredit: 15,
    icon: TrendingUp,
    description: "Best value for growing teams",
    features: [
      "50 technical assessments",
      "Save 25% per assessment",
      "All features included",
      "Priority email support",
      "Volume discount applied",
    ],
    popular: true,
    savings: "$250",
  },
  {
    id: "ENTERPRISE",
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ENTERPRISE || "pri_01hzf9kn",
    name: "Enterprise",
    credits: 500,
    price: 5000,
    pricePerCredit: 10,
    icon: Building2,
    description: "For large-scale hiring",
    features: [
      "500 technical assessments",
      "Save 50% per assessment",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantee",
    ],
    popular: false,
    savings: "$5,000",
  },
];

export default function CreditsPage() {
  const router = useRouter();
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);

  const handlePurchase = async (productId: string, packageName: string) => {
    setLoadingPackage(productId);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to Paddle checkout
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(data.error || "Failed to create checkout session");
        setLoadingPackage(null);
      }
    } catch (error) {
      toast.error("Something went wrong");
      setLoadingPackage(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-text-primary mb-4">
            Purchase Assessment Credits
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Choose the credit package that fits your hiring needs. All packages include
            full access to AI-powered interviews, detailed evaluations, and session recordings.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {CREDIT_PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            const isLoading = loadingPackage === pkg.productId;

            return (
              <Card
                key={pkg.id}
                className={`relative ${
                  pkg.popular
                    ? "border-primary/40 shadow-glow"
                    : "border-border-secondary"
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="primary" className="px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{pkg.name}</CardTitle>
                      {pkg.savings && (
                        <p className="text-xs text-success">
                          Save {pkg.savings}
                        </p>
                      )}
                    </div>
                  </div>
                  <CardDescription>{pkg.description}</CardDescription>
                </CardHeader>

                <CardContent>
                  {/* Pricing */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-4xl font-bold text-text-primary">
                        ${pkg.price}
                      </span>
                      <span className="text-text-tertiary">
                        / {pkg.credits} {pkg.credits === 1 ? "credit" : "credits"}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary">
                      ${pkg.pricePerCredit} per assessment
                    </p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-6">
                    {pkg.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-text-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Button
                    onClick={() => handlePurchase(pkg.productId, pkg.name)}
                    disabled={isLoading}
                    variant={pkg.popular ? "primary" : "outline"}
                    className="w-full"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Purchase {pkg.credits} {pkg.credits === 1 ? "Credit" : "Credits"}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-text-primary mb-6 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Do credits expire?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">
                  No, credits never expire. Use them whenever you need to conduct interviews.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I get a refund?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">
                  Unused credits can be refunded within 30 days of purchase. Once a credit has
                  been used for an interview, it becomes non-refundable.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What payment methods do you accept?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">
                  We accept all major credit cards, PayPal, and various local payment methods
                  through our payment processor Paddle. Paddle also handles sales tax automatically.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Need a custom plan?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary mb-4">
                  For organizations requiring more than 500 assessments or custom features,
                  contact our sales team for a tailored enterprise plan.
                </p>
                <Button variant="outline" onClick={() => window.location.href = "mailto:sales@interviewlm.com"}>
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-12 text-center">
          <p className="text-sm text-text-tertiary mb-4">
            Secure payment processing powered by Paddle
          </p>
          <div className="flex items-center justify-center gap-4 text-text-muted">
            <span className="text-xs">🔒 SSL Encrypted</span>
            <span className="text-xs">•</span>
            <span className="text-xs">PCI Compliant</span>
            <span className="text-xs">•</span>
            <span className="text-xs">Global Tax Handling</span>
          </div>
        </div>
      </div>
    </div>
  );
}
