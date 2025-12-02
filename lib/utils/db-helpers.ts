/**
 * Database Helper Utilities
 *
 * Common patterns and helpers for Prisma database operations.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "./logger";

// ============================================================================
// Transaction Helpers
// ============================================================================

/**
 * Execute operations in a transaction with automatic retry
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: {
    maxRetries?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, timeout = 30000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        timeout,
        maxWait: 5000,
      });
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (isRetryableDbError(error)) {
        logger.warn(`Transaction failed, retrying (${attempt + 1}/${maxRetries})`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }

      // Non-retryable error, throw immediately
      throw error;
    }
  }

  throw lastError;
}

/**
 * Check if database error is retryable
 */
function isRetryableDbError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as any).code;

    // Prisma error codes that are retryable
    const retryableCodes = [
      "P2034", // Transaction conflict
      "P1001", // Can't reach database
      "P1002", // Database timeout
    ];

    return retryableCodes.includes(code);
  }

  return false;
}

// ============================================================================
// Pagination Helpers
// ============================================================================

/**
 * Build Prisma pagination arguments
 */
export function buildPaginationArgs(
  page: number,
  pageSize: number
): {
  skip: number;
  take: number;
} {
  const skip = (page - 1) * pageSize;
  return { skip, take: pageSize };
}

/**
 * Get paginated results with total count
 */
export async function paginate<T, K extends Prisma.ModelName>(
  model: K,
  args: any,
  page: number,
  pageSize: number
): Promise<{
  items: T[];
  total: number;
  hasMore: boolean;
}> {
  const { skip, take } = buildPaginationArgs(page, pageSize);

  // @ts-ignore - Dynamic model access
  const [items, total] = await Promise.all([
    // @ts-ignore
    prisma[model].findMany({
      ...args,
      skip,
      take,
    }),
    // @ts-ignore
    prisma[model].count({
      where: args.where,
    }),
  ]);

  return {
    items,
    total,
    hasMore: skip + take < total,
  };
}

// ============================================================================
// Soft Delete Helpers
// ============================================================================

/**
 * Soft delete a record (set deletedAt timestamp)
 */
export async function softDelete<T extends { id: string }>(
  model: any,
  id: string
): Promise<T> {
  return model.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Add soft delete filter to query args
 */
export function excludeDeleted<T extends Record<string, any>>(
  args: T = {} as T
): T {
  return {
    ...args,
    where: {
      ...args.where,
      deletedAt: null,
    },
  } as T;
}

// ============================================================================
// Unique Slug Helpers
// ============================================================================

/**
 * Generate unique slug from title
 */
export async function generateUniqueSlug(
  model: any,
  title: string,
  excludeId?: string
): Promise<string> {
  // Convert title to slug
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Check if slug exists
  let counter = 0;
  let uniqueSlug = slug;

  while (true) {
    const existing = await model.findUnique({
      where: { slug: uniqueSlug },
      select: { id: true },
    });

    // If no existing record or existing record is the one we're updating
    if (!existing || existing.id === excludeId) {
      return uniqueSlug;
    }

    // Try with counter
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Process items in batches to avoid memory issues
 */
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);

    logger.debug(`Processed batch ${i / batchSize + 1}/${Math.ceil(items.length / batchSize)}`, {
      batchSize: batch.length,
      totalProcessed: results.length,
    });
  }

  return results;
}

/**
 * Bulk upsert with batching
 */
export async function bulkUpsert<T extends { id?: string }>(
  model: any,
  items: T[],
  options: {
    batchSize?: number;
    uniqueField?: string;
  } = {}
): Promise<number> {
  const { batchSize = 100, uniqueField = "id" } = options;

  let upsertedCount = 0;

  await processBatch(items, batchSize, async (batch) => {
    const results = await Promise.all(
      batch.map((item) =>
        model.upsert({
          where: { [uniqueField]: item[uniqueField as keyof T] },
          create: item,
          update: item,
        })
      )
    );

    upsertedCount += results.length;
    return results;
  });

  return upsertedCount;
}

// ============================================================================
// Search Helpers
// ============================================================================

/**
 * Build full-text search query for Prisma
 */
export function buildSearchQuery(
  searchTerm: string,
  fields: string[]
): Record<string, any> {
  if (!searchTerm || searchTerm.trim() === "") {
    return {};
  }

  const trimmed = searchTerm.trim();

  return {
    OR: fields.map((field) => ({
      [field]: {
        contains: trimmed,
        mode: "insensitive" as const,
      },
    })),
  };
}

/**
 * Build date range filter
 */
export function buildDateRangeFilter(
  field: string,
  startDate?: Date | string,
  endDate?: Date | string
): Record<string, any> {
  const filter: Record<string, any> = {};

  if (startDate) {
    filter.gte = typeof startDate === "string" ? new Date(startDate) : startDate;
  }

  if (endDate) {
    filter.lte = typeof endDate === "string" ? new Date(endDate) : endDate;
  }

  return Object.keys(filter).length > 0 ? { [field]: filter } : {};
}

// ============================================================================
// Connection Pool Helpers
// ============================================================================

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info("Database disconnected");
}

// ============================================================================
// Query Performance Helpers
// ============================================================================

/**
 * Log slow queries
 */
export async function withQueryLogging<T>(
  queryName: string,
  fn: () => Promise<T>,
  slowThreshold: number = 1000
): Promise<T> {
  const start = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - start;

    if (duration > slowThreshold) {
      logger.warn("Slow query detected", {
        query: queryName,
        duration,
        threshold: slowThreshold,
      });
    } else {
      logger.debug("Query executed", {
        query: queryName,
        duration,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    logger.error("Query failed", error as Error, {
      query: queryName,
      duration,
    });

    throw error;
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract model name from Prisma delegate
 */
export type ModelName = Prisma.ModelName;

/**
 * Build where clause type helper
 */
export type WhereInput<T extends ModelName> = T extends keyof typeof prisma
  ? Parameters<(typeof prisma)[T]["findMany"]>[0]["where"]
  : never;

/**
 * Build select clause type helper
 */
export type SelectInput<T extends ModelName> = T extends keyof typeof prisma
  ? Parameters<(typeof prisma)[T]["findMany"]>[0]["select"]
  : never;
