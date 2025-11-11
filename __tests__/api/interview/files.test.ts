/**
 * Tests for /api/interview/[id]/files
 * File management endpoint (read and write)
 */

import { GET, POST } from '@/app/api/interview/[id]/files/route'
import { prisma } from '@/lib/prisma'
import { modal, sessions } from '@/lib/services'
import { getSession } from '@/lib/auth-helpers'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    candidate: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services', () => ({
  modal: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    getFileSystem: jest.fn(),
  },
  sessions: {
    recordEvent: jest.fn(),
    createSnapshot: jest.fn(),
  },
}))

jest.mock('@/lib/auth-helpers', () => ({
  getSession: jest.fn(),
}))

describe('GET /api/interview/[id]/files', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    })
  })

  it('should return file tree when no path provided', async () => {
    const mockCandidate = {
      id: 'cand-123',
      volumeId: 'vol-123',
    }

    const mockFileTree = [
      { name: 'solution.js', type: 'file', path: 'solution.js' },
      { name: 'README.md', type: 'file', path: 'README.md' },
      { name: 'test', type: 'directory', path: 'test' },
    ]

    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate)
    ;(modal.getFileSystem as jest.Mock).mockResolvedValue(mockFileTree)

    const response = await GET(
      new Request('http://localhost/api/interview/cand-123/files'),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.files).toEqual(mockFileTree)
    expect(data.volumeId).toBe('vol-123')
    expect(modal.getFileSystem).toHaveBeenCalledWith('cand-123', '/')
  })

  it('should return file content when path provided', async () => {
    const mockCandidate = {
      id: 'cand-123',
      volumeId: 'vol-123',
    }

    const mockFileContent = 'function solution() {\n  return 42;\n}'

    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate)
    ;(modal.readFile as jest.Mock).mockResolvedValue(mockFileContent)

    const response = await GET(
      new Request('http://localhost/api/interview/cand-123/files?path=solution.js'),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.content).toBe(mockFileContent)
    expect(data.path).toBe('solution.js')
    expect(modal.readFile).toHaveBeenCalledWith('vol-123', 'solution.js')
  })

  it('should support demo mode for file tree', async () => {
    const response = await GET(
      new Request('http://localhost/api/interview/demo/files'),
      { params: Promise.resolve({ id: 'demo' }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.files).toBeInstanceOf(Array)
    expect(data.files.length).toBeGreaterThan(0)
  })

  it('should support demo mode for file content', async () => {
    const response = await GET(
      new Request('http://localhost/api/interview/demo/files?path=solution.js'),
      { params: Promise.resolve({ id: 'demo' }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.content).toBeDefined()
    expect(data.path).toBe('solution.js')
  })

  it('should require authentication for non-demo requests', async () => {
    ;(getSession as jest.Mock).mockResolvedValue(null)

    const response = await GET(
      new Request('http://localhost/api/interview/cand-123/files'),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(401)
  })

  it('should return 400 if sandbox not initialized', async () => {
    const mockCandidate = {
      id: 'cand-123',
      volumeId: null,
    }

    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate)

    const response = await GET(
      new Request('http://localhost/api/interview/cand-123/files'),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toMatch(/not initialized/i)
  })
})

describe('POST /api/interview/[id]/files', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    })
  })

  it('should successfully write file and record events', async () => {
    const mockCandidate = {
      id: 'cand-123',
      volumeId: 'vol-123',
      sessionRecording: { id: 'session-123' },
    }

    const fileContent = 'function solution() {\n  return 42;\n}'

    ;(prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate)
    ;(modal.writeFile as jest.Mock).mockResolvedValue(undefined)
    ;(sessions.recordEvent as jest.Mock).mockResolvedValue({ id: 'event-123' })
    ;(sessions.createSnapshot as jest.Mock).mockResolvedValue({ id: 'snap-123' })

    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'solution.js',
          content: fileContent,
          language: 'javascript',
        }),
      }),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.path).toBe('solution.js')

    // Verify file was written
    expect(modal.writeFile).toHaveBeenCalledWith('vol-123', 'solution.js', fileContent)

    // Verify code_edit event was recorded
    expect(sessions.recordEvent).toHaveBeenCalledWith(
      'session-123',
      expect.objectContaining({
        type: 'code_edit',
        data: expect.objectContaining({
          fileName: 'solution.js',
          language: 'javascript',
          content: fileContent,
        }),
      })
    )

    // Verify snapshot was created (content length > 50)
    expect(sessions.createSnapshot).toHaveBeenCalled()
  })

  it('should validate required fields', async () => {
    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'solution.js',
          // Missing content
        }),
      }),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid request')
  })

  it('should require authentication', async () => {
    ;(getSession as jest.Mock).mockResolvedValue(null)

    const response = await POST(
      new Request('http://localhost/api/interview/cand-123/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'solution.js',
          content: 'test',
        }),
      }),
      { params: Promise.resolve({ id: 'cand-123' }) }
    )

    expect(response.status).toBe(401)
  })

  it('should not record events in demo mode', async () => {
    const response = await POST(
      new Request('http://localhost/api/interview/demo/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'solution.js',
          content: 'function test() {}',
        }),
      }),
      { params: Promise.resolve({ id: 'demo' }) }
    )

    expect(response.status).toBe(200)

    // Should not call actual services in demo mode
    expect(modal.writeFile).not.toHaveBeenCalled()
    expect(sessions.recordEvent).not.toHaveBeenCalled()
  })
})
