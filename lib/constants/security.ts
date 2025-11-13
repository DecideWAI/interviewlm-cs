/**
 * Security Constants
 *
 * Security configurations for the InterviewLM platform.
 * Includes blocked bash commands, file path restrictions, and validation rules.
 */

/**
 * Dangerous bash commands that should always be blocked
 * These patterns prevent destructive operations and security vulnerabilities
 */
export const BLOCKED_BASH_PATTERNS = [
  // Destructive file operations
  /rm\s+-rf\s+[\/~*]/i, // rm -rf / or rm -rf ~
  /rm\s+-rf\s+\*/i, // rm -rf *
  /:\(\)\{\s*:\|:&\s*\};:/i, // Fork bomb
  /mkfs/i, // Format filesystem
  /dd\s+if=/i, // Disk operations

  // System manipulation
  /shutdown/i,
  /reboot/i,
  /halt/i,
  /poweroff/i,
  /init\s+0/i,
  /init\s+6/i,

  // Network attacks
  /while.*do.*curl/i, // DDoS loop
  /for.*in.*curl/i, // DDoS loop

  // Privilege escalation
  /sudo/i,
  /su\s+-/i,
  /chmod\s+777/i, // Overly permissive

  // Process manipulation (malicious)
  /kill\s+-9\s+1/i, // Kill init
  /killall\s+-9/i, // Kill all processes

  // Binary execution from suspicious locations
  /\/tmp\/.*\s*&&/i, // Execute from /tmp
  /curl.*\|\s*sh/i, // Pipe to shell
  /wget.*\|\s*sh/i, // Pipe to shell
  /curl.*\|\s*bash/i,
  /wget.*\|\s*bash/i,

  // Cryptocurrency mining
  /xmrig/i,
  /minerd/i,
  /cpuminer/i,

  // Reverse shells
  /nc\s+-e/i, // Netcat with execute
  /\/dev\/tcp/i, // TCP device redirection
  /bash\s+-i/i, // Interactive bash (often used in reverse shells)
];

/**
 * Allowed bash commands for workspace management
 * Candidates can only run these commands (or packages like npm, pip)
 */
export const ALLOWED_BASH_COMMANDS = [
  // File operations (safe)
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'sort',
  'uniq',

  // Directory navigation
  'cd',
  'pwd',

  // Package managers
  'npm',
  'yarn',
  'pnpm',
  'pip',
  'pip3',
  'python',
  'python3',
  'node',

  // Testing and building
  'jest',
  'pytest',
  'go test',
  'cargo test',
  'mvn test',

  // Version control (read-only)
  'git status',
  'git diff',
  'git log',

  // Environment
  'env',
  'echo',
  'printenv',
];

/**
 * File path restrictions
 * Candidates can only access files within their workspace
 */
export const WORKSPACE_PATH_RESTRICTIONS = {
  // Must start with workspace root
  mustStartWith: '/workspace',

  // Blocked paths (even within workspace)
  blockedPaths: [
    '/.env', // Environment secrets
    '/.git/config', // Git configuration
    '/node_modules/.bin', // Executable binaries
    '/.ssh', // SSH keys
  ],

  // Blocked file extensions
  blockedExtensions: [
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.o',
    '.a',
    '.bin',
  ],
};

/**
 * Rate limiting configuration
 * Prevents abuse of AI and compute resources
 */
export const RATE_LIMITS = {
  // Coding Agent chat
  aiMessagesPerMinute: 10,
  aiMessagesPerHour: 100,

  // Code execution
  testRunsPerMinute: 5,
  testRunsPerHour: 50,

  // File operations
  fileWritesPerMinute: 20,
  fileWritesPerHour: 200,
};

/**
 * Session timeout configuration
 */
export const SESSION_TIMEOUTS = {
  // Maximum interview duration
  maxDurationMinutes: 120, // 2 hours

  // Inactivity timeout
  inactivityMinutes: 30,

  // Warning before timeout
  warningBeforeTimeoutMinutes: 5,
};

/**
 * Validate bash command against security rules
 */
export function isCommandAllowed(command: string): {
  allowed: boolean;
  reason?: string;
} {
  // Check against blocked patterns
  for (const pattern of BLOCKED_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return {
        allowed: false,
        reason: `Command matches blocked pattern: ${pattern.source}`,
      };
    }
  }

  // Extract the base command (first word)
  const baseCommand = command.trim().split(/\s+/)[0];

  // Check if base command is in allowed list or is a package manager
  const isPackageManager = ['npm', 'yarn', 'pnpm', 'pip', 'pip3'].includes(
    baseCommand
  );
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
 * Validate file path against workspace restrictions
 */
export function isPathAllowed(
  filePath: string,
  workspaceRoot: string = '/workspace'
): {
  allowed: boolean;
  reason?: string;
} {
  // Must be absolute path
  if (!filePath.startsWith('/')) {
    return {
      allowed: false,
      reason: 'File path must be absolute',
    };
  }

  // Must start with workspace root
  if (!filePath.startsWith(workspaceRoot)) {
    return {
      allowed: false,
      reason: `File path must start with ${workspaceRoot}`,
    };
  }

  // Check blocked paths
  for (const blocked of WORKSPACE_PATH_RESTRICTIONS.blockedPaths) {
    if (filePath.includes(blocked)) {
      return {
        allowed: false,
        reason: `File path contains blocked segment: ${blocked}`,
      };
    }
  }

  // Check blocked extensions
  const extension = filePath.split('.').pop()?.toLowerCase();
  if (
    extension &&
    WORKSPACE_PATH_RESTRICTIONS.blockedExtensions.includes(`.${extension}`)
  ) {
    return {
      allowed: false,
      reason: `File extension .${extension} is not allowed`,
    };
  }

  return { allowed: true };
}

/**
 * Sanitize command output before showing to candidate
 * Removes sensitive information from terminal output
 */
export function sanitizeOutput(output: string): string {
  return (
    output
      // Remove potential API keys (common patterns)
      .replace(/api[_-]?key[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi, 'API_KEY=***')
      .replace(/token[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi, 'TOKEN=***')
      .replace(/password[=:]\s*['"]?[^\s'"]+['"]?/gi, 'PASSWORD=***')

      // Remove AWS credentials
      .replace(
        /AKIA[A-Z0-9]{16}/g,
        'AWS_ACCESS_KEY_ID=***'
      )
      .replace(
        /aws_secret_access_key[=:]\s*['"]?[^\s'"]+['"]?/gi,
        'AWS_SECRET_ACCESS_KEY=***'
      )

      // Remove potential private keys
      .replace(/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, '[PRIVATE_KEY_REDACTED]')
  );
}
