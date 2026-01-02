/**
 * useCodeStreaming Hook
 *
 * Connects to Server-Sent Events endpoint for real-time code streaming
 * from AI coding assistant to editor
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface CodeStreamEvent {
  sessionId: string;
  fileName: string;
  delta?: string; // Incremental code chunk
  fullContent?: string; // Complete file content
  position?: {
    line: number;
    column: number;
  };
  type: 'delta' | 'complete' | 'start' | 'error';
  error?: string;
}

export interface UseCodeStreamingOptions {
  sessionId: string;
  onCodeUpdate?: (fileName: string, delta: string) => void;
  onStreamComplete?: (fileName: string, fullContent: string) => void;
  onStreamStart?: (fileName: string) => void;
  onError?: (fileName: string, error: string) => void;
  enabled?: boolean; // Enable/disable streaming
}

export interface UseCodeStreamingReturn {
  isConnected: boolean;
  isStreaming: boolean;
  currentFile: string | null;
  accumulatedContent: Map<string, string>; // fileName -> accumulated code
  error: string | null;
  reconnect: () => void;
}

/**
 * Hook to connect to code streaming SSE endpoint
 */
export function useCodeStreaming({
  sessionId,
  onCodeUpdate,
  onStreamComplete,
  onStreamStart,
  onError,
  enabled = true,
}: UseCodeStreamingOptions): UseCodeStreamingReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accumulatedContent, setAccumulatedContent] = useState<Map<string, string>>(
    new Map()
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Store callbacks in refs to prevent connection teardown on callback changes
  const onCodeUpdateRef = useRef(onCodeUpdate);
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change (without triggering reconnection)
  useEffect(() => {
    onCodeUpdateRef.current = onCodeUpdate;
    onStreamCompleteRef.current = onStreamComplete;
    onStreamStartRef.current = onStreamStart;
    onErrorRef.current = onError;
  }, [onCodeUpdate, onStreamComplete, onStreamStart, onError]);

  /**
   * Connect to SSE endpoint
   */
  const connect = useCallback(() => {
    if (!enabled || !sessionId) {
      return;
    }

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const url = `/api/interview/${sessionId}/code-stream`;
      const eventSource = new EventSource(url);

      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('[CodeStreaming] Connected:', data.clientId);
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      });

      eventSource.addEventListener('code', (event) => {
        // Reset reconnect counter on successful data
        reconnectAttemptsRef.current = 0;

        const codeEvent: CodeStreamEvent = JSON.parse(event.data);

        switch (codeEvent.type) {
          case 'start':
            setIsStreaming(true);
            setCurrentFile(codeEvent.fileName);
            setAccumulatedContent((prev) => {
              const newMap = new Map(prev);
              newMap.set(codeEvent.fileName, '');
              return newMap;
            });
            onStreamStartRef.current?.(codeEvent.fileName);
            break;

          case 'delta':
            if (codeEvent.delta) {
              setAccumulatedContent((prev) => {
                const newMap = new Map(prev);
                const current = newMap.get(codeEvent.fileName) || '';
                newMap.set(codeEvent.fileName, current + codeEvent.delta);
                return newMap;
              });
              onCodeUpdateRef.current?.(codeEvent.fileName, codeEvent.delta);
            }
            break;

          case 'complete':
            setIsStreaming(false);
            setCurrentFile(null);
            if (codeEvent.fullContent) {
              setAccumulatedContent((prev) => {
                const newMap = new Map(prev);
                newMap.set(codeEvent.fileName, codeEvent.fullContent!);
                return newMap;
              });
              onStreamCompleteRef.current?.(codeEvent.fileName, codeEvent.fullContent);
            }
            break;

          case 'error':
            setIsStreaming(false);
            setCurrentFile(null);
            setError(codeEvent.error || 'Stream error');
            onErrorRef.current?.(codeEvent.fileName, codeEvent.error || 'Unknown error');
            break;
        }
      });

      eventSource.onerror = () => {
        // Only reconnect if connection is actually CLOSED
        // CONNECTING = 0, OPEN = 1, CLOSED = 2
        if (eventSource.readyState === EventSource.CLOSED) {
          console.error('[CodeStreaming] Connection closed');
          setIsConnected(false);

          // Exponential backoff reconnection
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;

          if (reconnectAttemptsRef.current <= 5) {
            console.log(`[CodeStreaming] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          } else {
            setError('Failed to connect to code streaming. Please refresh.');
          }
        } else {
          // Transient error - connection still alive, don't close
          console.warn('[CodeStreaming] Transient error, connection still open (readyState:', eventSource.readyState, ')');
        }
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      console.error('[CodeStreaming] Failed to establish connection:', err);
      setError('Failed to establish code streaming connection');
    }
  }, [sessionId, enabled]); // Only reconnect when sessionId or enabled changes

  /**
   * Reconnect to SSE endpoint
   */
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  // Connect on mount and when sessionId changes
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    isStreaming,
    currentFile,
    accumulatedContent,
    error,
    reconnect,
  };
}
