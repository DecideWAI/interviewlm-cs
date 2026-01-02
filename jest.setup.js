// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill TextEncoder/TextDecoder for Node.js test environment
// Required by langsmith and other libraries
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock environment variables for tests
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing-only'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

// Polyfill fetch APIs for Node.js environment
global.Request = class Request {}
global.Response = class Response {}
global.Headers = class Headers {}
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
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  },
}))
