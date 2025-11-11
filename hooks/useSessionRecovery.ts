/**
 * Session Recovery Hook
 *
 * Automatically saves and restores interview session state to prevent data loss
 * on browser refresh, crash, or accidental navigation.
 */

import { useEffect, useCallback, useRef } from 'react';

export interface SessionState {
  code: string;
  selectedFilePath: string | null;
  testResults: {
    passed: number;
    total: number;
  };
  timeRemaining: number;
  currentQuestionIndex: number;
  questionStartTime: string | null;
  questionTimeElapsed: number;
  lastSaved: number;
}

interface UseSessionRecoveryOptions {
  candidateId: string;
  onRestore?: (state: SessionState) => void;
  enabled?: boolean;
}

const STORAGE_KEY_PREFIX = 'interview-state-';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SAVE_DEBOUNCE_MS = 500; // Save every 500ms max

/**
 * Hook to manage session state recovery
 */
export function useSessionRecovery(options: UseSessionRecoveryOptions) {
  const { candidateId, onRestore, enabled = true } = options;
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveRef = useRef<string>('');

  const storageKey = `${STORAGE_KEY_PREFIX}${candidateId}`;

  /**
   * Check if there's a recoverable session
   */
  const checkRecoverableSession = useCallback((): SessionState | null => {
    if (!enabled || typeof window === 'undefined') return null;

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;

      const state: SessionState = JSON.parse(saved);

      // Check if state is too old
      if (Date.now() - state.lastSaved > MAX_AGE_MS) {
        localStorage.removeItem(storageKey);
        return null;
      }

      return state;
    } catch (error) {
      console.error('Failed to load session state:', error);
      return null;
    }
  }, [storageKey, enabled]);

  /**
   * Save session state to localStorage (debounced)
   */
  const saveSessionState = useCallback((state: Partial<SessionState>) => {
    if (!enabled || typeof window === 'undefined') return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce saves to avoid excessive localStorage writes
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const currentState = localStorage.getItem(storageKey);
        const existingState: Partial<SessionState> = currentState
          ? JSON.parse(currentState)
          : {};

        const newState: SessionState = {
          code: state.code ?? existingState.code ?? '',
          selectedFilePath: state.selectedFilePath ?? existingState.selectedFilePath ?? null,
          testResults: state.testResults ?? existingState.testResults ?? { passed: 0, total: 0 },
          timeRemaining: state.timeRemaining ?? existingState.timeRemaining ?? 0,
          currentQuestionIndex: state.currentQuestionIndex ?? existingState.currentQuestionIndex ?? 0,
          questionStartTime: state.questionStartTime ?? existingState.questionStartTime ?? null,
          questionTimeElapsed: state.questionTimeElapsed ?? existingState.questionTimeElapsed ?? 0,
          lastSaved: Date.now(),
        };

        // Only save if state actually changed
        const newStateStr = JSON.stringify(newState);
        if (newStateStr !== lastSaveRef.current) {
          localStorage.setItem(storageKey, newStateStr);
          lastSaveRef.current = newStateStr;
          console.debug('Session state saved to localStorage');
        }
      } catch (error) {
        console.error('Failed to save session state:', error);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [storageKey, enabled]);

  /**
   * Clear session state from localStorage
   */
  const clearSessionState = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
      lastSaveRef.current = '';
      console.debug('Session state cleared from localStorage');
    } catch (error) {
      console.error('Failed to clear session state:', error);
    }
  }, [storageKey]);

  /**
   * Try to restore session on mount
   */
  useEffect(() => {
    const recoverable = checkRecoverableSession();
    if (recoverable && onRestore) {
      console.log('Found recoverable session state from', new Date(recoverable.lastSaved));
      onRestore(recoverable);
    }
  }, [checkRecoverableSession, onRestore]);

  /**
   * Cleanup timeout on unmount
   */
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveSessionState,
    clearSessionState,
    checkRecoverableSession,
  };
}

/**
 * Hook to show session recovery dialog
 */
export function useSessionRecoveryDialog() {
  const showRecoveryDialog = useCallback((state: SessionState): Promise<boolean> => {
    return new Promise((resolve) => {
      const timeSinceSave = Date.now() - state.lastSaved;
      const minutesAgo = Math.floor(timeSinceSave / 60000);

      const message = [
        'We found a previous session from',
        minutesAgo < 1 ? 'less than a minute ago' : `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`,
        '\n\nWould you like to resume where you left off?',
        '\n\nYour progress:',
        `- Code changes saved`,
        `- ${state.testResults.passed}/${state.testResults.total} tests passing`,
        `- Question ${state.currentQuestionIndex + 1}`,
        `- ${Math.floor(state.timeRemaining / 60)} minutes remaining`,
      ].join('\n');

      // Use native confirm for now - will be replaced with Dialog component
      const shouldRecover = window.confirm(message);
      resolve(shouldRecover);
    });
  }, []);

  return { showRecoveryDialog };
}
