/**
 * Security Constants
 *
 * Security configurations for the InterviewLM platform.
 * All config data now comes from the database via config-service.
 */

// Re-export async functions from config-service
// Using relative path for ts-node compatibility in seed scripts
export {
  getBlockedPatterns,
  getAllowedCommands,
  getRateLimits,
  getSessionTimeouts,
  getSecurityConfig,
} from "../services/config-service";

// =============================================================================
// DEPRECATED: Hardcoded exports (kept for seed scripts)
// These are used by prisma/seeds/config-seeds.ts to populate the database.
// Runtime code should use the async functions above.
// =============================================================================

/**
 * @deprecated Use getBlockedPatterns() from config-service instead
 */
export const BLOCKED_BASH_PATTERNS = [
  /rm\s+-rf\s+[\/~*]/i,
  /rm\s+-rf\s+\*/i,
  /:\(\)\{\s*:\|:&\s*\};:/i,
  /mkfs/i,
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /halt/i,
  /poweroff/i,
  /init\s+0/i,
  /init\s+6/i,
  /while.*do.*curl/i,
  /for.*in.*curl/i,
  /sudo/i,
  /su\s+-/i,
  /chmod\s+777/i,
  /kill\s+-9\s+1/i,
  /killall\s+-9/i,
  /\/tmp\/.*\s*&&/i,
  /curl.*\|\s*sh/i,
  /wget.*\|\s*sh/i,
  /curl.*\|\s*bash/i,
  /wget.*\|\s*bash/i,
  /xmrig/i,
  /minerd/i,
  /cpuminer/i,
  /nc\s+-e/i,
  /\/dev\/tcp/i,
  /bash\s+-i/i,
];

/**
 * @deprecated Use getAllowedCommands() from config-service instead
 */
export const ALLOWED_BASH_COMMANDS = [
  'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'sort', 'uniq',
  'cd', 'pwd',
  'npm', 'yarn', 'pnpm', 'pip', 'pip3', 'python', 'python3', 'node',
  'jest', 'pytest', 'go test', 'cargo test', 'mvn test',
  'git status', 'git diff', 'git log',
  'env', 'echo', 'printenv',
];

/**
 * @deprecated Use getSecurityConfig('workspace_restrictions') instead
 */
export const WORKSPACE_PATH_RESTRICTIONS = {
  mustStartWith: '/workspace',
  blockedPaths: ['/.env', '/.git/config', '/node_modules/.bin', '/.ssh'],
  blockedExtensions: ['.exe', '.dll', '.so', '.dylib', '.o', '.a', '.bin'],
};

/**
 * @deprecated Use getRateLimits() from config-service instead
 */
export const RATE_LIMITS = {
  aiMessagesPerMinute: 10,
  aiMessagesPerHour: 100,
  testRunsPerMinute: 5,
  testRunsPerHour: 50,
  fileWritesPerMinute: 20,
  fileWritesPerHour: 200,
};

/**
 * @deprecated Use getSessionTimeouts() from config-service instead
 */
export const SESSION_TIMEOUTS = {
  maxDurationMinutes: 120,
  inactivityMinutes: 30,
  warningBeforeTimeoutMinutes: 5,
};

// =============================================================================
// Validation Functions (use DB-backed async versions in production)
// =============================================================================

/**
 * @deprecated Use async isCommandAllowed with DB patterns instead
 */
export function isCommandAllowed(command: string): {
  allowed: boolean;
  reason?: string;
} {
  for (const pattern of BLOCKED_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return {
        allowed: false,
        reason: `Command matches blocked pattern: ${pattern.source}`,
      };
    }
  }

  const baseCommand = command.trim().split(/\s+/)[0];
  const isPackageManager = ['npm', 'yarn', 'pnpm', 'pip', 'pip3'].includes(baseCommand);
  const isAllowedCommand = ALLOWED_BASH_COMMANDS.includes(baseCommand);

  if (!isPackageManager && !isAllowedCommand) {
    return {
      allowed: false,
      reason: `Command '${baseCommand}' is not in the allowed list`,
    };
  }

  return { allowed: true };
}

/**
 * @deprecated Use async isPathAllowed with DB restrictions instead
 */
export function isPathAllowed(
  filePath: string,
  workspaceRoot: string = '/workspace'
): { allowed: boolean; reason?: string } {
  if (!filePath.startsWith('/')) {
    return { allowed: false, reason: 'File path must be absolute' };
  }

  if (!filePath.startsWith(workspaceRoot)) {
    return { allowed: false, reason: `File path must start with ${workspaceRoot}` };
  }

  for (const blocked of WORKSPACE_PATH_RESTRICTIONS.blockedPaths) {
    if (filePath.includes(blocked)) {
      return { allowed: false, reason: `File path contains blocked segment: ${blocked}` };
    }
  }

  const extension = filePath.split('.').pop()?.toLowerCase();
  if (extension && WORKSPACE_PATH_RESTRICTIONS.blockedExtensions.includes(`.${extension}`)) {
    return { allowed: false, reason: `File extension .${extension} is not allowed` };
  }

  return { allowed: true };
}

export function sanitizeOutput(output: string): string {
  return output
    .replace(/api[_-]?key[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi, 'API_KEY=***')
    .replace(/token[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi, 'TOKEN=***')
    .replace(/password[=:]\s*['"]?[^\s'"]+['"]?/gi, 'PASSWORD=***')
    .replace(/AKIA[A-Z0-9]{16}/g, 'AWS_ACCESS_KEY_ID=***')
    .replace(/aws_secret_access_key[=:]\s*['"]?[^\s'"]+['"]?/gi, 'AWS_SECRET_ACCESS_KEY=***')
    .replace(/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, '[PRIVATE_KEY_REDACTED]');
}
