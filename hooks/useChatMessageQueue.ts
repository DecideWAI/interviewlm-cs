/**
 * Chat Message Queue Hook
 *
 * Manages a persistent queue of chat messages for stream recovery.
 * Messages are stored in localStorage and automatically retried on page reload
 * or network reconnection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface QueuedMessage {
  id: string;
  sessionId: string;
  questionId: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'sending' | 'failed';
  retryCount: number;
}

interface UseChatMessageQueueOptions {
  candidateId: string;
  maxRetries?: number;
  enabled?: boolean;
}

const STORAGE_KEY_PREFIX = 'chat-queue-';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes - messages older than this are discarded
const DEFAULT_MAX_RETRIES = 3;

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hook to manage chat message queue for recovery
 */
export function useChatMessageQueue(options: UseChatMessageQueueOptions) {
  const { candidateId, maxRetries = DEFAULT_MAX_RETRIES, enabled = true } = options;
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const isInitializedRef = useRef(false);

  const storageKey = `${STORAGE_KEY_PREFIX}${candidateId}`;

  /**
   * Load queue from localStorage
   */
  const loadQueue = useCallback((): QueuedMessage[] => {
    if (!enabled || typeof window === 'undefined') return [];

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return [];

      const messages: QueuedMessage[] = JSON.parse(saved);

      // Filter out stale messages
      const now = Date.now();
      const validMessages = messages.filter(msg => now - msg.timestamp < MAX_AGE_MS);

      // If we filtered any, update storage
      if (validMessages.length !== messages.length) {
        localStorage.setItem(storageKey, JSON.stringify(validMessages));
      }

      return validMessages;
    } catch (error) {
      console.error('[ChatQueue] Failed to load queue:', error);
      return [];
    }
  }, [storageKey, enabled]);

  /**
   * Save queue to localStorage
   */
  const saveQueue = useCallback((messages: QueuedMessage[]) => {
    if (!enabled || typeof window === 'undefined') return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (error) {
      console.error('[ChatQueue] Failed to save queue:', error);
    }
  }, [storageKey, enabled]);

  /**
   * Initialize queue from localStorage on mount
   */
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const loaded = loadQueue();
    if (loaded.length > 0) {
      console.log(`[ChatQueue] Loaded ${loaded.length} queued messages`);
      setQueue(loaded);
    }
  }, [loadQueue]);

  /**
   * Persist queue changes to localStorage
   */
  useEffect(() => {
    if (!isInitializedRef.current) return;
    saveQueue(queue);
  }, [queue, saveQueue]);

  /**
   * Add a new message to the queue
   */
  const enqueue = useCallback((
    message: string,
    sessionId: string,
    questionId: string
  ): string => {
    const msgId = generateMessageId();
    const queuedMsg: QueuedMessage = {
      id: msgId,
      sessionId,
      questionId,
      message,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    setQueue(prev => [...prev, queuedMsg]);
    console.log(`[ChatQueue] Enqueued message ${msgId}`);
    return msgId;
  }, []);

  /**
   * Mark a message as currently being sent
   */
  const markSending = useCallback((msgId: string) => {
    setQueue(prev =>
      prev.map(msg =>
        msg.id === msgId
          ? { ...msg, status: 'sending' as const }
          : msg
      )
    );
    console.log(`[ChatQueue] Message ${msgId} marked as sending`);
  }, []);

  /**
   * Mark a message as completed and remove from queue
   */
  const markComplete = useCallback((msgId: string) => {
    setQueue(prev => prev.filter(msg => msg.id !== msgId));
    console.log(`[ChatQueue] Message ${msgId} completed, removed from queue`);
  }, []);

  /**
   * Mark a message as failed (will be retried)
   */
  const markFailed = useCallback((msgId: string) => {
    setQueue(prev =>
      prev.map(msg => {
        if (msg.id !== msgId) return msg;

        const newRetryCount = msg.retryCount + 1;

        // If max retries exceeded, remove from queue
        if (newRetryCount > maxRetries) {
          console.warn(`[ChatQueue] Message ${msgId} exceeded max retries, removing`);
          return null as unknown as QueuedMessage;
        }

        return {
          ...msg,
          status: 'failed' as const,
          retryCount: newRetryCount,
        };
      }).filter(Boolean)
    );
    console.log(`[ChatQueue] Message ${msgId} marked as failed`);
  }, [maxRetries]);

  /**
   * Get all pending messages (pending or failed, not currently sending)
   */
  const getPendingMessages = useCallback((): QueuedMessage[] => {
    return queue.filter(msg => msg.status === 'pending' || msg.status === 'failed');
  }, [queue]);

  /**
   * Get message currently being sent
   */
  const getSendingMessage = useCallback((): QueuedMessage | null => {
    return queue.find(msg => msg.status === 'sending') || null;
  }, [queue]);

  /**
   * Check if there are any messages in queue
   */
  const hasQueuedMessages = useCallback((): boolean => {
    return queue.length > 0;
  }, [queue]);

  /**
   * Clear all messages from queue
   */
  const clearQueue = useCallback(() => {
    setQueue([]);
    console.log('[ChatQueue] Queue cleared');
  }, []);

  /**
   * Remove a specific message from queue
   */
  const removeMessage = useCallback((msgId: string) => {
    setQueue(prev => prev.filter(msg => msg.id !== msgId));
    console.log(`[ChatQueue] Message ${msgId} removed from queue`);
  }, []);

  /**
   * Get queue size
   */
  const getQueueSize = useCallback((): number => {
    return queue.length;
  }, [queue]);

  return {
    queue,
    enqueue,
    markSending,
    markComplete,
    markFailed,
    getPendingMessages,
    getSendingMessage,
    hasQueuedMessages,
    clearQueue,
    removeMessage,
    getQueueSize,
  };
}

/**
 * Stream Checkpoint Types
 */
export interface StreamCheckpoint {
  messageId: string;
  userMessage: string;
  partialResponse: string;
  toolCalls: ToolCall[];
  status: 'streaming' | 'completed' | 'failed';
  lastCheckpointAt: number;
  questionId: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

/**
 * Recovery state for UI
 */
export interface RecoveryState {
  isRecovering: boolean;
  partialResponse: string | null;
  userMessage: string | null;
  checkpoint: StreamCheckpoint | null;
}

/**
 * Initial recovery state
 */
export const initialRecoveryState: RecoveryState = {
  isRecovering: false,
  partialResponse: null,
  userMessage: null,
  checkpoint: null,
};
