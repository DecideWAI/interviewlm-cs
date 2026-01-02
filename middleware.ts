import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security Headers and CORS Middleware
 *
 * Applies security headers to all responses and handles CORS for API routes.
 */

// Allowed origins for CORS (configure via environment variable)
const getAllowedOrigins = (): string[] => {
  const origins = process.env.ALLOWED_ORIGINS || "";
  if (!origins) {
    // Default to same-origin in production, allow all in development
    return process.env.NODE_ENV === "production" ? [] : ["*"];
  }
  return origins.split(",").map((o) => o.trim());
};

// Check if origin is allowed
const isOriginAllowed = (origin: string | null, allowedOrigins: string[]): boolean => {
  if (!origin) return true; // Same-origin requests don't have Origin header
  if (allowedOrigins.includes("*")) return true;
  return allowedOrigins.some((allowed) => {
    if (allowed.startsWith("*.")) {
      // Wildcard subdomain matching
      const domain = allowed.slice(2);
      return origin.endsWith(domain) || origin === `https://${domain}`;
    }
    return origin === allowed;
  });
};

// Security headers applied to all responses
const securityHeaders = {
  // Prevent clickjacking
  "X-Frame-Options": "DENY",
  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",
  // Control referrer information
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Disable unnecessary browser features
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  // XSS protection (for older browsers)
  "X-XSS-Protection": "1; mode=block",
};

// Content Security Policy
const getCSP = (): string => {
  const directives = [
    // Default to self
    "default-src 'self'",
    // Scripts: self, inline (for Next.js), eval (for some deps), Cloudflare Turnstile
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    // Styles: self, inline (for styled-components, Tailwind)
    "style-src 'self' 'unsafe-inline'",
    // Images: self, data URIs, HTTPS sources
    "img-src 'self' data: https: blob:",
    // Fonts: self, data URIs, Google Fonts
    "font-src 'self' data: https://fonts.gstatic.com",
    // Connect: self, Anthropic, Paddle, Sentry, Modal WebSocket, Resend
    "connect-src 'self' https://*.anthropic.com https://*.paddle.com https://*.sentry.io wss://*.modal.com https://api.resend.com https://*.ingest.sentry.io",
    // Frames: Cloudflare Turnstile, Paddle checkout
    "frame-src https://challenges.cloudflare.com https://*.paddle.com",
    // Frame ancestors: none (prevent embedding)
    "frame-ancestors 'none'",
    // Form actions: self only
    "form-action 'self'",
    // Base URI: self only
    "base-uri 'self'",
    // Object sources: none
    "object-src 'none'",
    // Upgrade insecure requests in production
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();

  // Handle CORS preflight requests
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    if (!isOriginAllowed(origin, allowedOrigins)) {
      return new NextResponse(null, { status: 403 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // 24 hours
      },
    });
  }

  // Get response
  const response = NextResponse.next();

  // Apply security headers to all responses
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Apply CSP header
  response.headers.set("Content-Security-Policy", getCSP());

  // Apply CORS headers for API routes
  if (pathname.startsWith("/api/")) {
    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }
  }

  // HTTPS redirect in production (Cloud Run handles this, but belt-and-suspenders)
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = "https";
    return NextResponse.redirect(httpsUrl, 301);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, favicon.svg, logo.svg (static files)
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|logo.svg|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
