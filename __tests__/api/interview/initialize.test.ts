/**
 * Tests for POST /api/interview/[id]/initialize
 * Session initialization endpoint
 */

import { POST } from '@/app/api/interview/[id]/initialize/route'
import { prisma } from '@/lib/prisma'
import { modal, questions, sessions } from '@/lib/services'
import { getSession } from '@/lib/auth-helpers'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    candidate: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    sessionRecording: {
      create: jest.fn(),
    },
    generatedQuestion: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services', () => ({
  modal: {
    createVolume: jest.fn(),
    writeFile: jest.fn(),
    getFileSystem: jest.fn(),
  },
  questions: {
    generateQuestion: jest.fn(),
  },
  sessions: {
    recordEvent: jest.fn(),
  },
}))

jest.mock('@/lib/auth-helpers', () => ({
  getSession: jest.fn(),
}))

describe('POST /api/interview/[id]/initialize', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default auth mock
    ;(getSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123', email: 'test@example.com' },
    })
  })

  it('should successfully initialize a new session', async () => {
    const candidateId = 'cand-123'
    const mockCandidate = {
      id: candidateId,
      name: 'Test Candidate',
      email: 'candidate@example.com',
      status: 'INVITED',
      volumeId: null,
      sessionRecording: null,
      generatedQuestion: null,
      assessment: {
        id: 'assess-123',
        title: 'Backend Engineer Assessment',
        role: 'backend',
        seniority: 'SENIOR',
        techStack: ['javascript', 'node.js'],
        timeLimit: 3600,
      },
    }

    const mockQuestion = {
      id: 'q-123',
      title: 'Implement Binary Search',
      description: 'Write a function that implements binary search',
      difficulty: 'MEDIUM',
      language: 'javascript',
      starterCode: 'function binarySearch(arr, target) {\n  // Your code here\n}',
      testCases: [
        { name: 'finds element', input: '[1,2,3,4,5],3', expectedOutput: '2', hidden: false },
      ],
      hints: ['Remember arrays are 0-indexed'],
    }

    const mockVolume = { volumeId: 'vol-123' }
    const mockSession = {
      id: 'session-123',
      candidateId,
      status: 'ACTIVE',
      startTime: new Date(),
    }

    const mockFiles = [
      { name: 'solution.js', type: 'file', path: 'solution.js' },
      { name: 'README.md', type: 'file', path: 'README.md' },
    ]

    // Setup mocks
    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate)
    ;(questions.generateQuestion as jest.Mock).mockResolvedValue(mockQuestion)
    ;(prisma.generatedQuestion.create as jest.Mock).mockResolvedValue({ id: 'q-123', ...mockQuestion })
    ;(prisma.sessionRecording.create as jest.Mock).mockResolvedValue(mockSession)
    ;(modal.createVolume as jest.Mock).mockResolvedValue(mockVolume)
    ;(modal.writeFile as jest.Mock).mockResolvedValue(undefined)
    ;(modal.getFileSystem as jest.Mock).mockResolvedValue(mockFiles)
    ;(sessions.recordEvent as jest.Mock).mockResolvedValue({ id: 'event-123' })
    ;(prisma.candidate.update as jest.Mock).mockResolvedValue({ ...mockCandidate, volumeId: 'vol-123' })

    // Make request
    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/initialize', { method: 'POST' }),
      { params: Promise.resolve({ id: candidateId }) }
    )

    const data = await response.json()

    // Assertions
    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      sessionId: 'session-123',
      candidateId: 'cand-123',
      question: {
        title: 'Implement Binary Search',
        language: 'javascript',
      },
      sandbox: {
        volumeId: 'vol-123',
        status: 'ready',
      },
      files: expect.arrayContaining([
        expect.objectContaining({ name: 'solution.js' }),
      ]),
    })

    // Verify session_start event was recorded
    expect(sessions.recordEvent).toHaveBeenCalledWith(
      'session-123',
      expect.objectContaining({
        type: 'session_start',
        checkpoint: true,
      })
    )

    // Verify volume was created with starter files
    expect(modal.createVolume).toHaveBeenCalledWith(candidateId)
    expect(modal.writeFile).toHaveBeenCalledWith(
      'vol-123',
      'solution.js',
      expect.any(String)
    )
  })

  it('should return existing session if already initialized', async () => {
    const candidateId = 'cand-123'
    const existingSession = {
      id: 'session-123',
      candidateId,
      status: 'ACTIVE',
      startTime: new Date(),
    }

    const mockCandidate = {
      id: candidateId,
      volumeId: 'vol-123',
      sessionRecording: existingSession,
      generatedQuestion: {
        id: 'q-123',
        title: 'Existing Question',
        language: 'javascript',
        starterCode: 'function test() {}',
        testCases: [],
        hints: [],
      },
      assessment: { timeLimit: 3600 },
    }

    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate)
    ;(modal.getFileSystem as jest.Mock).mockResolvedValue([])

    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/initialize', { method: 'POST' }),
      { params: Promise.resolve({ id: candidateId }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.sessionId).toBe('session-123')

    // Should NOT create new session
    expect(prisma.sessionRecording.create).not.toHaveBeenCalled()

    // Should NOT generate new question
    expect(questions.generateQuestion).not.toHaveBeenCalled()
  })

  it('should require authentication', async () => {
    ;(getSession as jest.Mock).mockResolvedValue(null)

    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/initialize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 if candidate not found', async () => {
    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(null)

    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/initialize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toMatch(/not found/i)
  })

  it('should reject already completed interviews', async () => {
    const mockCandidate = {
      id: 'cand-123',
      status: 'COMPLETED',
      completedAt: new Date(),
    }

    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate)

    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/initialize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toMatch(/already completed/i)
  })
})
