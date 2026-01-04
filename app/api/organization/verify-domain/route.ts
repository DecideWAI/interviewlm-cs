import { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { verifyDomain } from "@/lib/services/organization";

/**
 * Domain Verification API Endpoint
 *
 * When an organization admin clicks the verification link in their email,
 * this endpoint validates the token and marks the domain as verified.
 *
 * GET /api/organization/verify-domain?token=xxx
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return redirect("/auth/error?error=MissingVerificationToken");
  }

  const result = await verifyDomain(token);

  if (!result.success) {
    const errorMessage = encodeURIComponent(
      result.error || "Domain verification failed"
    );
    return redirect(`/auth/error?error=${errorMessage}`);
  }

  // Redirect to dashboard with success message
  return redirect("/dashboard?verified=true");
}
