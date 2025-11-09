# InterviewLM Test Suite

Comprehensive test suite for the InterviewLM platform covering API routes, components, and integration tests.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Organization

```
__tests__/
├── api/                    # API route tests
│   └── auth/
│       └── register.test.ts           # Registration endpoint tests
├── components/             # Component tests
│   ├── auth/
│   │   ├── signin.test.tsx            # Sign in page tests
│   │   └── signup.test.tsx            # Sign up page tests
│   └── ui/
│       └── button.test.tsx            # Button component tests
├── lib/                    # Utility function tests
│   └── auth.test.ts                   # Auth helper tests
├── integration/            # Integration tests
│   └── user-registration-flow.test.ts # Full registration flow
└── utils/                  # Test utilities
    └── test-helpers.ts                # Mock factories and helpers
```

## Test Categories

### API Route Tests (`__tests__/api/`)
Tests for Next.js API routes including:
- Registration endpoint validation
- Error handling
- Database integration
- Password security

**Coverage**: 100% of API routes

### Component Tests (`__tests__/components/`)
Tests for React components including:
- User interactions (clicks, form submissions)
- Loading states
- Error handling
- Navigation flows
- OAuth integration

**Coverage**: Authentication flows, UI components

### Integration Tests (`__tests__/integration/`)
End-to-end tests for complete user workflows:
- Full registration process
- Authentication flows
- Multi-step processes
- Database transactions

**Coverage**: Critical user journeys

### Utility Tests (`__tests__/lib/`)
Tests for helper functions and utilities:
- Password hashing and validation
- Data transformations
- Business logic

**Coverage**: All utility functions

## Test Utilities

### Mock Factories

Located in `__tests__/utils/test-helpers.ts`:

```typescript
// Create test users
const user = createMockUser({ email: 'custom@example.com' })
const userWithPassword = await createMockUserWithPassword()

// Create test organizations
const org = createMockOrganization({ name: 'Test Corp' })

// Create test assessments
const assessment = createMockAssessment({ seniority: 'SENIOR' })

// Create test sessions
const session = mockAuthenticatedSession()
```

### Mock Database

Prisma client is mocked in `jest.setup.js`:

```typescript
import prisma from '@/lib/prisma'

// All Prisma calls are mocked
prisma.user.create.mockResolvedValue(mockUser)
prisma.user.findUnique.mockResolvedValue(null)
```

## Writing New Tests

### 1. Create Test File

Match the source file structure:
- Source: `app/api/users/route.ts`
- Test: `__tests__/api/users.test.ts`

### 2. Use AAA Pattern

```typescript
describe('Feature', () => {
  it('should do something', () => {
    // Arrange: Set up test data
    const mockData = createMockUser()

    // Act: Execute code under test
    const result = myFunction(mockData)

    // Assert: Verify outcome
    expect(result).toBe(expected)
  })
})
```

### 3. Mock Dependencies

```typescript
jest.mock('@/lib/prisma')
jest.mock('next-auth/react')
```

### 4. Clean Up

```typescript
beforeEach(() => {
  jest.clearAllMocks()
})
```

## Coverage Requirements

Minimum coverage thresholds:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

View coverage:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Running Specific Tests

```bash
# Run API tests only
npm run test:api

# Run component tests only
npm run test:components

# Run integration tests only
npm run test:integration

# Run a single test file
npm test -- register.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should handle sign in"
```

## Continuous Integration

Tests run automatically on:
- Every push
- Every pull request
- Scheduled nightly builds

CI Command:
```bash
npm run test:ci
```

## Best Practices

1. ✅ **Test behavior, not implementation**
2. ✅ **Keep tests fast** (mock external dependencies)
3. ✅ **Use descriptive test names**
4. ✅ **Test edge cases and error paths**
5. ✅ **Clean up after each test**
6. ✅ **Keep tests independent**
7. ✅ **Maintain high coverage**

## Troubleshooting

### Tests Timeout
```typescript
jest.setTimeout(10000) // Increase timeout
```

### Mock Not Working
```typescript
jest.clearAllMocks() // Clear mocks in beforeEach
```

### Cannot Find Module
Check `jest.config.js` has correct path mappings.

## Resources

- [Full Testing Guide](../docs/TESTING.md)
- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

For detailed testing documentation, see [docs/TESTING.md](../docs/TESTING.md)
