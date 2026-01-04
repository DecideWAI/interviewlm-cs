import { NextRequest, NextResponse } from "next/server";
import { verifyDomain } from "@/lib/services/organization";

/**
 * Domain Verification API Endpoint
 *
 * Handles GET /api/organization/verify-domain requests to verify an organization's domain.
 *
 * When an organization admin clicks the verification link in their email,
 * this handler validates the `token` query parameter and marks the domain as verified.
 * It then redirects the user either to the dashboard on success or to an error page on failure.
 *
 * @param request - The Next.js request object containing the `token` search parameter.
 * @returns A redirect response to the dashboard when verification succeeds, or to an error page when it fails or the token is missing.
 */
export async function GET(request: NextRequest) {
  const rawToken = request.nextUrl.searchParams.get("token");
  const token = rawToken?.trim();

  // Basic presence check after trimming whitespace
  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/error?error=MissingVerificationToken", request.url)
    );
  }

  // Validate token format and length to prevent malformed or abusive input
  const TOKEN_MAX_LENGTH = 512;
  const TOKEN_PATTERN = /^[A-Za-z0-9._-]+$/;

  if (token.length > TOKEN_MAX_LENGTH || !TOKEN_PATTERN.test(token)) {
    return NextResponse.redirect(
      new URL("/auth/error?error=InvalidVerificationToken", request.url)
    );
  }

  const result = await verifyDomain(token);

  if (!result.success) {
    const errorMessage = encodeURIComponent(
      result.error || "Domain verification failed"
    );
    return NextResponse.redirect(
      new URL(`/auth/error?error=${errorMessage}`, request.url)
    );
  }

  // Redirect to dashboard with success message
  return NextResponse.redirect(new URL("/dashboard?verified=true", request.url));
}
