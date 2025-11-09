export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, favicon.svg, logo.svg (static files)
     * - public folder
     * - auth pages (signin, signup)
     * - landing page
     * - pricing page
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|favicon.svg|logo.svg|public|auth|$|pricing).*)",
  ],
};
