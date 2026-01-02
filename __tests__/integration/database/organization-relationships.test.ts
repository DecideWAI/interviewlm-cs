/**
 * Real Database Integration Tests - Organization & Relationships
 *
 * Tests complex relationships between Users, Organizations, and Members
 * using a real PostgreSQL database.
 */

import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

describe('Organization Relationships (Real Database)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    // Clean up in correct order due to foreign keys
    await prisma.candidate.deleteMany()
    await prisma.assessmentQuestion.deleteMany()
    await prisma.assessment.deleteMany()
    await prisma.problemSeed.deleteMany()
    await prisma.organizationMember.deleteMany()
    await prisma.organization.deleteMany()
    await prisma.user.deleteMany()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Clean up before each test
    await prisma.candidate.deleteMany()
    await prisma.assessmentQuestion.deleteMany()
    await prisma.assessment.deleteMany()
    await prisma.problemSeed.deleteMany()
    await prisma.organizationMember.deleteMany()
    await prisma.organization.deleteMany()
    await prisma.user.deleteMany()
  })

  describe('Organization creation and relationships', () => {
    it('should create organization with members', async () => {
      // Create users
      const owner = await prisma.user.create({
        data: {
          name: 'Owner User',
          email: 'owner@company.com',
          password: await hash('password', 12),
        },
      })

      const member = await prisma.user.create({
        data: {
          name: 'Member User',
          email: 'member@company.com',
          password: await hash('password', 12),
        },
      })

      // Create organization with members
      const org = await prisma.organization.create({
        data: {
          name: 'Acme Corp',
          slug: 'acme-corp',
          description: 'Test organization',
          members: {
            create: [
              {
                userId: owner.id,
                role: 'OWNER',
                joinedAt: new Date(),
              },
              {
                userId: member.id,
                role: 'MEMBER',
                joinedAt: new Date(),
              },
            ],
          },
        },
        include: {
          members: {
            include: {
              user: true,
            },
          },
        },
      })

      expect(org).toBeDefined()
      expect(org.name).toBe('Acme Corp')
      expect(org.members).toHaveLength(2)
      expect(org.members[0].user.email).toBe('owner@company.com')
      expect(org.members[0].role).toBe('OWNER')
    })

    it('should enforce unique slug constraint', async () => {
      await prisma.organization.create({
        data: {
          name: 'Company 1',
          slug: 'duplicate-slug',
        },
      })

      await expect(
        prisma.organization.create({
          data: {
            name: 'Company 2',
            slug: 'duplicate-slug',
          },
        })
      ).rejects.toThrow()
    })

    it('should find organization with all related data', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: await hash('password', 12),
        },
      })

      const org = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
          members: {
            create: {
              userId: user.id,
              role: 'OWNER',
              joinedAt: new Date(),
            },
          },
          assessments: {
            create: {
              title: 'Backend Assessment',
              role: 'Backend Engineer',
              seniority: 'SENIOR',
              duration: 60,
              createdById: user.id,
            },
          },
        },
      })

      // Query with all relations
      const fullOrg = await prisma.organization.findUnique({
        where: { id: org.id },
        include: {
          members: {
            include: {
              user: true,
            },
          },
          assessments: true,
        },
      })

      expect(fullOrg).toBeDefined()
      expect(fullOrg?.members).toHaveLength(1)
      expect(fullOrg?.assessments).toHaveLength(1)
      expect(fullOrg?.assessments[0].title).toBe('Backend Assessment')
    })
  })

  describe('Assessment and Candidate relationships', () => {
    let testOrg: any
    let testUser: any

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          name: 'Test User',
          email: 'testuser@example.com',
          password: await hash('password', 12),
        },
      })

      testOrg = await prisma.organization.create({
        data: {
          name: 'Test Company',
          slug: 'test-company',
          members: {
            create: {
              userId: testUser.id,
              role: 'OWNER',
              joinedAt: new Date(),
            },
          },
        },
      })
    })

    it('should create assessment with candidates', async () => {
      const assessment = await prisma.assessment.create({
        data: {
          organizationId: testOrg.id,
          createdById: testUser.id,
          title: 'Senior Full Stack Developer',
          role: 'Full Stack Developer',
          seniority: 'SENIOR',
          duration: 120,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          candidates: {
            create: [
              {
                organizationId: testOrg.id,
                createdById: testUser.id,
                name: 'Candidate 1',
                email: 'candidate1@example.com',
                status: 'INVITED',
              },
              {
                organizationId: testOrg.id,
                createdById: testUser.id,
                name: 'Candidate 2',
                email: 'candidate2@example.com',
                status: 'IN_PROGRESS',
                startedAt: new Date(),
              },
            ],
          },
        },
        include: {
          candidates: true,
        },
      })

      expect(assessment.candidates).toHaveLength(2)
      expect(assessment.candidates[0].status).toBe('INVITED')
      expect(assessment.candidates[1].status).toBe('IN_PROGRESS')
    })

    it('should update candidate scores', async () => {
      const assessment = await prisma.assessment.create({
        data: {
          organizationId: testOrg.id,
          createdById: testUser.id,
          title: 'Test Assessment',
          role: 'Developer',
          seniority: 'MID',
          duration: 60,
        },
      })

      const candidate = await prisma.candidate.create({
        data: {
          organizationId: testOrg.id,
          assessmentId: assessment.id,
          createdById: testUser.id,
          name: 'Test Candidate',
          email: 'candidate@example.com',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })

      // Update with scores
      const updated = await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          overallScore: 85.5,
          codingScore: 90.0,
          communicationScore: 80.0,
          problemSolvingScore: 87.0,
          status: 'EVALUATED',
        },
      })

      expect(updated.overallScore).toBe(85.5)
      expect(updated.codingScore).toBe(90.0)
      expect(updated.status).toBe('EVALUATED')
    })

    it('should cascade delete candidates when assessment is deleted', async () => {
      const assessment = await prisma.assessment.create({
        data: {
          organizationId: testOrg.id,
          createdById: testUser.id,
          title: 'Temp Assessment',
          role: 'Developer',
          seniority: 'JUNIOR',
          duration: 45,
          candidates: {
            create: {
              organizationId: testOrg.id,
              createdById: testUser.id,
              name: 'Temp Candidate',
              email: 'temp@example.com',
            },
          },
        },
      })

      // Verify candidate exists
      let candidates = await prisma.candidate.findMany({
        where: { assessmentId: assessment.id },
      })
      expect(candidates).toHaveLength(1)

      // Delete assessment
      await prisma.assessment.delete({
        where: { id: assessment.id },
      })

      // Verify candidates are also deleted (cascade)
      candidates = await prisma.candidate.findMany({
        where: { assessmentId: assessment.id },
      })
      expect(candidates).toHaveLength(0)
    })
  })

  describe('Problem Seeds', () => {
    let testOrg: any

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: 'seeduser@example.com',
          password: await hash('password', 12),
        },
      })

      testOrg = await prisma.organization.create({
        data: {
          name: 'Seed Company',
          slug: 'seed-company',
          members: {
            create: {
              userId: user.id,
              role: 'OWNER',
              joinedAt: new Date(),
            },
          },
        },
      })
    })

    it('should create problem seed with tags', async () => {
      const seed = await prisma.problemSeed.create({
        data: {
          organizationId: testOrg.id,
          title: 'Binary Tree Traversal',
          description: 'Implement in-order traversal',
          difficulty: 'MEDIUM',
          category: 'Data Structures',
          tags: ['trees', 'recursion', 'algorithms'],
          language: 'javascript',
          starterCode: 'function traverse(root) { }',
          testCode: 'describe("traverse", () => { })',
        },
      })

      expect(seed.title).toBe('Binary Tree Traversal')
      expect(seed.tags).toEqual(['trees', 'recursion', 'algorithms'])
      expect(seed.difficulty).toBe('MEDIUM')
    })

    it('should query seeds by difficulty', async () => {
      await prisma.problemSeed.createMany({
        data: [
          {
            organizationId: testOrg.id,
            title: 'Easy Problem',
            description: 'Easy',
            difficulty: 'EASY',
            category: 'Arrays',
            language: 'javascript',
          },
          {
            organizationId: testOrg.id,
            title: 'Hard Problem',
            description: 'Hard',
            difficulty: 'HARD',
            category: 'Graphs',
            language: 'javascript',
          },
        ],
      })

      const easyProblems = await prisma.problemSeed.findMany({
        where: {
          organizationId: testOrg.id,
          difficulty: 'EASY',
        },
      })

      expect(easyProblems).toHaveLength(1)
      expect(easyProblems[0].title).toBe('Easy Problem')
    })

    it('should search seeds by tags', async () => {
      await prisma.problemSeed.createMany({
        data: [
          {
            organizationId: testOrg.id,
            title: 'Tree Problem',
            description: 'Trees',
            difficulty: 'MEDIUM',
            category: 'Trees',
            tags: ['trees', 'recursion'],
            language: 'javascript',
          },
          {
            organizationId: testOrg.id,
            title: 'Array Problem',
            description: 'Arrays',
            difficulty: 'EASY',
            category: 'Arrays',
            tags: ['arrays', 'sorting'],
            language: 'javascript',
          },
        ],
      })

      const treeProblems = await prisma.problemSeed.findMany({
        where: {
          organizationId: testOrg.id,
          tags: {
            has: 'trees',
          },
        },
      })

      expect(treeProblems).toHaveLength(1)
      expect(treeProblems[0].title).toBe('Tree Problem')
    })
  })

  describe('Complex queries', () => {
    it('should get organization with member count and assessment stats', async () => {
      const user1 = await prisma.user.create({
        data: {
          email: 'user1@stats.com',
          password: await hash('password', 12),
        },
      })

      const user2 = await prisma.user.create({
        data: {
          email: 'user2@stats.com',
          password: await hash('password', 12),
        },
      })

      const org = await prisma.organization.create({
        data: {
          name: 'Stats Company',
          slug: 'stats-company',
          members: {
            create: [
              {
                userId: user1.id,
                role: 'OWNER',
                joinedAt: new Date(),
              },
              {
                userId: user2.id,
                role: 'MEMBER',
                joinedAt: new Date(),
              },
            ],
          },
          assessments: {
            create: [
              {
                title: 'Assessment 1',
                role: 'Developer',
                seniority: 'SENIOR',
                duration: 60,
                createdById: user1.id,
                status: 'PUBLISHED',
              },
              {
                title: 'Assessment 2',
                role: 'Designer',
                seniority: 'MID',
                duration: 45,
                createdById: user1.id,
                status: 'DRAFT',
              },
            ],
          },
        },
      })

      const stats = await prisma.organization.findUnique({
        where: { id: org.id },
        include: {
          _count: {
            select: {
              members: true,
              assessments: true,
            },
          },
          assessments: {
            where: {
              status: 'PUBLISHED',
            },
          },
        },
      })

      expect(stats?._count.members).toBe(2)
      expect(stats?._count.assessments).toBe(2)
      expect(stats?.assessments).toHaveLength(1) // Only published
    })
  })
})
