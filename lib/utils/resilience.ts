/**
 * Resilience Utilities
 *
 * Collection of resilience patterns for robust distributed systems:
 * - Retry with exponential backoff
 * - Fallback strategies
 * - Timeout handling
 * - Bulkhead pattern
 *
 * Use with circuit breakers and idempotency for complete resilience.
 */

/**
 * Retry options
 */
export interface RetryOptions {
  maxRetries: number;
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  factor: number; // exponential backoff factor
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Default retry options
 */
const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
};

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry this error
      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.factor, attempt),
        opts.maxDelay
      );

      // Call retry callback
      if (opts.onRetry) {
        opts.onRetry(lastError, attempt + 1);
      }

      // Wait before retry
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Execute with timeout
 * Throws TimeoutError if operation takes too long
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(timeoutMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Timeout error
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Fallback pattern
 * Try primary function, fall back to secondary if it fails
 */
export async function fallback<T>(
  primary: () => Promise<T>,
  secondary: () => Promise<T>,
  shouldFallback?: (error: Error) => boolean
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    // Check if we should fallback
    if (shouldFallback && !shouldFallback(error as Error)) {
      throw error;
    }

    console.warn('Primary operation failed, falling back to secondary', error);
    return await secondary();
  }
}

/**
 * Fallback with default value
 */
export async function fallbackTo<T>(
  fn: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn('Operation failed, returning default value', error);
    return defaultValue;
  }
}

/**
 * Bulkhead pattern
 * Limit concurrent executions to prevent resource exhaustion
 */
export class Bulkhead {
  private running: number = 0;
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  constructor(private readonly maxConcurrent: number) {}

  /**
   * Execute function with concurrency limit
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If under limit, execute immediately
    if (this.running < this.maxConcurrent) {
      this.running++;
      try {
        return await fn();
      } finally {
        this.running--;
        this.processQueue();
      }
    }

    // Otherwise, queue it
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
    });
  }

  /**
   * Process queued items
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const item = this.queue.shift()!;
      this.running++;

      item
        .fn()
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.running--;
          this.processQueue();
        });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): { running: number; queued: number } {
    return {
      running: this.running,
      queued: this.queue.length,
    };
  }
}

/**
 * Debounce async function
 * Only execute after delay with no new calls
 */
export function debounce<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delayMs: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingPromise: Promise<any> | null = null;

  return ((...args: any[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!pendingPromise) {
      pendingPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(async () => {
          try {
            const result = await fn(...args);
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            pendingPromise = null;
          }
        }, delayMs);
      });
    }

    return pendingPromise;
  }) as T;
}

/**
 * Throttle async function
 * Execute at most once per interval
 */
export function throttle<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  intervalMs: number
): T {
  let lastExecution = 0;
  let pendingPromise: Promise<any> | null = null;

  return ((...args: any[]) => {
    const now = Date.now();
    const timeSinceLastExecution = now - lastExecution;

    if (timeSinceLastExecution >= intervalMs) {
      lastExecution = now;
      pendingPromise = fn(...args);
      return pendingPromise;
    }

    // Return pending promise if exists, otherwise execute after delay
    if (pendingPromise) {
      return pendingPromise;
    }

    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        lastExecution = Date.now();
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, intervalMs - timeSinceLastExecution);
    });
  }) as T;
}

/**
 * Batch operations
 * Collect operations and execute them in batches
 */
export class BatchProcessor<T, R> {
  private batch: T[] = [];
  private timeoutId: NodeJS.Timeout | null = null;
  private promises: Array<{
    resolve: (value: R) => void;
    reject: (error: any) => void;
  }> = [];

  constructor(
    private readonly processBatch: (items: T[]) => Promise<R[]>,
    private readonly batchSize: number = 10,
    private readonly maxWaitMs: number = 1000
  ) {}

  /**
   * Add item to batch
   */
  async add(item: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.batch.push(item);
      this.promises.push({ resolve, reject });

      // Process immediately if batch is full
      if (this.batch.length >= this.batchSize) {
        this.process();
      } else if (!this.timeoutId) {
        // Otherwise, wait for more items or timeout
        this.timeoutId = setTimeout(() => this.process(), this.maxWaitMs);
      }
    });
  }

  /**
   * Process current batch
   */
  private async process(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.batch.length === 0) {
      return;
    }

    const batchToProcess = this.batch;
    const promisesToResolve = this.promises;

    this.batch = [];
    this.promises = [];

    try {
      const results = await this.processBatch(batchToProcess);

      results.forEach((result, index) => {
        promisesToResolve[index].resolve(result);
      });
    } catch (error) {
      promisesToResolve.forEach((promise) => {
        promise.reject(error);
      });
    }
  }
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  // Network errors
  if (
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('ECONNRESET')
  ) {
    return true;
  }

  // Rate limit errors
  if (
    error.message.includes('rate limit') ||
    error.message.includes('429') ||
    error.message.includes('Too Many Requests')
  ) {
    return true;
  }

  // Temporary server errors
  if (
    error.message.includes('503') ||
    error.message.includes('Service Unavailable') ||
    error.message.includes('502') ||
    error.message.includes('Bad Gateway')
  ) {
    return true;
  }

  return false;
}

/**
 * Health check with retry
 */
export async function healthCheck(
  checkFn: () => Promise<boolean>,
  maxAttempts: number = 3
): Promise<{ healthy: boolean; attempts: number; lastError?: string }> {
  let attempts = 0;
  let lastError: string | undefined;

  for (attempts = 1; attempts <= maxAttempts; attempts++) {
    try {
      const healthy = await checkFn();
      if (healthy) {
        return { healthy: true, attempts };
      }
    } catch (error) {
      lastError = (error as Error).message;
    }

    if (attempts < maxAttempts) {
      await sleep(1000 * attempts); // Incremental backoff
    }
  }

  return {
    healthy: false,
    attempts,
    lastError,
  };
}
