/**
 * @jest-environment jsdom
 */

import { EventBatcher } from '@/lib/eventBatcher';

// Mock fetch globally
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('EventBatcher', () => {
  let batcher: EventBatcher;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorageMock.clear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  afterEach(async () => {
    if (batcher) {
      await batcher.destroy();
    }
    jest.useRealTimers();
  });

  describe('Event Batching', () => {
    it('should batch multiple events', () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'event1', data: { test: 1 } });
      batcher.add({ type: 'event2', data: { test: 2 } });
      batcher.add({ type: 'event3', data: { test: 3 } });

      expect(batcher.getQueueSize()).toBe(3);
    });

    it('should automatically flush after 5 seconds', async () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'test_event', data: { test: 1 } });

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      // Wait for async flush
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/interview/${sessionId}/events/batch`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should flush when queue reaches 50 events', async () => {
      batcher = new EventBatcher(sessionId);

      // Add 50 events
      for (let i = 0; i < 50; i++) {
        batcher.add({ type: 'test', data: { index: i } });
      }

      // Wait for async flush
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalled();
      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should include timestamps in batched events', async () => {
      batcher = new EventBatcher(sessionId);

      const now = Date.now();
      batcher.add({ type: 'test', data: { test: 1 }, timestamp: now });

      await batcher.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(new Date(now).toISOString()),
        })
      );
    });
  });

  describe('Persistence', () => {
    it('should persist queue to localStorage', () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'test', data: { test: 1 } });

      const stored = localStorage.getItem(`interview_event_queue_${sessionId}`);
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('test');
    });

    it('should load persisted events on initialization', () => {
      // Set up persisted data
      const events = [
        { id: '1', type: 'test', data: { test: 1 }, timestamp: Date.now(), retries: 0 },
      ];
      localStorage.setItem(
        `interview_event_queue_${sessionId}`,
        JSON.stringify(events)
      );

      batcher = new EventBatcher(sessionId);

      expect(batcher.getQueueSize()).toBe(1);
    });

    it('should clear localStorage after successful flush', async () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'test', data: { test: 1 } });
      await batcher.flush();

      const stored = localStorage.getItem(`interview_event_queue_${sessionId}`);
      expect(stored).toBeFalsy();
    });
  });

  describe('Error Handling', () => {
    it('should retry failed events up to 3 times', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      batcher = new EventBatcher(sessionId);
      batcher.add({ type: 'test', data: { test: 1 } });

      await batcher.flush();

      // Should re-queue with retry count
      expect(batcher.getQueueSize()).toBe(1);

      // Try again
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await batcher.flush();
      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should drop events after 3 failed retries', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      batcher = new EventBatcher(sessionId);
      batcher.add({ type: 'test', data: { test: 1 } });

      // Try flush 4 times (original + 3 retries)
      for (let i = 0; i < 4; i++) {
        await batcher.flush();
      }

      // Event should be dropped
      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should not flush if already flushing', async () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'test', data: { test: 1 } });

      // Start two flushes concurrently
      const flush1 = batcher.flush();
      const flush2 = batcher.flush();

      await Promise.all([flush1, flush2]);

      // Should only make one API call
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Manual Flush', () => {
    it('should allow manual flush', async () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'test', data: { test: 1 } });

      await batcher.flush();

      expect(global.fetch).toHaveBeenCalled();
      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should not flush if queue is empty', async () => {
      batcher = new EventBatcher(sessionId);

      await batcher.flush();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should flush remaining events on destroy', async () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'test', data: { test: 1 } });

      await batcher.destroy();

      expect(global.fetch).toHaveBeenCalled();
      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should stop timer on destroy', async () => {
      batcher = new EventBatcher(sessionId);

      await batcher.destroy();

      batcher.add({ type: 'test', data: { test: 1 } });

      // Advance time - timer should not trigger
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Should only be called once (from destroy), not from timer
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event ID Generation', () => {
    it('should generate unique IDs for events', () => {
      batcher = new EventBatcher(sessionId);

      batcher.add({ type: 'test1', data: {} });
      batcher.add({ type: 'test2', data: {} });

      const stored = localStorage.getItem(`interview_event_queue_${sessionId}`);
      const events = JSON.parse(stored!);

      expect(events[0].id).toBeTruthy();
      expect(events[1].id).toBeTruthy();
      expect(events[0].id).not.toBe(events[1].id);
    });
  });

  describe('API Request Format', () => {
    it('should send events in correct format', async () => {
      batcher = new EventBatcher(sessionId);

      const timestamp = Date.now();
      batcher.add({
        type: 'code_change',
        data: { fileName: 'test.ts', content: 'console.log()' },
        timestamp,
      });

      await batcher.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/interview/${sessionId}/events/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: [
              {
                type: 'code_change',
                data: { fileName: 'test.ts', content: 'console.log()' },
                timestamp: new Date(timestamp),
              },
            ],
          }),
        }
      );
    });
  });
});
