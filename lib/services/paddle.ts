/**
 * Paddle Payment Service
 *
 * Handles credit purchases, webhooks, and subscription management using Paddle.
 * Paddle provides built-in tax handling, fraud detection, and global payment methods.
 *
 * Product configuration is stored in the database (PricingPlan model) for dynamic updates.
 */

import { z } from "zod";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { alerting } from "@/lib/services/alerting";
import type { PricingPlan, AssessmentAddOn } from "@prisma/client";

// Configuration (API keys still from env - these are secrets)
const PADDLE_VENDOR_ID = process.env.PADDLE_VENDOR_ID;
const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_PUBLIC_KEY = process.env.PADDLE_PUBLIC_KEY;
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || "sandbox";

// Paddle API base URL
const PADDLE_API_URL =
  PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

// Validation schemas
const createCheckoutSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  userId: z.string(),
  email: z.string().email(),
  quantity: z.number().int().positive().default(1),
});

// In-memory cache for pricing plans (refreshed every 5 minutes)
let pricingPlansCache: PricingPlan[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get all active pricing plans from database (with caching)
 */
export async function getPricingPlans(): Promise<PricingPlan[]> {
  const now = Date.now();

  // Return cached if still valid
  if (pricingPlansCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return pricingPlansCache;
  }

  // Fetch from database
  const plans = await prisma.pricingPlan.findMany({
    where: {
      isActive: true,
      OR: [
        { availableFrom: null },
        { availableFrom: { lte: new Date() } },
      ],
      AND: [
        {
          OR: [
            { availableUntil: null },
            { availableUntil: { gte: new Date() } },
          ],
        },
      ],
    },
    orderBy: { sortOrder: "asc" },
  });

  // Update cache
  pricingPlansCache = plans;
  cacheTimestamp = now;

  return plans;
}

/**
 * Get a single pricing plan by slug or Paddle product ID
 */
export async function getPricingPlan(
  identifier: string
): Promise<PricingPlan | null> {
  const plans = await getPricingPlans();

  // Try to find by slug first, then by paddleProductId
  return (
    plans.find((p) => p.slug === identifier) ||
    plans.find((p) => p.paddleProductId === identifier) ||
    null
  );
}

/**
 * Clear the pricing plans cache (call after admin updates)
 */
export function clearPricingPlansCache(): void {
  pricingPlansCache = null;
  cacheTimestamp = 0;
}

// In-memory cache for add-ons
let addOnsCache: AssessmentAddOn[] | null = null;
let addOnsCacheTimestamp = 0;

/**
 * Get all active assessment add-ons from database (with caching)
 */
export async function getAddOns(): Promise<AssessmentAddOn[]> {
  const now = Date.now();

  // Return cached if still valid
  if (addOnsCache && now - addOnsCacheTimestamp < CACHE_TTL_MS) {
    return addOnsCache;
  }

  // Fetch from database
  const addons = await prisma.assessmentAddOn.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // Update cache
  addOnsCache = addons;
  addOnsCacheTimestamp = now;

  return addons;
}

/**
 * Get a single add-on by slug
 */
export async function getAddOn(slug: string): Promise<AssessmentAddOn | null> {
  const addons = await getAddOns();
  return addons.find((a) => a.slug === slug) || null;
}

/**
 * Clear the add-ons cache (call after admin updates)
 */
export function clearAddOnsCache(): void {
  addOnsCache = null;
  addOnsCacheTimestamp = 0;
}

/**
 * Calculate total price for a checkout with add-ons
 */
export async function calculateCheckoutTotal(
  planSlug: string,
  addOnSlugs: string[] = [],
  quantity: number = 1
): Promise<{
  plan: PricingPlan;
  addOns: AssessmentAddOn[];
  baseTotal: number;
  addOnsTotal: number;
  grandTotal: number;
}> {
  const plan = await getPricingPlan(planSlug);
  if (!plan) {
    throw new Error(`Plan not found: ${planSlug}`);
  }

  const allAddOns = await getAddOns();
  const selectedAddOns = allAddOns.filter((a) => addOnSlugs.includes(a.slug));

  const baseTotal = Number(plan.price);
  // Add-ons are priced per assessment, so multiply by credits
  const addOnsTotal = selectedAddOns.reduce(
    (sum, addon) => sum + Number(addon.price) * plan.credits,
    0
  );
  const grandTotal = (baseTotal + addOnsTotal) * quantity;

  return {
    plan,
    addOns: selectedAddOns,
    baseTotal,
    addOnsTotal,
    grandTotal,
  };
}

/**
 * Legacy PADDLE_PRODUCTS format for backward compatibility
 * @deprecated Use getPricingPlans() instead
 */
export async function getLegacyProducts(): Promise<
  Record<string, { id: string; name: string; credits: number; price: number }>
> {
  const plans = await getPricingPlans();
  const products: Record<
    string,
    { id: string; name: string; credits: number; price: number }
  > = {};

  for (const plan of plans) {
    const key = plan.slug.toUpperCase();
    products[key] = {
      id: plan.paddleProductId,
      name: plan.name,
      credits: plan.credits,
      price: Number(plan.price),
    };
  }

  return products;
}

/**
 * Get Paddle authentication headers
 */
function getAuthHeaders(): Record<string, string> {
  if (!PADDLE_API_KEY) {
    throw new Error("PADDLE_API_KEY environment variable is not set");
  }

  return {
    Authorization: `Bearer ${PADDLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Verify Paddle webhook signature
 */
export function verifyWebhookSignature(
  payload: any,
  signature: string
): boolean {
  if (!PADDLE_WEBHOOK_SECRET) {
    console.error("PADDLE_WEBHOOK_SECRET not set - webhook verification skipped");
    return true; // Allow in development
  }

  try {
    // Paddle uses ksort to sort the payload fields alphabetically
    const sortedKeys = Object.keys(payload)
      .filter((key) => key !== "p_signature")
      .sort();

    // Serialize the payload as Paddle does
    const serialized = sortedKeys
      .map((key) => {
        const value = payload[key];
        return `${key}=${value}`;
      })
      .join("&");

    // Verify using HMAC SHA256
    const hmac = crypto.createHmac("sha256", PADDLE_WEBHOOK_SECRET);
    hmac.update(serialized);
    const calculatedSignature = hmac.digest("hex");

    return calculatedSignature === signature;
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}

/**
 * Create a checkout session for purchasing credits
 *
 * @param params - Checkout parameters (productId can be slug or Paddle product ID)
 * @returns Checkout URL for redirect
 */
export async function createCheckout(params: {
  organizationId: string;
  productId: string; // Can be slug (e.g., "single") or Paddle ID (e.g., "pri_01hzf9kj")
  userId: string;
  email: string;
  quantity?: number;
}): Promise<{ checkoutUrl: string; checkoutId: string }> {
  try {
    const validatedParams = createCheckoutSchema.parse(params);

    // Get product details from database
    const plan = await getPricingPlan(validatedParams.productId);

    if (!plan) {
      throw new Error(`Invalid product ID: ${validatedParams.productId}`);
    }

    // Create checkout session via Paddle API
    const response = await fetch(`${PADDLE_API_URL}/checkouts`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        items: [
          {
            price_id: plan.paddleProductId, // Use the Paddle product ID from DB
            quantity: validatedParams.quantity,
          },
        ],
        customer: {
          email: validatedParams.email,
        },
        custom_data: {
          organization_id: validatedParams.organizationId,
          user_id: validatedParams.userId,
          credits: plan.credits * validatedParams.quantity,
          plan_slug: plan.slug, // Include plan slug for reference
        },
        settings: {
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?payment=cancelled`,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Paddle API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      checkoutUrl: data.data.url,
      checkoutId: data.data.id,
    };
  } catch (error) {
    console.error("Error creating Paddle checkout:", error);
    throw new Error(
      `Failed to create checkout: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Handle Paddle webhook event
 *
 * @param payload - Webhook payload from Paddle
 * @returns Processing result
 */
export async function handleWebhook(
  payload: any
): Promise<{ success: boolean; message: string }> {
  try {
    // Verify signature
    const signature = payload.p_signature;
    const isValid = verifyWebhookSignature(payload, signature);

    if (!isValid) {
      console.error("Invalid webhook signature");
      return { success: false, message: "Invalid signature" };
    }

    const eventType = payload.alert_name || payload.event_type;

    console.log(`Processing Paddle webhook: ${eventType}`);

    switch (eventType) {
      case "payment_succeeded":
        return await handlePaymentSucceeded(payload);

      case "payment_failed":
        return await handlePaymentFailed(payload);

      case "subscription_created":
        return await handleSubscriptionCreated(payload);

      case "subscription_cancelled":
        return await handleSubscriptionCancelled(payload);

      case "refund_completed":
        return await handleRefundCompleted(payload);

      default:
        console.warn(`Unhandled webhook event: ${eventType}`);
        return { success: true, message: `Event ${eventType} ignored` };
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle successful payment webhook
 * ACTUALLY adds credits to organization using atomic transaction
 */
async function handlePaymentSucceeded(
  payload: any
): Promise<{ success: boolean; message: string }> {
  try {
    const customData = JSON.parse(payload.passthrough || "{}");
    const organizationId = customData.organization_id;
    const creditsToAdd = parseInt(customData.credits || "0", 10);
    const userId = customData.user_id;

    if (!organizationId || !creditsToAdd) {
      throw new Error("Missing organization_id or credits in webhook payload");
    }

    // Add credits to organization with atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get current organization state
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, credits: true },
      });

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      // Calculate new balance
      const newBalance = organization.credits + creditsToAdd;

      // Update organization credits
      await tx.organization.update({
        where: { id: organizationId },
        data: { credits: newBalance },
      });

      // Create transaction record
      const transaction = await tx.creditTransaction.create({
        data: {
          organizationId,
          type: "PURCHASE",
          amount: creditsToAdd,
          balanceAfter: newBalance,
          paddleOrderId: payload.order_id,
          paddlePaymentId: payload.payment_id,
          amountPaid: parseFloat(payload.sale_gross),
          currency: payload.currency,
          description: `Purchased ${creditsToAdd} assessment credits`,
          createdBy: userId,
          metadata: {
            paddleCheckoutId: payload.checkout_id,
            paddleCustomerId: payload.customer_id,
          },
        },
      });

      console.log(
        `[Paddle] Added ${creditsToAdd} credits to organization ${organizationId}. New balance: ${newBalance}`
      );

      return { transaction, newBalance };
    });

    return {
      success: true,
      message: `Added ${creditsToAdd} credits to organization ${organizationId}. New balance: ${result.newBalance}`,
    };
  } catch (error) {
    console.error("Error handling payment_succeeded:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle failed payment webhook
 */
async function handlePaymentFailed(
  payload: any
): Promise<{ success: boolean; message: string }> {
  try {
    const customData = JSON.parse(payload.passthrough || "{}");
    const organizationId = customData.organization_id;
    const userId = customData.user_id;

    console.error("Payment failed:", {
      organizationId,
      orderId: payload.order_id,
      reason: payload.payment_failure_reason,
    });

    // Get organization and user details for notification
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          where: { role: "OWNER" },
          include: { user: true },
        },
      },
    });

    if (!organization) {
      console.error("[Paddle] Organization not found:", organizationId);
      return {
        success: false,
        message: "Organization not found",
      };
    }

    // Log failed transaction to database
    await prisma.creditTransaction.create({
      data: {
        organizationId,
        type: "PURCHASE",
        amount: 0, // Failed payment - no credits
        balanceAfter: organization.credits, // Balance unchanged
        paddleOrderId: payload.order_id,
        metadata: {
          status: "FAILED",
          failureReason: payload.payment_failure_reason,
          paymentMethod: payload.payment_method,
          attemptedAmount: payload.amount,
          currency: payload.currency,
        },
      },
    });

    // Send critical alert to notify admins
    await alerting.critical(
      `Payment Failed: ${organization.name}`,
      `Payment for order ${payload.order_id} failed`,
      {
        organizationId,
        organizationName: organization.name,
        orderId: payload.order_id,
        amount: payload.amount,
        currency: payload.currency,
        failureReason: payload.payment_failure_reason,
        paymentMethod: payload.payment_method,
        userEmail: organization.members[0]?.user?.email,
      }
    );

    // TODO: Send email to user via email service (Resend, SendGrid, etc.)
    // This would require integrating an email service and creating email templates
    // For now, the alerting service will send to Slack if configured

    return {
      success: true,
      message: "Payment failure logged and notification sent",
    };
  } catch (error) {
    console.error("Error handling payment_failed:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle subscription created webhook (if offering subscriptions)
 */
async function handleSubscriptionCreated(
  payload: any
): Promise<{ success: boolean; message: string }> {
  try {
    const customData = JSON.parse(payload.passthrough || "{}");
    const organizationId = customData.organization_id;
    const planId = payload.subscription_plan_id;

    console.log("Subscription created:", {
      organizationId,
      subscriptionId: payload.subscription_id,
      plan: planId,
    });

    // Determine plan tier based on Paddle plan ID
    const planMap: Record<string, "STARTUP" | "GROWTH" | "ENTERPRISE"> = {
      [process.env.PADDLE_PLAN_STARTUP || "pri_startup"]: "STARTUP",
      [process.env.PADDLE_PLAN_GROWTH || "pri_growth"]: "GROWTH",
      [process.env.PADDLE_PLAN_ENTERPRISE || "pri_enterprise"]: "ENTERPRISE",
    };
    const plan = planMap[planId] || "STARTUP";

    // Update organization plan
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        plan,
        subscriptionStatus: "ACTIVE",
        paddleSubscriptionId: payload.subscription_id,
        billingInterval: payload.subscription_plan_billing_cycle || "MONTHLY",
      },
    });

    // Get organization for notification
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          where: { role: "OWNER" },
          include: { user: true },
        },
      },
    });

    // Send info alert
    await alerting.info(
      `New Subscription: ${organization?.name}`,
      `${plan} subscription activated`,
      {
        organizationId,
        organizationName: organization?.name,
        subscriptionId: payload.subscription_id,
        plan,
        billingCycle: payload.subscription_plan_billing_cycle,
        userEmail: organization?.members[0]?.user?.email,
      }
    );

    // TODO: Send welcome email via email service
    // TODO: Set up recurring credit allocation (if applicable)

    return {
      success: true,
      message: "Subscription created and activated",
    };
  } catch (error) {
    console.error("Error handling subscription_created:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle subscription cancelled webhook
 */
async function handleSubscriptionCancelled(
  payload: any
): Promise<{ success: boolean; message: string }> {
  try {
    const customData = JSON.parse(payload.passthrough || "{}");
    const organizationId = customData.organization_id;
    const cancellationEffectiveDate = payload.cancellation_effective_date
      ? new Date(payload.cancellation_effective_date)
      : new Date();

    console.log("Subscription cancelled:", {
      organizationId,
      subscriptionId: payload.subscription_id,
      cancellationDate: cancellationEffectiveDate,
    });

    // Update organization subscription status
    // Keep plan active until cancellation effective date
    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: "CANCELLED",
        subscriptionEndsAt: cancellationEffectiveDate,
      },
      include: {
        members: {
          where: { role: "OWNER" },
          include: { user: true },
        },
      },
    });

    // Send warning alert about cancellation
    await alerting.warning(
      `Subscription Cancelled: ${organization.name}`,
      `Subscription will end on ${cancellationEffectiveDate.toLocaleDateString()}`,
      {
        organizationId,
        organizationName: organization.name,
        subscriptionId: payload.subscription_id,
        plan: organization.plan,
        cancellationDate: cancellationEffectiveDate.toISOString(),
        userEmail: organization.members[0]?.user?.email,
      }
    );

    // TODO: Send cancellation confirmation email to user
    // TODO: Schedule job to downgrade to FREE plan at effective date

    return {
      success: true,
      message: "Subscription cancellation processed",
    };
  } catch (error) {
    console.error("Error handling subscription_cancelled:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle refund completed webhook
 */
async function handleRefundCompleted(
  payload: any
): Promise<{ success: boolean; message: string }> {
  try {
    const customData = JSON.parse(payload.passthrough || "{}");
    const organizationId = customData.organization_id;
    const refundAmount = parseFloat(payload.refund_amount);

    console.log("Refund completed:", {
      organizationId,
      orderId: payload.order_id,
      refundAmount,
      currency: payload.currency,
    });

    // Find the original transaction to determine credits purchased
    const originalTransaction = await prisma.creditTransaction.findFirst({
      where: {
        paddleOrderId: payload.order_id,
        type: "PURCHASE",
      },
    });

    if (!originalTransaction) {
      console.error("[Paddle] Original transaction not found for refund:", payload.order_id);
      return {
        success: false,
        message: "Original transaction not found",
      };
    }

    // Update organization credits (deduct if not used)
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          where: { role: "OWNER" },
          include: { user: true },
        },
      },
    });

    let newBalance = organization?.credits || 0;
    if (organization && organization.credits >= originalTransaction.amount) {
      const updated = await prisma.organization.update({
        where: { id: organizationId },
        data: {
          credits: { decrement: originalTransaction.amount },
        },
      });
      newBalance = updated.credits;
    }

    // Create refund transaction record
    await prisma.creditTransaction.create({
      data: {
        organizationId,
        type: "REFUND",
        amount: -originalTransaction.amount, // Negative to deduct credits
        balanceAfter: newBalance,
        paddleOrderId: payload.order_id,
        metadata: {
          refundAmount: refundAmount,
          currency: payload.currency,
          refundReason: payload.refund_reason,
        },
      },
    });

    // Send warning alert about refund
    await alerting.warning(
      `Refund Processed: ${organization?.name}`,
      `Refunded ${refundAmount} ${payload.currency} for order ${payload.order_id}`,
      {
        organizationId,
        organizationName: organization?.name,
        orderId: payload.order_id,
        refundAmount,
        currency: payload.currency,
        creditsDeducted: originalTransaction.amount,
        userEmail: organization?.members[0]?.user?.email,
      }
    );

    // TODO: Send refund confirmation email to user

    return {
      success: true,
      message: "Refund processed and credits deducted",
    };
  } catch (error) {
    console.error("Error handling refund_completed:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get organization credit balance
 */
export async function getOrganizationCredits(
  organizationId: string
): Promise<number> {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { credits: true },
    });

    if (!organization) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    return organization.credits;
  } catch (error) {
    console.error("Error getting organization credits:", error);
    return 0;
  }
}

/**
 * Deduct credits from organization (when creating assessment)
 * Uses atomic transaction to prevent race conditions
 */
export async function deductCredits(
  organizationId: string,
  amount: number,
  metadata?: {
    assessmentId?: string;
    candidateId?: string;
    description?: string;
    createdBy?: string;
  }
): Promise<{ success: boolean; remainingCredits: number }> {
  try {
    if (amount <= 0) {
      throw new Error("Credit amount must be positive");
    }

    // Deduct credits with atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get current organization state
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, credits: true },
      });

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      // Check sufficient balance
      if (organization.credits < amount) {
        throw new Error(
          `Insufficient credits. Required: ${amount}, Available: ${organization.credits}`
        );
      }

      // Calculate new balance
      const newBalance = organization.credits - amount;

      // Update organization credits
      await tx.organization.update({
        where: { id: organizationId },
        data: { credits: newBalance },
      });

      // Create transaction record
      await tx.creditTransaction.create({
        data: {
          organizationId,
          type: "DEDUCTION",
          amount: -amount, // Negative for deduction
          balanceAfter: newBalance,
          assessmentId: metadata?.assessmentId,
          candidateId: metadata?.candidateId,
          description:
            metadata?.description ||
            `Deducted ${amount} credit(s) for assessment`,
          createdBy: metadata?.createdBy,
        },
      });

      console.log(
        `[Paddle] Deducted ${amount} credits from organization ${organizationId}. New balance: ${newBalance}`
      );

      return { newBalance };
    });

    return {
      success: true,
      remainingCredits: result.newBalance,
    };
  } catch (error) {
    console.error("Error deducting credits:", error);
    throw new Error(
      `Failed to deduct credits: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get Paddle public key for client-side integration
 */
export function getPaddlePublicKey(): string {
  if (!PADDLE_PUBLIC_KEY) {
    throw new Error("PADDLE_PUBLIC_KEY environment variable is not set");
  }
  return PADDLE_PUBLIC_KEY;
}

/**
 * Get Paddle environment
 */
export function getPaddleEnvironment(): "sandbox" | "production" {
  return PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

/**
 * Initialize Paddle client-side (returns config for frontend)
 * Note: This is now async because products come from database
 */
export async function getPaddleConfig() {
  const [plans, addons] = await Promise.all([
    getPricingPlans(),
    getAddOns(),
  ]);

  // Transform plans to frontend-friendly format
  const products = plans.map((plan) => ({
    id: plan.paddleProductId,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    credits: plan.credits,
    price: Number(plan.price),
    pricePerCredit: Number(plan.pricePerCredit),
    currency: plan.currency,
    isPopular: plan.isPopular,
    badge: plan.badge,
    features: plan.features as string[],
  }));

  // Transform add-ons to frontend-friendly format
  const addOns = addons.map((addon) => ({
    slug: addon.slug,
    name: addon.name,
    description: addon.description,
    price: Number(addon.price),
    currency: addon.currency,
    icon: addon.icon,
    features: addon.features as string[],
  }));

  return {
    vendor: PADDLE_VENDOR_ID,
    environment: getPaddleEnvironment(),
    products,
    addOns,
  };
}

export const paddleService = {
  // Checkout & payments
  createCheckout,
  handleWebhook,
  verifyWebhookSignature,
  // Credits management
  getOrganizationCredits,
  deductCredits,
  // Configuration
  getPaddlePublicKey,
  getPaddleEnvironment,
  getPaddleConfig,
  // Pricing plans (database-driven)
  getPricingPlans,
  getPricingPlan,
  clearPricingPlansCache,
  getLegacyProducts,
  // Assessment add-ons (database-driven)
  getAddOns,
  getAddOn,
  clearAddOnsCache,
  calculateCheckoutTotal,
};
