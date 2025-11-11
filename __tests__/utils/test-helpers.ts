import { hash } from 'bcryptjs'

/**
 * Test data factories for creating mock data
 */

export const createMockUser = (overrides = {}) => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: null,
  image: null,
  password: null,
  role: 'USER',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockUserWithPassword = async (overrides = {}) => {
  const hashedPassword = await hash('password123', 12)
  return createMockUser({
    password: hashedPassword,
    ...overrides,
  })
}

export const createMockOrganization = (overrides = {}) => ({
  id: 'org-1',
  name: 'Test Organization',
  slug: 'test-org',
  description: 'A test organization',
  image: null,
  plan: 'FREE',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockOrganizationMember = (overrides = {}) => ({
  id: 'member-1',
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'MEMBER',
  invitedAt: new Date(),
  joinedAt: new Date(),
  ...overrides,
})

export const createMockAssessment = (overrides = {}) => ({
  id: 'assessment-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  title: 'Senior Backend Engineer Assessment',
  description: 'Test description',
  role: 'Backend Engineer',
  seniority: 'SENIOR',
  duration: 60,
  status: 'PUBLISHED',
  enableCoding: true,
  enableTerminal: true,
  enableAI: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
  ...overrides,
})

export const createMockCandidate = (overrides = {}) => ({
  id: 'candidate-1',
  organizationId: 'org-1',
  assessmentId: 'assessment-1',
  createdById: 'user-1',
  name: 'Jane Candidate',
  email: 'jane@example.com',
  phone: '+1234567890',
  status: 'INVITED',
  invitedAt: new Date(),
  startedAt: null,
  completedAt: null,
  overallScore: null,
  codingScore: null,
  communicationScore: null,
  problemSolvingScore: null,
  sessionData: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockProblemSeed = (overrides = {}) => ({
  id: 'seed-1',
  organizationId: 'org-1',
  title: 'Binary Tree Traversal',
  description: 'Implement a function to traverse a binary tree',
  difficulty: 'MEDIUM',
  category: 'Data Structures',
  tags: ['trees', 'recursion'],
  starterCode: 'function traverse(root) {\n  // Your code here\n}',
  testCode: 'describe("traverse", () => {\n  it("should work", () => {});\n});',
  language: 'javascript',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

/**
 * Mock session helpers
 */
export const mockSession = (overrides = {}) => ({
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    image: null,
    role: 'USER',
    ...overrides.user,
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

export const mockAuthenticatedSession = () => mockSession()

export const mockUnauthenticatedSession = () => null

/**
 * Request helpers for API testing
 */
export const createMockRequest = (options: {
  method?: string
  body?: any
  headers?: Record<string, string>
  url?: string
} = {}) => {
  const { method = 'GET', body, headers = {}, url = '/' } = options

  return {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
    json: async () => body,
    url,
  }
}

/**
 * Database cleanup helpers (for integration tests)
 */
export const cleanupDatabase = async (prisma: any) => {
  // Delete in order to respect foreign key constraints
  await prisma.candidate.deleteMany()
  await prisma.assessmentQuestion.deleteMany()
  await prisma.assessment.deleteMany()
  await prisma.problemSeed.deleteMany()
  await prisma.organizationMember.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.verificationToken.deleteMany()
  await prisma.user.deleteMany()
}

/**
 * Wait helper for async operations
 */
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
