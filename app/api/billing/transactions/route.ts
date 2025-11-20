import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

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

    if (!user || !user.organizationMember[0]) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const organization = user.organizationMember[0].organization;

    // Fetch credit transactions
    const [transactions, totalCount] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: {
          organizationId: organization.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.creditTransaction.count({
        where: {
          organizationId: organization.id,
        },
      }),
    ]);

    return NextResponse.json({
      transactions,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
      currentBalance: organization.credits,
    });
  } catch (error) {
    console.error("Fetch transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
