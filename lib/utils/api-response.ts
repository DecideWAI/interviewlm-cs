/**
 * API Response Utilities
 *
 * Standardized response formats for consistent API contracts.
 */

import { NextResponse } from "next/server";

// ============================================================================
// Types
// ============================================================================

/**
 * Standard success response
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: any;
  };
  meta?: ResponseMeta;
}

/**
 * Response metadata
 */
export interface ResponseMeta {
  timestamp?: string;
  requestId?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  hasMore?: boolean;
}

/**
 * Paginated response data
 */
export interface PaginatedData<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Success Responses
// ============================================================================

/**
 * Create standard success response
 */
export function success<T>(data: T, meta?: ResponseMeta): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    },
    { status: 200 }
  );
}

/**
 * Create created (201) response
 */
export function created<T>(data: T, meta?: ResponseMeta): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    },
    { status: 201 }
  );
}

/**
 * Create no content (204) response
 */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Create paginated response
 */
export function paginated<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
  meta?: Omit<ResponseMeta, "page" | "pageSize" | "total" | "hasMore">
): NextResponse<SuccessResponse<PaginatedData<T>>> {
  const hasMore = page * pageSize < total;

  return NextResponse.json(
    {
      success: true,
      data: {
        items,
        page,
        pageSize,
        total,
        hasMore,
      },
      meta: {
        timestamp: new Date().toISOString(),
        page,
        pageSize,
        total,
        hasMore,
        ...meta,
      },
    },
    { status: 200 }
  );
}

// ============================================================================
// Error Responses
// ============================================================================

/**
 * Create standard error response
 */
export function error(
  message: string,
  code: string,
  status: number = 500,
  details?: any,
  meta?: ResponseMeta
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        code,
        ...(details && { details }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    },
    { status }
  );
}

/**
 * Create bad request (400) response
 */
export function badRequest(
  message: string = "Bad request",
  details?: any
): NextResponse<ErrorResponse> {
  return error(message, "BAD_REQUEST", 400, details);
}

/**
 * Create unauthorized (401) response
 */
export function unauthorized(
  message: string = "Unauthorized"
): NextResponse<ErrorResponse> {
  return error(message, "UNAUTHORIZED", 401);
}

/**
 * Create forbidden (403) response
 */
export function forbidden(
  message: string = "Forbidden"
): NextResponse<ErrorResponse> {
  return error(message, "FORBIDDEN", 403);
}

/**
 * Create not found (404) response
 */
export function notFound(
  resource: string = "Resource"
): NextResponse<ErrorResponse> {
  return error(`${resource} not found`, "NOT_FOUND", 404);
}

/**
 * Create conflict (409) response
 */
export function conflict(
  message: string = "Resource already exists",
  details?: any
): NextResponse<ErrorResponse> {
  return error(message, "CONFLICT", 409, details);
}

/**
 * Create rate limit (429) response
 */
export function rateLimit(
  message: string = "Too many requests",
  retryAfter?: number
): NextResponse<ErrorResponse> {
  const response = error(message, "RATE_LIMIT_EXCEEDED", 429);

  if (retryAfter) {
    response.headers.set("Retry-After", retryAfter.toString());
  }

  return response;
}

/**
 * Create internal server error (500) response
 */
export function serverError(
  message: string = "Internal server error"
): NextResponse<ErrorResponse> {
  return error(message, "INTERNAL_ERROR", 500);
}

/**
 * Create service unavailable (503) response
 */
export function serviceUnavailable(
  service: string = "Service"
): NextResponse<ErrorResponse> {
  return error(`${service} is temporarily unavailable`, "SERVICE_UNAVAILABLE", 503);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse pagination parameters from request
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaults: { page?: number; pageSize?: number } = {}
): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(searchParams.get("page") || String(defaults.page || 1)));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || String(defaults.pageSize || 20)))
  );
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip };
}

/**
 * Parse sort parameters from request
 */
export function parseSort(
  searchParams: URLSearchParams,
  allowedFields: string[],
  defaultField: string = "createdAt"
): { field: string; direction: "asc" | "desc" } {
  const sortParam = searchParams.get("sort") || defaultField;
  const direction = sortParam.startsWith("-") ? "desc" : "asc";
  const field = sortParam.replace(/^-/, "");

  // Validate field is allowed
  if (!allowedFields.includes(field)) {
    return { field: defaultField, direction: "desc" };
  }

  return { field, direction };
}

/**
 * Parse filter parameters from request
 */
export function parseFilters<T extends Record<string, any>>(
  searchParams: URLSearchParams,
  schema: Record<keyof T, (value: string) => any>
): Partial<T> {
  const filters: Partial<T> = {};

  for (const [key, parser] of Object.entries(schema)) {
    const value = searchParams.get(key);
    if (value !== null) {
      try {
        filters[key as keyof T] = parser(value);
      } catch {
        // Skip invalid filter values
      }
    }
  }

  return filters;
}

/**
 * Add CORS headers to response
 */
export function withCORS(
  response: NextResponse,
  options: {
    origin?: string;
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
  } = {}
): NextResponse {
  const {
    origin = "*",
    methods = ["GET", "POST", "PUT", "DELETE", "PATCH"],
    headers = ["Content-Type", "Authorization"],
    credentials = false,
  } = options;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", methods.join(", "));
  response.headers.set("Access-Control-Allow-Headers", headers.join(", "));

  if (credentials) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

/**
 * Add cache control headers to response
 */
export function withCache(
  response: NextResponse,
  options: {
    maxAge?: number;
    sMaxAge?: number;
    staleWhileRevalidate?: number;
    public?: boolean;
  } = {}
): NextResponse {
  const {
    maxAge = 0,
    sMaxAge,
    staleWhileRevalidate,
    public: isPublic = true,
  } = options;

  const directives: string[] = [];

  if (isPublic) {
    directives.push("public");
  } else {
    directives.push("private");
  }

  directives.push(`max-age=${maxAge}`);

  if (sMaxAge !== undefined) {
    directives.push(`s-maxage=${sMaxAge}`);
  }

  if (staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
  }

  response.headers.set("Cache-Control", directives.join(", "));

  return response;
}

/**
 * Create streaming response for large data
 */
export function stream(
  readable: ReadableStream,
  options: {
    contentType?: string;
    filename?: string;
  } = {}
): Response {
  const headers: HeadersInit = {
    "Content-Type": options.contentType || "application/octet-stream",
  };

  if (options.filename) {
    headers["Content-Disposition"] = `attachment; filename="${options.filename}"`;
  }

  return new Response(readable, { headers });
}
