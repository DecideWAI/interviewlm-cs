// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill TextEncoder/TextDecoder for Node.js test environment
// Required by langsmith and other libraries
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock environment variables for tests
// NOTE: These are set here so they're available when modules are loaded
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing-only'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.AWS_S3_BUCKET = 'test-bucket'
process.env.AWS_ACCESS_KEY_ID = 'test-access-key'
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key'
process.env.AWS_REGION = 'us-east-1'

// Polyfill fetch APIs for Node.js environment
// Create minimal polyfills that work in Jest without external dependencies
// These are sufficient for NextRequest/NextResponse construction in tests

// Minimal Headers polyfill with get() method required by NextRequest
if (typeof global.Headers === 'undefined' || !global.Headers.prototype.get) {
  class MockHeaders {
    constructor(init = {}) {
      this._headers = {};
      if (init) {
        if (init instanceof MockHeaders) {
          this._headers = { ...init._headers };
        } else if (typeof init.entries === 'function') {
          for (const [key, value] of init.entries()) {
            this.set(key, value);
          }
        } else if (typeof init === 'object') {
          Object.entries(init).forEach(([key, value]) => this.set(key, value));
        }
      }
    }
    get(name) { return this._headers[name.toLowerCase()] || null; }
    set(name, value) { this._headers[name.toLowerCase()] = String(value); }
    has(name) { return name.toLowerCase() in this._headers; }
    delete(name) { delete this._headers[name.toLowerCase()]; }
    forEach(callback) { Object.entries(this._headers).forEach(([k, v]) => callback(v, k)); }
    *entries() { for (const [k, v] of Object.entries(this._headers)) yield [k, v]; }
    *keys() { for (const k of Object.keys(this._headers)) yield k; }
    *values() { for (const v of Object.values(this._headers)) yield v; }
    [Symbol.iterator]() { return this.entries(); }
  }
  global.Headers = MockHeaders;
}

// Minimal Request polyfill
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init.method || 'GET';
      this.headers = new global.Headers(init.headers);
      this._body = init.body;
      this.credentials = init.credentials || 'same-origin';
    }
    async json() { return JSON.parse(this._body); }
    async text() { return String(this._body); }
    clone() { return new Request(this.url, { method: this.method, headers: this.headers, body: this._body }); }
  };
}

// Minimal Response polyfill
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || '';
      this.headers = new global.Headers(init.headers);
      this.ok = this.status >= 200 && this.status < 300;
    }
    async json() { return typeof this._body === 'string' ? JSON.parse(this._body) : this._body; }
    async text() { return String(this._body); }
    clone() { return new Response(this._body, { status: this.status, headers: this.headers }); }
    static json(data, init) { return new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json' } }); }
  };
}

global.fetch = jest.fn()

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated',
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }) => children,
}))

// Mock next-auth server module to avoid ESM issues
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
  NextAuth: jest.fn(),
}))

// Mock next-auth providers (they use @auth/core which is ESM)
jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
}))

jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'github', name: 'GitHub', type: 'oauth' })),
}))

jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'credentials', name: 'Credentials', type: 'credentials' })),
}))

// Mock auth config to prevent provider imports
jest.mock('@/auth.config', () => ({
  __esModule: true,
  default: {
    providers: [],
    pages: {
      signIn: '/auth/signin',
    },
  },
}))

// Mock auth module
jest.mock('@/auth', () => ({
  auth: jest.fn(() => Promise.resolve(null)),
  signIn: jest.fn(),
  signOut: jest.fn(),
  handlers: { GET: jest.fn(), POST: jest.fn() },
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  })),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}))

// Mock Cloudflare Turnstile (ESM module)
jest.mock('@marsidev/react-turnstile', () => ({
  Turnstile: jest.fn().mockImplementation(({ onSuccess }) => {
    // Auto-succeed for tests
    if (onSuccess) setTimeout(() => onSuccess('test-token'), 0);
    return null;
  }),
}))

// Mock Resend email service (requires API key at load time)
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
    },
  })),
}))

// Mock our email service
jest.mock('@/lib/services/email', () => ({
  sendInvitationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendEmailVerification: jest.fn().mockResolvedValue({ success: true }),
}))

// Mock Redis rate limiting middleware (returns null to allow request through)
jest.mock('@/lib/middleware/redis-rate-limit', () => ({
  redisRegistrationRateLimit: jest.fn().mockResolvedValue(null),
  redisAuthRateLimit: jest.fn().mockResolvedValue(null),
  redisForgotPasswordRateLimit: jest.fn().mockResolvedValue(null),
  redisResetPasswordRateLimit: jest.fn().mockResolvedValue(null),
  redisResendVerificationRateLimit: jest.fn().mockResolvedValue(null),
  redisInterviewRateLimit: jest.fn().mockResolvedValue(null),
  redisApiRateLimit: jest.fn().mockResolvedValue(null),
}))

// Mock Turnstile verification middleware (returns null to allow request through)
jest.mock('@/lib/middleware/turnstile', () => ({
  authTurnstileVerifier: jest.fn().mockResolvedValue(null),
  interviewTurnstileVerifier: jest.fn().mockResolvedValue(null),
  verifyTurnstileToken: jest.fn().mockResolvedValue(true),
}))

// Mock @auth/prisma-adapter (ESM module)
jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => ({})),
}))

// Mock msgpackr (ESM module used by ioredis)
jest.mock('msgpackr', () => ({
  Packr: jest.fn(),
  Encoder: jest.fn(),
  addExtension: jest.fn(),
  pack: jest.fn(),
  encode: jest.fn(),
}))

// Mock LangSmith to avoid ESM import issues
jest.mock('langsmith', () => ({
  Client: jest.fn().mockImplementation(() => ({
    createRun: jest.fn(),
    updateRun: jest.fn(),
  })),
  wrapOpenAI: jest.fn((client) => client),
}))

jest.mock('langsmith/wrappers', () => ({
  wrapOpenAI: jest.fn((client) => client),
}))

// Mock our langsmith observability module
jest.mock('@/lib/observability/langsmith', () => ({
  isLangSmithEnabled: jest.fn(() => false),
  getLangSmithClient: jest.fn(() => null),
  createLangSmithRun: jest.fn(() => null),
  updateLangSmithRun: jest.fn(),
  wrapWithLangSmith: jest.fn((fn) => fn),
  traceLangSmithOperation: jest.fn((name, fn) => fn()),
}))

// Mock Modal service (uses Modal TypeScript SDK which requires credentials)
jest.mock('@/lib/services/modal', () => ({
  executeCode: jest.fn().mockImplementation(async (code, language, testCases) => ({
    success: true,
    testResults: testCases.map(tc => ({
      name: tc.name,
      passed: true,
      output: '',
      duration: 10,
      hidden: tc.hidden || false,
    })),
    totalTests: testCases.length,
    passedTests: testCases.length,
    failedTests: 0,
    executionTime: 100,
    stdout: '',
    stderr: '',
  })),
  createSandbox: jest.fn().mockImplementation(async (sessionId, language) => ({
    id: `sandbox-${sessionId}`,
    sessionId,
    status: 'ready',
    language: language || 'javascript',
    createdAt: new Date(),
    wsUrl: `wss://modal.com/ws/sandbox-${sessionId}`,
  })),
  destroySandbox: jest.fn().mockResolvedValue(undefined),
  getSandboxStatus: jest.fn().mockImplementation(async (sandboxId) => ({
    status: 'ready',
    uptime: 1234,
    memoryUsage: 256,
    cpuUsage: 0.5,
  })),
  runCommand: jest.fn().mockImplementation(async (sandboxId, command) => ({
    stdout: 'command output\n',
    stderr: '',
    exitCode: 0,
  })),
  testConnection: jest.fn().mockResolvedValue(true),
  listActiveSandboxes: jest.fn().mockResolvedValue([]),
  getTerminalConnectionUrl: jest.fn().mockImplementation((sessionId) => {
    if (!process.env.MODAL_TOKEN_ID) {
      throw new Error('MODAL_TOKEN_ID must be set');
    }
    const workspace = process.env.MODAL_WORKSPACE || 'default';
    return `wss://modal.com/api/v1/ws/terminal?session=${sessionId}&workspace=${workspace}&token=${process.env.MODAL_TOKEN_ID}`;
  }),
  terminateSandbox: jest.fn().mockResolvedValue(true),
  getOrCreateSandbox: jest.fn().mockResolvedValue({}),
  writeFile: jest.fn().mockResolvedValue({ success: true }),
  readFile: jest.fn().mockResolvedValue({ success: true, content: '' }),
  listFiles: jest.fn().mockResolvedValue([]),
  modalService: {
    createSandbox: jest.fn(),
    getOrCreateSandbox: jest.fn(),
    runCommand: jest.fn(),
    testConnection: jest.fn().mockResolvedValue(true),
    healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
  },
}))

// Mock Prisma Client
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assessment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    candidate: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sessionRecording: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sessionEvent: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    claudeInteraction: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    codeSnapshot: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    testResult: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    generatedQuestion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    problemSeed: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  },
}))
