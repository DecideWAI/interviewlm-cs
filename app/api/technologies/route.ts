import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withErrorHandling } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { relaxedRateLimit } from "@/lib/middleware/rate-limit";
import { buildSearchQuery } from "@/lib/utils/db-helpers";

export const GET = withErrorHandling(async (request: NextRequest) => {
    // Apply relaxed rate limiting (read-only endpoint)
    const rateLimited = await relaxedRateLimit(request);
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const query = searchParams.get("query");

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

    // Fetch technologies with logging
    const technologies = await logger.time(
        'fetchTechnologies',
        () => prisma.technology.findMany({
            where,
            orderBy: { name: "asc" },
        }),
        { category, hasQuery: !!query }
    );

    logger.debug('Technologies fetched', {
        count: technologies.length,
        category,
        hasQuery: !!query,
    });

    return success(technologies);
});
