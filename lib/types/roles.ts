/**
 * Role-Based Access Control Types
 *
 * Defines user roles and their permissions within the InterviewLM platform.
 * Used by middleware to enforce API access control.
 */

export type Role = 'candidate' | 'internal' | 'admin';

/**
 * API route patterns mapped to allowed roles
 */
export interface RoutePermission {
  pattern: string | RegExp;
  allowedRoles: Role[];
  description: string;
}

/**
 * Role permissions configuration
 * Maps each role to allowed API route patterns
 */
export const ROLE_PERMISSIONS: Record<Role, RoutePermission[]> = {
  candidate: [
    {
      pattern: /^\/api\/interview\/[^/]+\/chat$/,
      allowedRoles: ['candidate', 'admin'],
      description: 'Send messages to Coding Agent',
    },
    {
      pattern: /^\/api\/interview\/[^/]+\/execute$/,
      allowedRoles: ['candidate', 'admin'],
      description: 'Execute code or run tests',
    },
    {
      pattern: /^\/api\/interview\/[^/]+\/submit$/,
      allowedRoles: ['candidate', 'admin'],
      description: 'Submit completed interview',
    },
    {
      pattern: /^\/api\/interview\/[^/]+\/status$/,
      allowedRoles: ['candidate', 'admin'],
      description: 'Check interview session status',
    },
    {
      pattern: /^\/api\/interview\/[^/]+\/files$/,
      allowedRoles: ['candidate', 'admin'],
      description: 'Access workspace files',
    },
  ],

  internal: [
    {
      pattern: /^\/api\/internal\/interview\/[^/]+\/session-data$/,
      allowedRoles: ['internal', 'admin'],
      description: 'Read session metrics (Interview Agent)',
    },
    {
      pattern: /^\/api\/internal\/interview\/[^/]+\/adjust-difficulty$/,
      allowedRoles: ['internal', 'admin'],
      description: 'Adjust question difficulty (Interview Agent)',
    },
    {
      pattern: /^\/api\/internal\/interview\/[^/]+\/full-recording$/,
      allowedRoles: ['internal', 'admin'],
      description: 'Access complete session recording (Evaluation Agent)',
    },
    {
      pattern: /^\/api\/internal\/evaluation\/[^/]+\/analyze$/,
      allowedRoles: ['internal', 'admin'],
      description: 'Trigger evaluation analysis',
    },
    {
      pattern: /^\/api\/internal\/evaluation\/[^/]+\/report$/,
      allowedRoles: ['internal', 'admin'],
      description: 'Generate evaluation report',
    },
  ],

  admin: [
    {
      pattern: /.*/,
      allowedRoles: ['admin'],
      description: 'Full access to all endpoints',
    },
  ],
};

/**
 * Check if a role is allowed to access a specific route
 */
export function isRouteAllowed(role: Role, path: string): boolean {
  // Admin has access to everything
  if (role === 'admin') {
    return true;
  }

  // Check role-specific permissions
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.some((perm) => {
    if (typeof perm.pattern === 'string') {
      return perm.pattern === path;
    }
    return perm.pattern.test(path);
  });
}

/**
 * Get all permissions for a specific role
 */
export function getRolePermissions(role: Role): RoutePermission[] {
  return ROLE_PERMISSIONS[role];
}
