/**
 * Authentication and Authorization Middleware
 *
 * Provides role-based access control for API routes.
 * Ensures candidates can only access their own interviews
 * and internal agents can only access authorized endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Role, isRouteAllowed } from '@/lib/types';
import prisma from '@/lib/prisma';

/**
 * Extended session with role information
 */
export interface AuthSession {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    role: Role;
  };
}

/**
 * Authentication error types
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Get authenticated session with role
 * Throws UnauthorizedError if not authenticated
 */
export async function getAuthSession(req: NextRequest): Promise<AuthSession> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new UnauthorizedError('Authentication required');
  }

  // Role is already attached to session by NextAuth callbacks
  const role = (session.user.role as Role) || 'candidate';

  return {
    user: {
      id: session.user.id,
      email: session.user.email || null,
      name: session.user.name || null,
      role,
    },
  };
}

/**
 * Check if user has required role(s)
 * Throws ForbiddenError if user doesn't have permission
 */
export async function checkRole(
  req: NextRequest,
  allowedRoles: Role[]
): Promise<AuthSession> {
  const session = await getAuthSession(req);

  // Admin always has access
  if (session.user.role === 'admin') {
    return session;
  }

  // Check if user's role is in allowed roles
  if (!allowedRoles.includes(session.user.role)) {
    throw new ForbiddenError(
      `Access denied. Required role: ${allowedRoles.join(' or ')}`
    );
  }

  return session;
}

/**
 * Check if user has access to a specific route
 * Uses the ROLE_PERMISSIONS configuration
 */
export async function checkRouteAccess(
  req: NextRequest
): Promise<AuthSession> {
  const session = await getAuthSession(req);
  const path = new URL(req.url).pathname;

  // Admin always has access
  if (session.user.role === 'admin') {
    return session;
  }

  // Check if role is allowed to access this route
  if (!isRouteAllowed(session.user.role, path)) {
    throw new ForbiddenError(`Access denied to ${path}`);
  }

  return session;
}

/**
 * Check if candidate owns the interview session
 * Prevents candidates from accessing other candidates' interviews
 */
export async function checkSessionOwnership(
  req: NextRequest,
  sessionId: string
): Promise<AuthSession> {
  const session = await getAuthSession(req);

  // Admin and internal agents can access any session
  if (session.user.role === 'admin' || session.user.role === 'internal') {
    return session;
  }

  // Candidates can only access their own interviews
  if (session.user.role === 'candidate') {
    const interviewSession = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { candidateId: true },
    });

    if (!interviewSession) {
      throw new ForbiddenError('Interview session not found');
    }

    if (interviewSession.candidateId !== session.user.id) {
      throw new ForbiddenError('Access denied to this interview session');
    }
  }

  return session;
}

/**
 * Verify internal API key for agent workers
 * Used by background workers to authenticate with internal endpoints
 */
export function verifyInternalApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get('x-internal-api-key');
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    throw new Error('INTERNAL_API_KEY not configured');
  }

  if (!apiKey || apiKey !== expectedKey) {
    throw new UnauthorizedError('Invalid or missing internal API key');
  }

  return true;
}

/**
 * Middleware wrapper for API routes
 * Handles authentication and authorization errors gracefully
 */
export function withAuth(
  handler: (req: NextRequest, session: AuthSession) => Promise<NextResponse>,
  options?: {
    allowedRoles?: Role[];
    requireSessionOwnership?: boolean;
  }
) {
  return async (
    req: NextRequest,
    context: { params: Promise<{ id?: string }> }
  ): Promise<NextResponse> => {
    try {
      const params = await context.params;
      let session: AuthSession;

      // Check role if specified
      if (options?.allowedRoles) {
        session = await checkRole(req, options.allowedRoles);
      } else {
        session = await getAuthSession(req);
      }

      // Check session ownership if required
      if (options?.requireSessionOwnership && params.id) {
        session = await checkSessionOwnership(req, params.id);
      }

      // Call the actual handler
      return await handler(req, session);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
      }

      // Unexpected error
      console.error('Unexpected error in withAuth:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware for internal API endpoints
 * Requires internal API key authentication
 */
export function withInternalAuth(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    context: unknown
  ): Promise<NextResponse> => {
    try {
      verifyInternalApiKey(req);
      return await handler(req);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
      }

      console.error('Unexpected error in withInternalAuth:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
