/**
 * Chat Resilience Utilities
 *
 * Provides retry logic and connection management for AI chat
 */

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  onRetry?: (attempt: number, delay: number) => void;
}

/**
 * Exponential backoff retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: Partial<RetryOptions> = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelay = 2000,
    maxDelay = 16000,
    onRetry,
  } = retryOptions;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If successful or non-retryable error, return
      if (response.ok || response.status === 400 || response.status === 401 || response.status === 403) {
        return response;
      }

      // Network/server errors - retry
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort errors (user cancelled)
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }

      // Don't retry if we've hit max retries
      if (attempt >= maxRetries) {
        break;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

      // Notify caller of retry
      onRetry?.(attempt + 1, delay);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

/**
 * Reset conversation history for a new question
 */
export async function resetConversation(
  candidateId: string,
  questionId: string
): Promise<void> {
  try {
    const response = await fetch(`/api/interview/${candidateId}/chat/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to reset conversation");
    }
  } catch (error) {
    console.error("Failed to reset conversation:", error);
    // Don't throw - non-critical operation
  }
}

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Wait for network connection to be restored
 */
export async function waitForConnection(timeout = 30000): Promise<boolean> {
  if (isOnline()) return true;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      window.removeEventListener("online", onOnline);
      resolve(false);
    }, timeout);

    const onOnline = () => {
      clearTimeout(timeoutId);
      window.removeEventListener("online", onOnline);
      resolve(true);
    };

    window.addEventListener("online", onOnline);
  });
}
