/**
 * Error Handling Utilities
 *
 * Custom error classes and error handling helpers for consistent error management.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base application error
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, "AUTHENTICATION_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Access forbidden") {
    super(message, "AUTHORIZATION_ERROR", 403);
    this.name = "AuthorizationError";
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, "CONFLICT", 409, details);
    this.name = "ConflictError";
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, "RATE_LIMIT_EXCEEDED", 429);
    this.name = "RateLimitError";
  }
}

/**
 * External service error (502)
 */
export class ServiceError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(`${service} error: ${message}`, "SERVICE_ERROR", 502, details);
    this.name = "ServiceError";
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, "DATABASE_ERROR", 500, details);
    this.name = "DatabaseError";
  }
}

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Convert various error types to AppError
 */
export function normalizeError(error: unknown): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Zod validation error
  if (error instanceof ZodError) {
    const details = error.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
    }));

    return new ValidationError("Validation failed", details);
  }

  // Prisma errors
  if (error && typeof error === "object" && "code" in error) {
    const prismaError = error as any;

    switch (prismaError.code) {
      case "P2002": // Unique constraint violation
        return new ConflictError("Resource already exists", {
          fields: prismaError.meta?.target,
        });

      case "P2025": // Record not found
        return new NotFoundError("Resource");

      case "P2003": // Foreign key constraint failed
        return new ValidationError("Invalid reference", {
          field: prismaError.meta?.field_name,
        });

      default:
        return new DatabaseError(
          `Database error: ${prismaError.message || "Unknown error"}`,
          { code: prismaError.code }
        );
    }
  }

  // Standard Error
  if (error instanceof Error) {
    return new AppError(error.message, "INTERNAL_ERROR", 500);
  }

  // Unknown error type
  return new AppError("An unexpected error occurred", "UNKNOWN_ERROR", 500);
}

/**
 * Handle error and return NextResponse
 */
export function handleAPIError(error: unknown): NextResponse {
  const normalizedError = normalizeError(error);

  // Log error
  if (normalizedError.statusCode >= 500) {
    logger.error(normalizedError.message, error as Error, {
      code: normalizedError.code,
      statusCode: normalizedError.statusCode,
    });
  } else {
    logger.warn(normalizedError.message, {
      code: normalizedError.code,
      statusCode: normalizedError.statusCode,
    });
  }

  return NextResponse.json(normalizedError.toJSON(), {
    status: normalizedError.statusCode,
  });
}

/**
 * Async error handler wrapper for API routes
 */
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R | NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleAPIError(error) as R;
    }
  };
}

/**
 * Assert condition or throw error
 */
export function assert(condition: boolean, error: AppError): asserts condition {
  if (!condition) {
    throw error;
  }
}

/**
 * Assert value is not null/undefined
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource: string,
  id?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource, id);
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) {
    // Retry on 5xx errors, but not on 4xx
    return error.statusCode >= 500;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as any).code;

    // Network errors
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
      return true;
    }
  }

  return false;
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = isRetryable,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

      logger.warn(`Retrying after error (attempt ${attempt + 1}/${maxRetries})`, {
        delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Safely execute async operation with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string = "Operation"
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new AppError(`${operationName} timed out`, "TIMEOUT", 408)),
        timeoutMs
      )
    ),
  ]);
}
