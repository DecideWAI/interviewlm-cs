/**
 * Tests for GET /api/sessions/[id]
 * Session replay endpoint
 */

import { GET } from '@/app/api/sessions/[id]/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    sessionRecording: {
      findUnique: jest.fn(),
    },
    candidate: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

describe('GET /api/sessions/[id]', () => {
  const mockSessionData = {
    id: 'session-123',
    candidateId: 'cand-123',
    startTime: new Date('2025-01-01T10:00:00Z'),
    endTime: new Date('2025-01-01T11:30:00Z'),
    duration: 5400, // 90 minutes
    status: 'COMPLETED',
    eventCount: 150,
    candidate: {
      id: 'cand-123',
      name: 'John Doe',
      email: 'john@example.com',
      status: 'COMPLETED',
      overallScore: 85,
      codingScore: 90,
      communicationScore: 80,
      problemSolvingScore: 85,
      assessment: {
        title: 'Senior Backend Engineer',
        role: 'backend',
        seniority: 'SENIOR',
        duration: 7200,
      },
      generatedQuestions: [
        {
          title: 'Implement Binary Search',
          description: 'Write an efficient binary search algorithm',
          difficulty: 'MEDIUM',
          language: 'javascript',
          requirements: ['O(log n) time complexity'],
          starterCode: [{ fileName: 'solution.js', content: '// Your code here' }],
          testCases: [{ name: 'test1', input: '[1,2,3],2', expected: '1', hidden: false }],
          score: 85,
          order: 0,
        },
      ],
    },
    events: [
      {
        id: 'evt-1',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        type: 'session_start',
        category: 'lifecycle',
        data: { questionId: 'q-123' },
        checkpoint: true,
      },
      {
        id: 'evt-2',
        timestamp: new Date('2025-01-01T10:05:00Z'),
        type: 'code_edit',
        category: 'code',
        data: { fileName: 'solution.js', content: 'function test() {}' },
        checkpoint: false,
      },
    ],
    claudeInteractions: [
      {
        id: 'int-1',
        timestamp: new Date('2025-01-01T10:10:00Z'),
        role: 'user',
        content: 'How do I implement binary search?',
        model: 'claude-sonnet-4-5',
        inputTokens: 15,
        outputTokens: 200,
        latency: 1200,
        promptQuality: 4.5,
      },
    ],
    codeSnapshots: [
      {
        id: 'snap-1',
        timestamp: new Date('2025-01-01T10:15:00Z'),
        fileId: 'file-1',
        fileName: 'solution.js',
        language: 'javascript',
        contentHash: 'abc123',
        fullContent: 'function binarySearch() { return true; }',
        diffFromPrevious: null,
        linesAdded: 5,
        linesDeleted: 0,
      },
    ],
    testResults: [
      {
        id: 'test-1',
        timestamp: new Date('2025-01-01T10:20:00Z'),
        testName: 'test1',
        passed: true,
        output: 'All tests passed',
        error: null,
        duration: 45,
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Default auth mock
    ;(auth as jest.Mock).mockResolvedValue({
      user: { id: 'user-123', email: 'admin@example.com' },
    })
  })

  it('should return complete session data by session ID', async () => {
    ;(prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSessionData)
    ;(prisma.candidate.findFirst as jest.Mock).mockResolvedValue({ id: 'cand-123' })

    const response = await GET(
      new Request('http://localhost/api/sessions/session-123'),
      { params: Promise.resolve({ id: 'session-123' }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)

    // Verify session metadata
    expect(data.session).toMatchObject({
      id: 'session-123',
      candidateId: 'cand-123',
      status: 'COMPLETED',
      eventCount: 150,
    })

    // Verify candidate info
    expect(data.candidate).toMatchObject({
      name: 'John Doe',
      email: 'john@example.com',
      overallScore: 85,
    })

    // Verify assessment info
    expect(data.assessment).toMatchObject({
      title: 'Senior Backend Engineer',
      role: 'backend',
    })

    // Verify questions
    expect(data.questions).toHaveLength(1)
    expect(data.questions[0].title).toBe('Implement Binary Search')

    // Verify timeline is constructed
    expect(data.timeline).toBeInstanceOf(Array)

    // Timeline should contain events from all sources
    const eventTypes = data.timeline.map((e: any) => e.type)
    expect(eventTypes).toContain('session_start')
    expect(eventTypes).toContain('code_edit')

    // Verify timeline is sorted by timestamp
    for (let i = 1; i < data.timeline.length; i++) {
      const prev = new Date(data.timeline[i - 1].timestamp).getTime()
      const curr = new Date(data.timeline[i].timestamp).getTime()
      expect(curr).toBeGreaterThanOrEqual(prev)
    }

    // Verify metrics are calculated
    expect(data.metrics).toMatchObject({
      totalEvents: 150,
      claudeInteractions: 1,
      codeSnapshots: 1,
      testRuns: 1,
    })
  })

  it('should find session by candidate ID if not found by session ID', async () => {
    // First call returns null (no session by ID)
    // Second call returns session (found by candidateId)
    ;(prisma.sessionRecording.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockSessionData)
    ;(prisma.candidate.findFirst as jest.Mock).mockResolvedValue({ id: 'cand-123' })

    const response = await GET(
      new Request('http://localhost/api/sessions/cand-123'),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(200)

    // Should have tried both lookups
    expect(prisma.sessionRecording.findUnique).toHaveBeenCalledTimes(2)

    // First call: lookup by session ID
    expect(prisma.sessionRecording.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'cand-123' },
      })
    )

    // Second call: lookup by candidate ID
    expect(prisma.sessionRecording.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { candidateId: 'cand-123' },
      })
    )
  })

  it('should require authentication', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const response = await GET(
      new Request('http://localhost/api/sessions/session-123'),
      { params: Promise.resolve({ id: 'session-123' }) }
    )

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 if session not found', async () => {
    ;(prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(null)

    const response = await GET(
      new Request('http://localhost/api/sessions/invalid-id'),
      { params: Promise.resolve({ id: 'invalid-id' }) }
    )

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Session not found')
  })

  it('should verify user has access to session', async () => {
    ;(prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(mockSessionData)

    // User does NOT have access (not in organization)
    ;(prisma.candidate.findFirst as jest.Mock).mockResolvedValue(null)

    const response = await GET(
      new Request('http://localhost/api/sessions/session-123'),
      { params: Promise.resolve({ id: 'session-123' }) }
    )

    expect(response.status).toBe(403)
    const data = await response.json()
    expect(data.error).toBe('Forbidden')

    // Verify access check was performed
    expect(prisma.candidate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'cand-123',
          OR: expect.arrayContaining([
            { createdById: 'user-123' },
            expect.objectContaining({
              organization: expect.objectContaining({
                members: expect.objectContaining({
                  some: { userId: 'user-123' },
                }),
              }),
            }),
          ]),
        }),
      })
    )
  })

  it('should calculate correct metrics', async () => {
    const sessionWith Multi Events = {
      ...mockSessionData,
      eventCount: 500,
      claudeInteractions: [
        { ...mockSessionData.claudeInteractions[0], inputTokens: 100, outputTokens: 500, promptQuality: 4.0 },
        { ...mockSessionData.claudeInteractions[0], inputTokens: 150, outputTokens: 600, promptQuality: 5.0 },
      ],
      codeSnapshots: [mockSessionData.codeSnapshots[0], mockSessionData.codeSnapshots[0]],
      testResults: [
        { ...mockSessionData.testResults[0], passed: true },
        { ...mockSessionData.testResults[0], passed: true },
        { ...mockSessionData.testResults[0], passed: false },
      ],
    }

    ;(prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(sessionWithMultiEvents)
    ;(prisma.candidate.findFirst as jest.Mock).mockResolvedValue({ id: 'cand-123' })

    const response = await GET(
      new Request('http://localhost/api/sessions/session-123'),
      { params: Promise.resolve({ id: 'session-123' }) }
    )

    const data = await response.json()

    expect(data.metrics).toMatchObject({
      totalEvents: 500,
      claudeInteractions: 2,
      codeSnapshots: 2,
      testRuns: 3,
      totalTokens: 100 + 500 + 150 + 600, // 1350
      avgPromptQuality: 4.5, // (4.0 + 5.0) / 2
      testPassRate: 2 / 3, // 2 passed out of 3
    })
  })

  it('should handle sessions with no events gracefully', async () => {
    const emptySession = {
      ...mockSessionData,
      events: [],
      claudeInteractions: [],
      codeSnapshots: [],
      testResults: [],
      eventCount: 0,
    }

    ;(prisma.sessionRecording.findUnique as jest.Mock).mockResolvedValue(emptySession)
    ;(prisma.candidate.findFirst as jest.Mock).mockResolvedValue({ id: 'cand-123' })

    const response = await GET(
      new Request('http://localhost/api/sessions/session-123'),
      { params: Promise.resolve({ id: 'session-123' }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.timeline).toEqual([])
    expect(data.metrics).toMatchObject({
      totalEvents: 0,
      claudeInteractions: 0,
      codeSnapshots: 0,
      testRuns: 0,
      totalTokens: 0,
      avgPromptQuality: 0,
      testPassRate: 0,
    })
  })
})
