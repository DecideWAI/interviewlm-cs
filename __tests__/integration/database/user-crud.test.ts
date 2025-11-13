/**
 * Real Database Integration Tests - User CRUD Operations
 *
 * These tests run against an actual PostgreSQL database in Docker.
 * They test real database operations without mocks.
 *
 * Run with: npm run test:integration:docker
 */

import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

describe('User CRUD Operations (Real Database)', () => {
  beforeAll(async () => {
    // Ensure connection is established
    await prisma.$connect()
  })

  afterAll(async () => {
    // Clean up and disconnect
    await prisma.user.deleteMany()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Clean up before each test
    await prisma.user.deleteMany()
  })

  describe('CREATE operations', () => {
    it('should create a new user with hashed password', async () => {
      const hashedPassword = await hash('testPassword123', 12)

      const user = await prisma.user.create({
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          password: hashedPassword,
        },
      })

      expect(user).toBeDefined()
      expect(user.id).toBeDefined()
      expect(user.name).toBe('John Doe')
      expect(user.email).toBe('john@example.com')
      expect(user.password).toBe(hashedPassword)
      expect(user.role).toBe('USER')
      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.updatedAt).toBeInstanceOf(Date)
    })

    it('should create user without name (optional field)', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'noname@example.com',
          password: await hash('password', 12),
        },
      })

      expect(user.name).toBeNull()
      expect(user.email).toBe('noname@example.com')
    })

    it('should enforce unique email constraint', async () => {
      await prisma.user.create({
        data: {
          email: 'duplicate@example.com',
          password: await hash('password', 12),
        },
      })

      // Attempt to create duplicate
      await expect(
        prisma.user.create({
          data: {
            email: 'duplicate@example.com',
            password: await hash('password', 12),
          },
        })
      ).rejects.toThrow()
    })

    it('should create multiple users successfully', async () => {
      const users = await Promise.all([
        prisma.user.create({
          data: {
            email: 'user1@example.com',
            password: await hash('password', 12),
          },
        }),
        prisma.user.create({
          data: {
            email: 'user2@example.com',
            password: await hash('password', 12),
          },
        }),
        prisma.user.create({
          data: {
            email: 'user3@example.com',
            password: await hash('password', 12),
          },
        }),
      ])

      expect(users).toHaveLength(3)
      expect(users.every(u => u.id)).toBe(true)
    })
  })

  describe('READ operations', () => {
    beforeEach(async () => {
      // Create test data
      await prisma.user.createMany({
        data: [
          {
            name: 'Alice',
            email: 'alice@example.com',
            password: await hash('password', 12),
          },
          {
            name: 'Bob',
            email: 'bob@example.com',
            password: await hash('password', 12),
          },
          {
            name: 'Charlie',
            email: 'charlie@example.com',
            password: await hash('password', 12),
          },
        ],
      })
    })

    it('should find user by unique email', async () => {
      const user = await prisma.user.findUnique({
        where: { email: 'alice@example.com' },
      })

      expect(user).toBeDefined()
      expect(user?.name).toBe('Alice')
      expect(user?.email).toBe('alice@example.com')
    })

    it('should return null for non-existent email', async () => {
      const user = await prisma.user.findUnique({
        where: { email: 'nonexistent@example.com' },
      })

      expect(user).toBeNull()
    })

    it('should find all users', async () => {
      const users = await prisma.user.findMany()

      expect(users).toHaveLength(3)
      expect(users.map(u => u.name)).toContain('Alice')
      expect(users.map(u => u.name)).toContain('Bob')
      expect(users.map(u => u.name)).toContain('Charlie')
    })

    it('should filter users with where clause', async () => {
      const users = await prisma.user.findMany({
        where: {
          email: {
            contains: 'alice',
          },
        },
      })

      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('alice@example.com')
    })

    it('should count users', async () => {
      const count = await prisma.user.count()
      expect(count).toBe(3)
    })

    it('should paginate results', async () => {
      const firstPage = await prisma.user.findMany({
        take: 2,
        orderBy: { email: 'asc' },
      })

      const secondPage = await prisma.user.findMany({
        skip: 2,
        take: 2,
        orderBy: { email: 'asc' },
      })

      expect(firstPage).toHaveLength(2)
      expect(secondPage).toHaveLength(1)
      expect(firstPage[0].email).toBe('alice@example.com')
    })
  })

  describe('UPDATE operations', () => {
    let testUser: any

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          name: 'Original Name',
          email: 'update@example.com',
          password: await hash('password', 12),
        },
      })
    })

    it('should update user name', async () => {
      const updated = await prisma.user.update({
        where: { id: testUser.id },
        data: { name: 'Updated Name' },
      })

      expect(updated.name).toBe('Updated Name')
      expect(updated.email).toBe('update@example.com')
      expect(updated.id).toBe(testUser.id)
    })

    it('should update multiple fields', async () => {
      const updated = await prisma.user.update({
        where: { id: testUser.id },
        data: {
          name: 'New Name',
          image: 'https://example.com/image.jpg',
        },
      })

      expect(updated.name).toBe('New Name')
      expect(updated.image).toBe('https://example.com/image.jpg')
    })

    it('should update updatedAt timestamp automatically', async () => {
      const originalUpdatedAt = testUser.updatedAt

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100))

      const updated = await prisma.user.update({
        where: { id: testUser.id },
        data: { name: 'Updated' },
      })

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })

    it('should throw error when updating non-existent user', async () => {
      await expect(
        prisma.user.update({
          where: { id: 'non-existent-id' },
          data: { name: 'Updated' },
        })
      ).rejects.toThrow()
    })
  })

  describe('DELETE operations', () => {
    let testUser: any

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          email: 'delete@example.com',
          password: await hash('password', 12),
        },
      })
    })

    it('should delete user by id', async () => {
      const deleted = await prisma.user.delete({
        where: { id: testUser.id },
      })

      expect(deleted.id).toBe(testUser.id)

      // Verify deletion
      const found = await prisma.user.findUnique({
        where: { id: testUser.id },
      })
      expect(found).toBeNull()
    })

    it('should delete user by email', async () => {
      await prisma.user.delete({
        where: { email: 'delete@example.com' },
      })

      const found = await prisma.user.findUnique({
        where: { email: 'delete@example.com' },
      })
      expect(found).toBeNull()
    })

    it('should delete multiple users', async () => {
      await prisma.user.createMany({
        data: [
          { email: 'delete1@example.com', password: await hash('password', 12) },
          { email: 'delete2@example.com', password: await hash('password', 12) },
        ],
      })

      const result = await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'delete',
          },
        },
      })

      expect(result.count).toBeGreaterThanOrEqual(3)
    })

    it('should throw error when deleting non-existent user', async () => {
      await expect(
        prisma.user.delete({
          where: { id: 'non-existent-id' },
        })
      ).rejects.toThrow()
    })
  })

  describe('Transaction operations', () => {
    it('should rollback transaction on error', async () => {
      const initialCount = await prisma.user.count()

      await expect(
        prisma.$transaction(async (tx) => {
          // Create first user
          await tx.user.create({
            data: {
              email: 'transaction1@example.com',
              password: await hash('password', 12),
            },
          })

          // This should fail due to duplicate email
          await tx.user.create({
            data: {
              email: 'transaction1@example.com',
              password: await hash('password', 12),
            },
          })
        })
      ).rejects.toThrow()

      // Verify rollback - count should not have changed
      const finalCount = await prisma.user.count()
      expect(finalCount).toBe(initialCount)
    })

    it('should commit successful transaction', async () => {
      const result = await prisma.$transaction(async (tx) => {
        const user1 = await tx.user.create({
          data: {
            email: 'tx1@example.com',
            password: await hash('password', 12),
          },
        })

        const user2 = await tx.user.create({
          data: {
            email: 'tx2@example.com',
            password: await hash('password', 12),
          },
        })

        return [user1, user2]
      })

      expect(result).toHaveLength(2)

      // Verify both users exist
      const users = await prisma.user.findMany({
        where: {
          email: {
            in: ['tx1@example.com', 'tx2@example.com'],
          },
        },
      })
      expect(users).toHaveLength(2)
    })
  })
})
