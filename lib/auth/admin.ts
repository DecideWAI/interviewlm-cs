/**
 * Admin Authorization Helpers
 *
 * Utilities for checking admin permissions and roles.
 */

import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth-helpers';

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/**
 * Check if the current session user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.id) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  return user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
}

/**
 * Check if user is an organization admin
 */
export async function isOrgAdmin(organizationId: string): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.id) {
    return false;
  }

  const member = await prisma.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organizationId,
    },
  });

  return member?.role === 'OWNER' || member?.role === 'ADMIN';
}

/**
 * Get user role
 */
export async function getUserRole(): Promise<UserRole | null> {
  const session = await getSession();
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  return (user?.role as UserRole) || null;
}

/**
 * Require admin access or throw
 */
export async function requireAdmin(): Promise<void> {
  const admin = await isAdmin();
  if (!admin) {
    throw new Error('Admin access required');
  }
}

/**
 * Require organization admin access or throw
 */
export async function requireOrgAdmin(organizationId: string): Promise<void> {
  const orgAdmin = await isOrgAdmin(organizationId);
  if (!orgAdmin) {
    throw new Error('Organization admin access required');
  }
}
