import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const query = searchParams.get("query");

    try {
        const where: any = {
            isActive: true,
        };

        if (category) {
            where.category = category;
        }

        if (query) {
            where.OR = [
                { name: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
                { slug: { contains: query, mode: "insensitive" } },
            ];
        }

        const technologies = await prisma.technology.findMany({
            where,
            orderBy: { name: "asc" },
        });

        return NextResponse.json(technologies);
    } catch (error) {
        console.error("Error fetching technologies:", error);
        return NextResponse.json(
            { error: "Failed to fetch technologies" },
            { status: 500 }
        );
    } finally {
        await prisma.$disconnect();
    }
}
