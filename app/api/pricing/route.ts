/**
 * GET /api/pricing
 *
 * Public endpoint to fetch active pricing plans and add-ons from the database.
 * Used by the pricing page and checkout flows.
 *
 * Response:
 * - plans: Credit pack options (Starter, Growth, Scale, Enterprise)
 * - addOns: Premium features (Video Recording, Live Proctoring)
 * - paddle: Paddle configuration for checkout
 */

import { NextResponse } from "next/server";
import { getPricingPlans, getAddOns, getPaddleConfig } from "@/lib/services/paddle";

export async function GET() {
  try {
    // Fetch plans and add-ons in parallel
    const [plans, addons] = await Promise.all([
      getPricingPlans(),
      getAddOns(),
    ]);

    // Transform plans to a frontend-friendly format
    const pricingPlans = plans.map((plan) => ({
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      credits: plan.credits,
      price: Number(plan.price),
      pricePerCredit: Number(plan.pricePerCredit),
      currency: plan.currency,
      paddleProductId: plan.paddleProductId,
      isPopular: plan.isPopular,
      badge: plan.badge,
      features: plan.features as string[],
      sortOrder: plan.sortOrder,
      planType: plan.planType,
    }));

    // Transform add-ons to a frontend-friendly format
    const assessmentAddOns = addons.map((addon) => ({
      slug: addon.slug,
      name: addon.name,
      description: addon.description,
      price: Number(addon.price),
      currency: addon.currency,
      icon: addon.icon,
      features: addon.features as string[],
      paddleProductId: addon.paddleProductId,
    }));

    // Get Paddle config for frontend initialization
    const paddleConfig = await getPaddleConfig();

    return NextResponse.json({
      plans: pricingPlans,
      addOns: assessmentAddOns,
      paddle: {
        vendor: paddleConfig.vendor,
        environment: paddleConfig.environment,
      },
      // Summary for quick reference
      summary: {
        basePrice: 25, // Base price per assessment
        priceFloor: 20, // Minimum price with max discount
        addOnPrices: {
          videoRecording: 10,
          liveProctoring: 15,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching pricing plans:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing plans" },
      { status: 500 }
    );
  }
}
