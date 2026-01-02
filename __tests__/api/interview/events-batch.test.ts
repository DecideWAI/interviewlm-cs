/**
 * Batch Events API Integration Tests
 */

import { POST, GET } from '@/app/api/interview/[id]/events/batch/route';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    candidate: {
      findUnique: jest.fn(),
    },
    sessionRecording: {
      create: jest.fn(),
      update: jest.fn(),
    },
    sessionEvent: {
      createMany: jest.fn(),
    },
  },
}));

jest.mock('@/auth');

describe('POST /api/interview/[id]/events/batch', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockCandidate = {
    id: 'candidate-123',
    name: 'Test Candidate',
    email: 'candidate@example.com',
    sessionRecording: {
      id: 'session-123',
    },
  };

  const mockRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/interview/candidate-123/events/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: mockUser });
  });

  describe('Authentication', () => {
    it('should return 401 if not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValueOnce(null);

      const request = mockRequest({ events: [] });
      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Request Validation', () => {
    it('should return 400 if events array is missing', async () => {
      const request = mockRequest({});
      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Events array is required');
    });

    it('should return 400 if events array is empty', async () => {
      const request = mockRequest({ events: [] });
      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('must not be empty');
    });

    it('should return 400 if event has no type', async () => {
      const request = mockRequest({
        events: [
          { data: { test: 1 }, timestamp: new Date() },
        ],
      });

      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('valid type');
    });
  });

  describe('Candidate Lookup', () => {
    it('should return 404 if candidate not found', async () => {
      (prisma.candidate.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = mockRequest({
        events: [
          { type: 'test', data: {}, timestamp: new Date() },
        ],
      });

      const response = await POST(request, { params: { id: 'invalid-id' } });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Candidate not found');
    });
  });

  describe('Session Recording Creation', () => {
    it('should create session recording if it does not exist', async () => {
      const candidateWithoutSession = {
        ...mockCandidate,
        sessionRecording: null,
      };

      (prisma.candidate.findUnique as jest.Mock).mockResolvedValueOnce(
        candidateWithoutSession
      );
      (prisma.sessionRecording.create as jest.Mock).mockResolvedValueOnce({
        id: 'new-session-123',
      });
      (prisma.sessionEvent.createMany as jest.Mock).mockResolvedValueOnce({});
      (prisma.sessionRecording.update as jest.Mock).mockResolvedValueOnce({});

      const request = mockRequest({
        events: [
          { type: 'code_change', data: { test: 1 }, timestamp: new Date() },
        ],
      });

      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(200);
      expect(prisma.sessionRecording.create).toHaveBeenCalledWith({
        data: {
          candidateId: 'candidate-123',
          startTime: expect.any(Date),
          status: 'ACTIVE',
        },
      });
    });

    it('should use existing session recording if present', async () => {
      (prisma.candidate.findUnique as jest.Mock).mockResolvedValueOnce(mockCandidate);
      (prisma.sessionEvent.createMany as jest.Mock).mockResolvedValueOnce({});
      (prisma.sessionRecording.update as jest.Mock).mockResolvedValueOnce({});

      const request = mockRequest({
        events: [
          { type: 'test', data: {}, timestamp: new Date() },
        ],
      });

      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(200);
      expect(prisma.sessionRecording.create).not.toHaveBeenCalled();
    });
  });

  describe('Batch Event Insertion', () => {
    beforeEach(() => {
      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
      (prisma.sessionEvent.createMany as jest.Mock).mockResolvedValue({});
      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});
    });

    it('should insert multiple events in batch', async () => {
      const events = [
        { type: 'code_change', data: { file: 'test.ts' }, timestamp: new Date() },
        { type: 'test_run', data: { passed: true }, timestamp: new Date() },
        { type: 'file_open', data: { path: '/test' }, timestamp: new Date() },
      ];

      const request = mockRequest({ events });
      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(200);
      expect(prisma.sessionEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            sessionId: 'session-123',
            type: 'code_change',
            data: { file: 'test.ts' },
          }),
          expect.objectContaining({
            sessionId: 'session-123',
            type: 'test_run',
            data: { passed: true },
          }),
          expect.objectContaining({
            sessionId: 'session-123',
            type: 'file_open',
            data: { path: '/test' },
          }),
        ]),
      });
    });

    it('should handle events with optional fields', async () => {
      const events = [
        {
          type: 'code_snapshot',
          data: { content: 'test' },
          timestamp: new Date(),
          fileId: 'file-123',
          checkpoint: true,
        },
      ];

      const request = mockRequest({ events });
      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(200);
      expect(prisma.sessionEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            fileId: 'file-123',
            checkpoint: true,
          }),
        ]),
      });
    });

    it('should update event count on session recording', async () => {
      const events = [
        { type: 'test1', data: {}, timestamp: new Date() },
        { type: 'test2', data: {}, timestamp: new Date() },
        { type: 'test3', data: {}, timestamp: new Date() },
      ];

      const request = mockRequest({ events });
      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(200);
      expect(prisma.sessionRecording.update).toHaveBeenCalledWith({
        where: { id: 'session-123' },
        data: {
          eventCount: {
            increment: 3,
          },
        },
      });
    });
  });

  describe('Response Format', () => {
    beforeEach(() => {
      (prisma.candidate.findUnique as jest.Mock).mockResolvedValue(mockCandidate);
      (prisma.sessionEvent.createMany as jest.Mock).mockResolvedValue({});
      (prisma.sessionRecording.update as jest.Mock).mockResolvedValue({});
    });

    it('should return success response with event count', async () => {
      const events = [
        { type: 'test1', data: {}, timestamp: new Date() },
        { type: 'test2', data: {}, timestamp: new Date() },
      ];

      const request = mockRequest({ events });
      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        eventsRecorded: 2,
        sessionId: 'session-123',
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 500 on database error', async () => {
      (prisma.candidate.findUnique as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = mockRequest({
        events: [{ type: 'test', data: {}, timestamp: new Date() }],
      });

      const response = await POST(request, { params: { id: 'candidate-123' } });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to record events');
      expect(data.details).toBe('Database error');
    });
  });
});

describe('GET /api/interview/[id]/events/batch', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockCandidate = {
    id: 'candidate-123',
    sessionRecording: {
      id: 'session-123',
      eventCount: 150,
      startTime: new Date(),
      endTime: null,
      status: 'ACTIVE',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: mockUser });
  });

  it('should return session stats', async () => {
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValueOnce(mockCandidate);

    const request = new NextRequest(
      'http://localhost:3000/api/interview/candidate-123/events/batch'
    );

    const response = await GET(request, { params: { id: 'candidate-123' } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sessionRecording).toEqual({
      id: 'session-123',
      eventCount: 150,
      startTime: expect.any(String),
      endTime: null,
      status: 'ACTIVE',
    });
  });

  it('should return 401 if not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValueOnce(null);

    const request = new NextRequest(
      'http://localhost:3000/api/interview/candidate-123/events/batch'
    );

    const response = await GET(request, { params: { id: 'candidate-123' } });

    expect(response.status).toBe(401);
  });

  it('should return 404 if candidate not found', async () => {
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const request = new NextRequest(
      'http://localhost:3000/api/interview/candidate-123/events/batch'
    );

    const response = await GET(request, { params: { id: 'invalid-id' } });

    expect(response.status).toBe(404);
  });
});
