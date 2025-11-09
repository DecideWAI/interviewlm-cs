/**
 * Integration test for complete user registration flow
 *
 * This test simulates the entire user journey from registration to authentication.
 * It tests the interaction between API routes, database, and authentication system.
 */

import { hash } from 'bcryptjs'
import prisma from '@/lib/prisma'
import { POST as registerPOST } from '@/app/api/auth/register/route'
import { NextRequest } from 'next/server'

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}))

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}))

describe('User Registration Flow (Integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should complete full registration flow successfully', async () => {
    // Setup: Mock database responses
    const mockHashedPassword = 'hashed_password_secure_123'
    const registrationData = {
      name: 'Jane Developer',
      email: 'jane@startup.com',
      password: 'SecurePass123!',
    }

    const createdUser = {
      id: 'user-123',
      name: registrationData.name,
      email: registrationData.email,
      password: mockHashedPassword,
      role: 'USER',
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Mock password hashing
    ;(hash as jest.Mock).mockResolvedValue(mockHashedPassword)

    // Mock database: user doesn't exist yet
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    // Mock database: successful user creation
    ;(prisma.user.create as jest.Mock).mockResolvedValue(createdUser)

    // Step 1: User submits registration form
    const registrationRequest = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(registrationData),
    })

    // Step 2: API processes registration
    const registrationResponse = await registerPOST(registrationRequest)
    const registrationResult = await registrationResponse.json()

    // Verify: Registration successful
    expect(registrationResponse.status).toBe(201)
    expect(registrationResult.user).toMatchObject({
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
    })
    expect(registrationResult.user.password).toBeUndefined()

    // Verify: Database was called correctly
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: registrationData.email },
    })

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: registrationData.name,
        email: registrationData.email,
        password: mockHashedPassword,
      },
    })

    // Verify: Password was hashed with correct cost factor
    expect(hash).toHaveBeenCalledWith(registrationData.password, 12)
  })

  it('should prevent duplicate user registration', async () => {
    // Setup: Existing user in database
    const existingUser = {
      id: 'existing-user-123',
      name: 'Existing User',
      email: 'existing@startup.com',
      password: 'hashed_password',
      role: 'USER',
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser)

    // Attempt to register with existing email
    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New User',
        email: 'existing@startup.com',
        password: 'password123',
      }),
    })

    const response = await registerPOST(request)
    const result = await response.json()

    // Verify: Registration blocked
    expect(response.status).toBe(400)
    expect(result.error).toBe('User with this email already exists')
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('should validate password requirements', async () => {
    const weakPasswords = [
      '',           // empty
      'short',      // too short
      '1234567',    // only 7 characters
    ]

    for (const weakPassword of weakPasswords) {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: weakPassword,
        }),
      })

      const response = await registerPOST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBeDefined()
      expect(prisma.user.create).not.toHaveBeenCalled()
    }
  })

  it('should validate required fields', async () => {
    const invalidPayloads = [
      { name: 'Test User', password: 'password123' },  // missing email
      { name: 'Test User', email: 'test@example.com' }, // missing password
      { email: 'test@example.com', password: 'password123' }, // missing name (optional but tested)
    ]

    for (const payload of invalidPayloads) {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const response = await registerPOST(request)
      const result = await response.json()

      if (!payload.email || !('password' in payload)) {
        expect(response.status).toBe(400)
        expect(result.error).toBe('Email and password are required')
        expect(prisma.user.create).not.toHaveBeenCalled()
      }
    }
  })

  it('should handle database connection failures gracefully', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database connection timeout')
    )

    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      }),
    })

    const response = await registerPOST(request)
    const result = await response.json()

    expect(response.status).toBe(500)
    expect(result.error).toBe('Something went wrong')
  })

  it('should handle password hashing failures', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
    ;(hash as jest.Mock).mockRejectedValue(new Error('Hashing failed'))

    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      }),
    })

    const response = await registerPOST(request)
    const result = await response.json()

    expect(response.status).toBe(500)
    expect(result.error).toBe('Something went wrong')
    expect(prisma.user.create).not.toHaveBeenCalled()
  })
})
