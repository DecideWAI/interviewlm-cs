# Testing Guide

Comprehensive testing documentation for the InterviewLM platform.

## Table of Contents

1. [Overview](#overview)
2. [Testing Stack](#testing-stack)
3. [Running Tests](#running-tests)
4. [Test Structure](#test-structure)
5. [Writing Tests](#writing-tests)
6. [Test Coverage](#test-coverage)
7. [Continuous Integration](#continuous-integration)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The InterviewLM project uses a comprehensive testing strategy covering:

- **Unit Tests**: Individual functions and components
- **Integration Tests**: API routes and database interactions
- **Component Tests**: React components with user interactions
- **End-to-End Tests**: Complete user flows (planned)

### Testing Philosophy

- **Test Behavior, Not Implementation**: Focus on what the code does, not how it does it
- **Write Tests First When Possible**: TDD for new features
- **Maintain High Coverage**: Aim for >70% coverage across the board
- **Keep Tests Fast**: Mock external dependencies
- **Make Tests Readable**: Clear test names and arrange-act-assert pattern

---

## Testing Stack

### Core Testing Libraries

| Library | Purpose | Version |
|---------|---------|---------|
| **Jest** | Test runner and assertion library | ^30.2.0 |
| **React Testing Library** | Component testing | ^16.3.0 |
| **@testing-library/jest-dom** | DOM matchers | ^6.9.1 |
| **@testing-library/user-event** | User interaction simulation | ^14.6.1 |
| **Supertest** | HTTP assertions for API testing | ^7.1.4 |
| **MSW** | API mocking | ^2.12.1 |

### Supporting Tools

- **ts-jest**: TypeScript support for Jest
- **jest-environment-jsdom**: DOM environment for component tests

---

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test suite
npm run test:api          # API route tests only
npm run test:components   # Component tests only
npm run test:integration  # Integration tests only

# Run tests in CI environment
npm run test:ci
```

### Running Specific Tests

```bash
# Run a specific test file
npm test -- register.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should handle sign in"

# Run tests for a specific file
npm test -- signin.test.tsx

# Run tests in a directory
npm test -- __tests__/api/
```

### Watch Mode Usage

In watch mode, Jest provides interactive options:

- Press `a` to run all tests
- Press `f` to run only failed tests
- Press `p` to filter by filename
- Press `t` to filter by test name
- Press `q` to quit watch mode
- Press `Enter` to trigger a test run

---

## Test Structure

### Directory Organization

```
__tests__/
├── api/                    # API route tests
│   └── auth/
│       └── register.test.ts
├── components/             # Component tests
│   └── auth/
│       ├── signin.test.tsx
│       └── signup.test.tsx
├── lib/                    # Utility function tests
│   └── auth.test.ts
├── integration/            # Integration tests
│   └── user-registration-flow.test.ts
└── utils/                  # Test utilities and helpers
    └── test-helpers.ts
```

### Test File Naming

- Test files: `*.test.ts` or `*.test.tsx`
- Spec files: `*.spec.ts` or `*.spec.tsx` (alternative)
- Location: Co-located with source or in `__tests__/` directory

---

## Writing Tests

### Test Anatomy

All tests follow the **Arrange-Act-Assert** (AAA) pattern:

```typescript
describe('Feature Name', () => {
  it('should do something specific', () => {
    // Arrange: Set up test data and mocks
    const mockData = createMockUser()

    // Act: Execute the code being tested
    const result = functionUnderTest(mockData)

    // Assert: Verify the outcome
    expect(result).toBe(expectedValue)
  })
})
```

### API Route Testing

Example: Testing the registration endpoint

```typescript
import { POST } from '@/app/api/auth/register/route'
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

// Mock Prisma
jest.mock('@/lib/prisma')

describe('/api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully register a new user', async () => {
    // Arrange
    const mockUser = { id: '1', name: 'John', email: 'john@example.com' }
    ;(prisma.user.create as jest.Mock).mockResolvedValue(mockUser)

    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(201)
    expect(data.user).toEqual(mockUser)
  })
})
```

### Component Testing

Example: Testing authentication pages

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import SignInPage from '@/app/auth/signin/page'

jest.mock('next-auth/react')

describe('SignInPage', () => {
  it('should handle successful sign in', async () => {
    // Arrange
    const mockSignIn = signIn as jest.MockedFunction<typeof signIn>
    mockSignIn.mockResolvedValue({ error: null, ok: true } as any)

    render(<SignInPage />)

    // Act
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalled()
    })
  })
})
```

### Integration Testing

Example: Testing complete user flows

```typescript
import { createMockUser } from '@/__tests__/utils/test-helpers'
import prisma from '@/lib/prisma'

describe('User Registration Flow', () => {
  it('should complete full registration flow', async () => {
    // Arrange
    const userData = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
    }

    // Act
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    })

    // Assert
    expect(response.status).toBe(201)
    expect(prisma.user.create).toHaveBeenCalled()
  })
})
```

---

## Test Coverage

### Viewing Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# Coverage report location
open coverage/lcov-report/index.html
```

### Coverage Thresholds

Minimum coverage requirements (configured in `jest.config.js`):

```javascript
coverageThreshold: {
  global: {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70,
  },
}
```

### Coverage Categories

- **Statements**: Individual statements executed
- **Branches**: If/else branches covered
- **Functions**: Functions called
- **Lines**: Lines of code executed

### Improving Coverage

Focus on:
1. **Critical paths**: Authentication, payments, data mutations
2. **Error handling**: Edge cases and error scenarios
3. **User interactions**: Button clicks, form submissions
4. **API routes**: All endpoints should be tested

---

## Continuous Integration

### CI Configuration

Tests run automatically on:
- Push to any branch
- Pull request creation
- Pull request updates

### CI Command

```bash
npm run test:ci
```

This command:
- Runs all tests once (no watch mode)
- Generates coverage report
- Uses limited workers for stability
- Exits with error code if tests fail

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
```

---

## Best Practices

### 1. Test Naming

Use descriptive names that explain what is being tested:

✅ **Good**:
```typescript
it('should reject registration with password less than 8 characters', () => {})
it('should redirect to dashboard after successful sign in', () => {})
```

❌ **Bad**:
```typescript
it('works', () => {})
it('test1', () => {})
```

### 2. Mock External Dependencies

Always mock:
- Database calls (Prisma)
- Authentication (NextAuth)
- External APIs
- File system operations
- Network requests

```typescript
jest.mock('@/lib/prisma')
jest.mock('next-auth/react')
```

### 3. Clean Up After Tests

```typescript
afterEach(() => {
  jest.clearAllMocks()
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

### 4. Use Test Helpers

Create reusable factories in `__tests__/utils/test-helpers.ts`:

```typescript
export const createMockUser = (overrides = {}) => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  ...overrides,
})
```

### 5. Test User Behavior, Not Implementation

✅ **Good** (tests behavior):
```typescript
it('should show error message when password is incorrect', async () => {
  // Test what user sees
  expect(screen.getByText(/invalid password/i)).toBeInTheDocument()
})
```

❌ **Bad** (tests implementation):
```typescript
it('should call setState with error', () => {
  // Tests internal implementation detail
  expect(setError).toHaveBeenCalledWith('Invalid password')
})
```

### 6. Avoid Testing Third-Party Libraries

Don't test Next.js, React, or other libraries:

✅ **Good**:
```typescript
it('should redirect after sign in', () => {
  expect(mockPush).toHaveBeenCalledWith('/dashboard')
})
```

❌ **Bad**:
```typescript
it('should call useRouter', () => {
  // useRouter is a Next.js hook, don't test it
  expect(useRouter).toHaveBeenCalled()
})
```

### 7. Keep Tests Independent

Each test should run independently:

```typescript
beforeEach(() => {
  // Reset state before each test
  jest.clearAllMocks()
})
```

### 8. Test Edge Cases

Don't just test the happy path:

- Empty inputs
- Invalid data
- Network failures
- Database errors
- Concurrent requests
- Rate limiting

---

## Troubleshooting

### Common Issues

#### 1. Tests Timeout

**Problem**: Tests hang or timeout

**Solution**:
```typescript
// Increase timeout for slow tests
jest.setTimeout(10000) // 10 seconds

// Or for specific test
it('slow test', async () => {
  // test code
}, 10000)
```

#### 2. Mock Not Working

**Problem**: Mock not being applied

**Solution**:
```typescript
// Move mock to top of file
jest.mock('@/lib/prisma')

// Clear mocks between tests
beforeEach(() => {
  jest.clearAllMocks()
})
```

#### 3. "Cannot find module" Error

**Problem**: Module resolution fails

**Solution**:
```javascript
// Check jest.config.js has correct moduleNameMapper
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
}
```

#### 4. Async Tests Not Completing

**Problem**: Async tests don't wait for promises

**Solution**:
```typescript
// Use async/await
it('async test', async () => {
  await asyncFunction()
  expect(result).toBe(expected)
})

// Or use waitFor for React components
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument()
})
```

#### 5. TypeScript Errors in Tests

**Problem**: Type errors in test files

**Solution**:
```typescript
// Add proper types
const mockSignIn = signIn as jest.MockedFunction<typeof signIn>

// Or use type assertion
;(prisma.user.create as jest.Mock).mockResolvedValue(mockUser)
```

---

## Test Utilities Reference

### Available Test Helpers

Located in `__tests__/utils/test-helpers.ts`:

```typescript
// User factories
createMockUser(overrides?)
createMockUserWithPassword(overrides?)

// Organization factories
createMockOrganization(overrides?)
createMockOrganizationMember(overrides?)

// Assessment factories
createMockAssessment(overrides?)
createMockCandidate(overrides?)
createMockProblemSeed(overrides?)

// Session helpers
mockSession(overrides?)
mockAuthenticatedSession()
mockUnauthenticatedSession()

// Request helpers
createMockRequest(options)

// Database cleanup
cleanupDatabase(prisma)
```

### Example Usage

```typescript
import { createMockUser, mockSession } from '@/__tests__/utils/test-helpers'

const user = createMockUser({ email: 'custom@example.com' })
const session = mockSession({ user })
```

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Next.js Testing](https://nextjs.org/docs/testing)

---

## Contributing

When adding new features:

1. **Write tests first** (TDD approach)
2. **Ensure tests pass** before submitting PR
3. **Maintain coverage** above 70%
4. **Add integration tests** for new flows
5. **Update this documentation** if adding new patterns

---

**Happy Testing!** 🧪✨
