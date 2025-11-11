import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Server-side helper to protect routes.
 * Call this at the top of your Server Component to ensure user is authenticated.
 *
 * @example
 * ```tsx
 * export default async function DashboardPage() {
 *   const session = await requireAuth();
 *   return <div>Welcome {session.user.email}</div>;
 * }
 * ```
 */
export async function requireAuth() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return session;
}

/**
 * Server-side helper to protect routes that require specific roles.
 *
 * @example
 * ```tsx
 * export default async function AdminPage() {
 *   const session = await requireRole(["admin", "owner"]);
 *   return <div>Admin Dashboard</div>;
 * }
 * ```
 */
export async function requireRole(allowedRoles: string[]) {
  const session = await requireAuth();

  if (!allowedRoles.includes(session.user.role)) {
    redirect("/dashboard");
  }

  return session;
}

/**
 * Server-side helper to get the current session (optional).
 * Returns null if not authenticated.
 *
 * @example
 * ```tsx
 * export default async function HomePage() {
 *   const session = await getSession();
 *   return <div>{session ? `Hello ${session.user.name}` : 'Welcome'}</div>;
 * }
 * ```
 */
export async function getSession() {
  return await auth();
}
