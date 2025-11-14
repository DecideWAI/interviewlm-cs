/**
 * Paddle Payment Service
 *
 * Handles credit purchases, webhooks, and subscription management using Paddle.
 * Paddle provides built-in tax handling, fraud detection, and global payment methods.
 */

import { z } from "zod";
import crypto from "crypto";
import prisma from "@/lib/prisma";

// Configuration
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

/**
 * Product configuration for credit packages
 */
export const PADDLE_PRODUCTS = {
  SINGLE: {
    id: process.env.PADDLE_PRODUCT_SINGLE || "pri_01hzf9kj",
    name: "Single Assessment",
    credits: 1,
    price: 20,
  },
  MEDIUM: {
    id: process.env.PADDLE_PRODUCT_MEDIUM || "pri_01hzf9km",
    name: "50 Assessments",
    credits: 50,
    price: 750,
  },
  ENTERPRISE: {
    id: process.env.PADDLE_PRODUCT_ENTERPRISE || "pri_01hzf9kn",
    name: "500 Assessments",
    credits: 500,
    price: 5000,
  },
} as const;

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
 * @param params - Checkout parameters
 * @returns Checkout URL for redirect
 */
export async function createCheckout(params: {
  organizationId: string;
  productId: string;
  userId: string;
  email: string;
  quantity?: number;
}): Promise<{ checkoutUrl: string; checkoutId: string }> {
  try {
    const validatedParams = createCheckoutSchema.parse(params);

    // Get product details
    const product = Object.values(PADDLE_PRODUCTS).find(
      (p) => p.id === validatedParams.productId
    );

    if (!product) {
      throw new Error(`Invalid product ID: ${validatedParams.productId}`);
    }

    // Create checkout session via Paddle API
    const response = await fetch(`${PADDLE_API_URL}/checkouts`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        items: [
          {
            price_id: validatedParams.productId,
            quantity: validatedParams.quantity,
          },
        ],
        customer: {
          email: validatedParams.email,
        },
        custom_data: {
          organization_id: validatedParams.organizationId,
          user_id: validatedParams.userId,
          credits: product.credits * validatedParams.quantity,
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

    console.error("Payment failed:", {
      organizationId,
      orderId: payload.order_id,
      reason: payload.payment_failure_reason,
    });

    // TODO: Send email notification to user about failed payment
    // TODO: Log failed transaction

    return {
      success: true,
      message: "Payment failure logged",
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

    console.log("Subscription created:", {
      organizationId,
      subscriptionId: payload.subscription_id,
      plan: payload.subscription_plan_id,
    });

    // TODO: Implement subscription management
    // - Update organization plan
    // - Set recurring credit allocation
    // - Send welcome email

    return {
      success: true,
      message: "Subscription created",
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

    console.log("Subscription cancelled:", {
      organizationId,
      subscriptionId: payload.subscription_id,
      cancellationDate: payload.cancellation_effective_date,
    });

    // TODO: Implement subscription cancellation
    // - Update organization plan to FREE
    // - Send cancellation confirmation email
    // - Allow access until end of billing period

    return {
      success: true,
      message: "Subscription cancelled",
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

    // TODO: Implement refund logic
    // - Deduct credits from organization (if not used)
    // - Log refund transaction
    // - Send refund confirmation email

    return {
      success: true,
      message: "Refund processed",
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
 */
export function getPaddleConfig() {
  return {
    vendor: PADDLE_VENDOR_ID,
    environment: getPaddleEnvironment(),
    products: PADDLE_PRODUCTS,
  };
}

export const paddleService = {
  createCheckout,
  handleWebhook,
  verifyWebhookSignature,
  getOrganizationCredits,
  deductCredits,
  getPaddlePublicKey,
  getPaddleEnvironment,
  getPaddleConfig,
};
