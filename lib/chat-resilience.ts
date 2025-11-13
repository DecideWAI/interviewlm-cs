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
 * Reset conversation history for a new question (with retry logic)
 *
 * CRITICAL: This must succeed to prevent context leakage between questions.
 * If reset fails, AI retains context from previous question, compromising assessment integrity.
 */
export async function resetConversation(
  candidateId: string,
  questionId: string
): Promise<void> {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY = 1000; // 1s

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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

      // Success!
      if (attempt > 0) {
        console.log(`Conversation reset succeeded on attempt ${attempt + 1}`);
      }
      return;

    } catch (error) {
      lastError = error as Error;
      console.error(`Conversation reset attempt ${attempt + 1} failed:`, error);

      // Don't retry on final attempt
      if (attempt === MAX_RETRIES - 1) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = INITIAL_DELAY * Math.pow(2, attempt);
      console.log(`Retrying conversation reset in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed - this is CRITICAL
  const errorMessage = `Failed to reset conversation after ${MAX_RETRIES} attempts. ` +
    `This could cause context leakage between questions. ` +
    `Error: ${lastError?.message || 'Unknown error'}`;

  console.error(errorMessage);

  // THROW to block question progression on reset failure
  throw new Error(errorMessage);
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
