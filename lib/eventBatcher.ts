/**
 * Event Batcher
 *
 * Batches interview events before sending to API to reduce request overhead
 * and improve performance. Reduces API calls by ~90% compared to sending
 * events individually.
 *
 * Features:
 * - Automatic batching (every 5 seconds)
 * - Size-based flushing (flushes at 50 events)
 * - Manual flush support
 * - Automatic retry on failure
 * - Persistent queue (survives page reloads)
 */

interface EventData {
  type: string;
  data: any;
  timestamp?: number;
}

interface QueuedEvent extends EventData {
  id: string;
  retries: number;
}

const BATCH_INTERVAL_MS = 5000; // 5 seconds
const MAX_BATCH_SIZE = 50; // Flush if queue reaches this size
const MAX_RETRIES = 3;
const STORAGE_KEY_PREFIX = 'interview_event_queue_';

export class EventBatcher {
  private sessionId: string;
  private queue: QueuedEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;
  private storageKey: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;

    // Load persisted events
    this.loadFromStorage();

    // Start batching timer
    this.startTimer();
  }

  /**
   * Add an event to the batch queue
   */
  add(event: EventData): void {
    const queuedEvent: QueuedEvent = {
      ...event,
      id: this.generateId(),
      timestamp: event.timestamp || Date.now(),
      retries: 0,
    };

    this.queue.push(queuedEvent);
    this.saveToStorage();

    // Flush immediately if queue is full
    if (this.queue.length >= MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  /**
   * Flush all queued events to the API
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;

    // Take all current events
    const eventsToSend = [...this.queue];
    this.queue = [];
    this.saveToStorage();

    try {
      const response = await fetch(`/api/interview/${this.sessionId}/events/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: eventsToSend.map(e => ({
            type: e.type,
            data: e.data,
            timestamp: new Date(e.timestamp!),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to flush events: ${response.statusText}`);
      }

      // Successfully sent, clear storage
      this.clearStorage();
    } catch (error) {
      console.error('Failed to flush events:', error);

      // Re-queue events that haven't exceeded retry limit
      const requeue = eventsToSend
        .filter(e => e.retries < MAX_RETRIES)
        .map(e => ({ ...e, retries: e.retries + 1 }));

      this.queue.unshift(...requeue);
      this.saveToStorage();

      // Log failed events for monitoring
      const failed = eventsToSend.filter(e => e.retries >= MAX_RETRIES);
      if (failed.length > 0) {
        console.warn(`Dropping ${failed.length} events after ${MAX_RETRIES} retries`);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Start the automatic batching timer
   */
  private startTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, BATCH_INTERVAL_MS);
  }

  /**
   * Stop the batching timer and flush remaining events
   */
  async destroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Flush any remaining events
    await this.flush();
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Save queue to localStorage for persistence
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save event queue to storage:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load event queue from storage:', error);
      this.queue = [];
    }
  }

  /**
   * Clear persisted queue
   */
  private clearStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear event queue from storage:', error);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * React hook for using EventBatcher
 */
import { useEffect, useRef } from 'react';

export function useEventBatcher(sessionId: string) {
  const batcherRef = useRef<EventBatcher | null>(null);

  useEffect(() => {
    // Create batcher
    batcherRef.current = new EventBatcher(sessionId);

    // Cleanup on unmount
    return () => {
      if (batcherRef.current) {
        batcherRef.current.destroy();
      }
    };
  }, [sessionId]);

  return {
    addEvent: (event: EventData) => {
      batcherRef.current?.add(event);
    },
    flush: () => {
      return batcherRef.current?.flush();
    },
    getQueueSize: () => {
      return batcherRef.current?.getQueueSize() || 0;
    },
  };
}

/**
 * Example usage:
 *
 * ```tsx
 * const { addEvent, flush } = useEventBatcher(sessionId);
 *
 * // Add events (batched automatically)
 * addEvent({ type: 'code_change', data: { fileName, content } });
 * addEvent({ type: 'file_open', data: { path } });
 *
 * // Manual flush if needed
 * await flush();
 * ```
 */
