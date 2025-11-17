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
            onStreamStart?.(codeEvent.fileName);
            break;

          case 'delta':
            if (codeEvent.delta) {
              setAccumulatedContent((prev) => {
                const newMap = new Map(prev);
                const current = newMap.get(codeEvent.fileName) || '';
                newMap.set(codeEvent.fileName, current + codeEvent.delta);
                return newMap;
              });
              onCodeUpdate?.(codeEvent.fileName, codeEvent.delta);
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
              onStreamComplete?.(codeEvent.fileName, codeEvent.fullContent);
            }
            break;

          case 'error':
            setIsStreaming(false);
            setCurrentFile(null);
            setError(codeEvent.error || 'Stream error');
            onError?.(codeEvent.fileName, codeEvent.error || 'Unknown error');
            break;
        }
      });

      eventSource.onerror = () => {
        console.error('[CodeStreaming] Connection error');
        setIsConnected(false);
        eventSource.close();

        // Exponential backoff reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        if (reconnectAttemptsRef.current <= 5) {
          console.log(`[CodeStreaming] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          setError('Failed to connect to code streaming. Please refresh.');
        }
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      console.error('[CodeStreaming] Failed to establish connection:', err);
      setError('Failed to establish code streaming connection');
    }
  }, [sessionId, enabled, onCodeUpdate, onStreamComplete, onStreamStart, onError]);

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
