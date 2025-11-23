/**
 * Admin Authentication
 *
 * Separate auth configuration for admin portal with stricter security.
 * Only allows ADMIN and SUPER_ADMIN roles.
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter } from 'next-auth/adapters';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client (shared with main app)
const prisma = new PrismaClient();

export type AdminRole = 'ADMIN' | 'SUPER_ADMIN';

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 hours for admin
  secret: process.env.ADMIN_AUTH_SECRET || process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  providers: [
    // Credentials provider for admin login
    Credentials({
      name: 'Admin Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totp: { label: '2FA Code', type: 'text' }, // Optional TOTP
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            totpSecret: true,
          },
        });

        if (!user || !user.password) {
          return null;
        }

        // Verify admin role
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          console.warn(`[Admin Auth] Non-admin login attempt: ${user.email}`);
          return null;
        }

        // Verify password
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );

        if (!isValid) {
          await logSecurityEvent('failed_login', {
            email: credentials.email,
            reason: 'invalid_password',
          });
          return null;
        }

        // Verify TOTP if enabled
        if (user.totpSecret && !credentials.totp) {
          // TOTP required but not provided
          throw new Error('TOTP_REQUIRED');
        }

        if (user.totpSecret && credentials.totp) {
          const isValidTotp = await verifyTotp(
            user.totpSecret,
            credentials.totp as string,
          );
          if (!isValidTotp) {
            await logSecurityEvent('failed_login', {
              email: credentials.email,
              reason: 'invalid_totp',
            });
            return null;
          }
        }

        // Log successful login
        await logSecurityEvent('admin_login', {
          userId: user.id,
          email: user.email,
          role: user.role,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.adminSession = true;
      }
      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as AdminRole;
        (session as any).adminSession = token.adminSession;
      }
      return session;
    },

    async signIn({ user }) {
      // Double-check admin role
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });

      if (dbUser?.role !== 'ADMIN' && dbUser?.role !== 'SUPER_ADMIN') {
        return false;
      }

      return true;
    },
  },

  events: {
    async signIn({ user }) {
      await logSecurityEvent('session_created', {
        userId: user.id,
        email: user.email,
      });
    },

    async signOut({ token }) {
      await logSecurityEvent('session_destroyed', {
        userId: token?.sub,
      });
    },
  },
});

/**
 * Verify TOTP code
 */
async function verifyTotp(secret: string, code: string): Promise<boolean> {
  // Simple TOTP verification using jose
  // In production, use a dedicated TOTP library like otpauth
  const { createHmac } = await import('crypto');

  const time = Math.floor(Date.now() / 30000); // 30-second window

  for (const offset of [-1, 0, 1]) {
    const counter = time + offset;
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));

    const hmac = createHmac('sha1', Buffer.from(secret, 'base32'));
    hmac.update(buffer);
    const hash = hmac.digest();

    const offset2 = hash[hash.length - 1] & 0xf;
    const binary =
      ((hash[offset2] & 0x7f) << 24) |
      ((hash[offset2 + 1] & 0xff) << 16) |
      ((hash[offset2 + 2] & 0xff) << 8) |
      (hash[offset2 + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    if (otp === code) {
      return true;
    }
  }

  return false;
}

/**
 * Log security event to Redis
 */
async function logSecurityEvent(
  action: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    const event = {
      action,
      data,
      timestamp: new Date().toISOString(),
      ip: 'server', // Would be populated from request in middleware
    };

    await redis.lpush('admin_security_log', JSON.stringify(event));
    await redis.ltrim('admin_security_log', 0, 99999); // Keep last 100k events

    console.log(`[Admin Security] ${action}:`, data);

    await redis.quit();
  } catch (error) {
    console.error('[Admin Security] Failed to log event:', error);
  }
}

/**
 * Get current admin session
 */
export async function getAdminSession() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  // Verify admin role
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    return null;
  }

  return session;
}

/**
 * Require admin session or throw
 */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Error('Admin authentication required');
  }
  return session;
}

/**
 * Require super admin session or throw
 */
export async function requireSuperAdmin() {
  const session = await getAdminSession();
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    throw new Error('Super admin authentication required');
  }
  return session;
}
