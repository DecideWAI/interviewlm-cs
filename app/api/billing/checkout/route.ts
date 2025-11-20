import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import prisma from "@/lib/prisma";
import { createCheckout, PADDLE_PRODUCTS } from "@/lib/services/paddle";

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { productId, quantity = 1 } = await req.json();

    if (!productId) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Validate product exists
    const product = Object.values(PADDLE_PRODUCTS).find(
      (p) => p.id === productId
    );

    if (!product) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    // Get user with organization
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMember: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get user's organization (first one if they have multiple)
    const organizationMember = user.organizationMember[0];
    if (!organizationMember) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 }
      );
    }

    // Create checkout session
    const checkout = await createCheckout({
      organizationId: organizationMember.organizationId,
      productId,
      userId: user.id,
      email: user.email,
      quantity,
    });

    return NextResponse.json({
      checkoutUrl: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
    });
  } catch (error) {
    console.error("Checkout creation error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
