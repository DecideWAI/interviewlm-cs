/**
 * Offline Detection Hook
 *
 * Monitors network connection status and provides utilities for handling offline scenarios.
 */

import { useState, useEffect, useCallback } from 'react';

export interface OfflineState {
  isOnline: boolean;
  wasOffline: boolean; // Track if we were offline (for reconnection handling)
}

/**
 * Hook to track online/offline status
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Don't run on server
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      console.log('🌐 Network connection restored');
      setIsOnline(true);
      // Track that we were offline (useful for triggering sync operations)
      if (!navigator.onLine) {
        setWasOffline(true);
      }
    };

    const handleOffline = () => {
      console.warn('📡 Network connection lost');
      setIsOnline(false);
      setWasOffline(true);
    };

    // Set up listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const resetWasOffline = useCallback(() => {
    setWasOffline(false);
  }, []);

  return { isOnline, wasOffline, resetWasOffline };
}

/**
 * Message queue for offline scenarios
 */
export class OfflineQueue<T> {
  private queue: T[] = [];
  private storageKey: string;

  constructor(storageKey: string) {
    this.storageKey = storageKey;
    this.loadFromStorage();
  }

  /**
   * Add item to queue
   */
  enqueue(item: T): void {
    this.queue.push(item);
    this.saveToStorage();
  }

  /**
   * Get all items and clear queue
   */
  dequeueAll(): T[] {
    const items = [...this.queue];
    this.queue = [];
    this.saveToStorage();
    return items;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
    this.saveToStorage();
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.queue = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }
}

/**
 * Wait for network connection with timeout
 */
export async function waitForConnection(timeoutMs: number = 30000): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (navigator.onLine) return true;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      window.removeEventListener('online', handleOnline);
      resolve(false);
    }, timeoutMs);

    const handleOnline = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      resolve(true);
    };

    window.addEventListener('online', handleOnline);
  });
}
