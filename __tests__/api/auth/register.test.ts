/**
 * @jest-environment node
 */

import { POST } from '@/app/api/auth/register/route'
import prisma from '@/lib/prisma'
import { hash } from 'bcryptjs'
import { NextRequest } from 'next/server'

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue(null), // No existing org with same slug
    },
    verificationToken: {
      create: jest.fn().mockResolvedValue({ identifier: 'test@test.com', token: 'token', expires: new Date() }),
    },
  },
}))

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}))

describe('/api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST', () => {
    it('should successfully register a new user', async () => {
      const mockHashedPassword = 'hashed_password_123'
      const mockUser = {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        password: mockHashedPassword,
        role: 'USER',
        emailVerified: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Mock implementations
      ;(hash as jest.Mock).mockResolvedValue(mockHashedPassword)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.user.create as jest.Mock).mockResolvedValue(mockUser)

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.user).toEqual({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
      })
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      })
      expect(hash).toHaveBeenCalledWith('password123', 12)
      expect(prisma.user.create).toHaveBeenCalled()
    })

    it('should reject registration with missing email', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'John Doe',
          password: 'password123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Email and password are required')
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('should reject registration with missing password', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Email and password are required')
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('should reject registration with password less than 8 characters', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'short',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Password must be at least 8 characters')
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('should reject registration if user already exists', async () => {
      const existingUser = {
        id: 'existing-user',
        email: 'existing@example.com',
        name: 'Existing User',
        password: 'hashed_password',
        role: 'USER',
        emailVerified: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser)

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'John Doe',
          email: 'existing@example.com',
          password: 'password123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('User with this email already exists')
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Something went wrong')
    })

    it('should not include password in response', async () => {
      const mockHashedPassword = 'hashed_password_123'
      const mockUser = {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        password: mockHashedPassword,
        role: 'USER',
        emailVerified: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(hash as jest.Mock).mockResolvedValue(mockHashedPassword)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.user.create as jest.Mock).mockResolvedValue(mockUser)

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.user.password).toBeUndefined()
      expect(data.user).not.toHaveProperty('password')
    })
  })
})
