import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    if (!role) {
        return NextResponse.json(
            { error: "Role parameter is required" },
            { status: 400 }
        );
    }

    try {
        // For now, we'll implement a basic mapping. 
        // In a real app, this could be stored in the DB as well (Role -> Tech relationship).
        // Or we can use the 'category' to filter relevant techs.

        let categoryFilter: string[] = [];

        switch (role) {
            case "backend":
                categoryFilter = ["language", "framework", "database", "tool"];
                break;
            case "frontend":
                categoryFilter = ["language", "framework", "testing"];
                break;
            default:
                categoryFilter = ["language", "framework", "database", "tool", "testing"];
        }

        const technologies = await prisma.technology.findMany({
            where: {
                isActive: true,
                category: { in: categoryFilter },
            },
            orderBy: { name: "asc" },
        });

        return NextResponse.json(technologies);
    } catch (error) {
        console.error("Error fetching suggestions:", error);
        return NextResponse.json(
            { error: "Failed to fetch suggestions" },
            { status: 500 }
        );
    } finally {
        await prisma.$disconnect();
    }
}
