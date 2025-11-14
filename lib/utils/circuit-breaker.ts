/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by detecting failures and stopping
 * requests to failing services temporarily.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, reject requests immediately
 * - HALF_OPEN: Testing if service recovered, allow limited requests
 *
 * Use cases:
 * - Claude API calls
 * - Modal sandbox operations
 * - Database queries
 * - External API calls
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time in ms before attempting half-open
  rollingWindowSize: number; // Size of rolling window for failure tracking
  name?: string; // Circuit breaker name for logging
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public circuitState: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number[] = []; // Timestamps of failures
  private successes: number = 0;
  private nextAttempt: number = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      name: 'unknown',
      ...options,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed
      if (Date.now() < this.nextAttempt) {
        throw new CircuitBreakerError(
          `Circuit breaker [${this.options.name}] is OPEN. Try again later.`,
          CircuitState.OPEN
        );
      }

      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successes = 0;
      console.log(`[CircuitBreaker:${this.options.name}] Transitioning to HALF_OPEN`);
    }

    try {
      // Execute function
      const result = await fn();

      // Record success
      this.onSuccess();

      return result;
    } catch (error) {
      // Record failure
      this.onFailure();

      throw error;
    }
  }

  /**
   * Record a successful execution
   */
  private onSuccess(): void {
    // Clean up old failures
    this.cleanupOldFailures();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;

      // Close circuit if enough successes
      if (this.successes >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.options.name}] Transitioning to CLOSED`);
      }
    }
  }

  /**
   * Record a failed execution
   */
  private onFailure(): void {
    const now = Date.now();
    this.failures.push(now);

    // Clean up old failures
    this.cleanupOldFailures();

    // Check if failure threshold exceeded
    if (this.failures.length >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = now + this.options.timeout;
      this.successes = 0;

      console.error(
        `[CircuitBreaker:${this.options.name}] Transitioning to OPEN. ` +
        `${this.failures.length} failures in rolling window.`
      );
    }
  }

  /**
   * Remove failures outside rolling window
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.options.rollingWindowSize;
    this.failures = this.failures.filter((timestamp) => timestamp > cutoff);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count in rolling window
   */
  getFailureCount(): number {
    this.cleanupOldFailures();
    return this.failures.length;
  }

  /**
   * Get metrics
   */
  getMetrics(): {
    state: CircuitState;
    failures: number;
    successes: number;
    nextAttemptIn?: number;
  } {
    return {
      state: this.state,
      failures: this.getFailureCount(),
      successes: this.successes,
      nextAttemptIn:
        this.state === CircuitState.OPEN
          ? Math.max(0, this.nextAttempt - Date.now())
          : undefined,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.successes = 0;
    this.nextAttempt = 0;
    console.log(`[CircuitBreaker:${this.options.name}] Manually reset to CLOSED`);
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different services
 */
class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultOptions: CircuitBreakerOptions = {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000, // 1 minute
        rollingWindowSize: 120000, // 2 minutes
        name,
      };

      this.breakers.set(
        name,
        new CircuitBreaker({ ...defaultOptions, ...options })
      );
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): Record<string, ReturnType<CircuitBreaker['getMetrics']>> {
    const metrics: Record<string, ReturnType<CircuitBreaker['getMetrics']>> = {};

    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });

    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach((breaker) => breaker.reset());
  }

  /**
   * Reset specific circuit breaker
   */
  reset(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      return true;
    }
    return false;
  }
}

/**
 * Singleton instance
 */
const manager = new CircuitBreakerManager();

/**
 * Get circuit breaker manager
 */
export function getCircuitBreakerManager(): CircuitBreakerManager {
  return manager;
}

/**
 * Predefined circuit breakers for common services
 */
export const circuitBreakers = {
  /**
   * Claude API circuit breaker
   */
  claude: manager.getBreaker('claude-api', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000, // 30 seconds
    rollingWindowSize: 60000, // 1 minute
  }),

  /**
   * Modal sandbox circuit breaker
   */
  modal: manager.getBreaker('modal-sandbox', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    rollingWindowSize: 120000, // 2 minutes
  }),

  /**
   * Database circuit breaker
   */
  database: manager.getBreaker('database', {
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 10000, // 10 seconds
    rollingWindowSize: 30000, // 30 seconds
  }),

  /**
   * External API circuit breaker (general)
   */
  externalApi: manager.getBreaker('external-api', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    rollingWindowSize: 120000, // 2 minutes
  }),
};

/**
 * Decorator for circuit breaker protection
 * Usage: @WithCircuitBreaker('claude-api')
 */
export function WithCircuitBreaker(breakerName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const breaker = manager.getBreaker(breakerName);

      return await breaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

/**
 * Retry with circuit breaker
 * Combines retry logic with circuit breaker protection
 */
export async function retryWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  breakerName: string,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  const breaker = manager.getBreaker(breakerName);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await breaker.execute(fn);
    } catch (error) {
      lastError = error as Error;

      // Don't retry if circuit is open
      if (error instanceof CircuitBreakerError) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * Math.pow(2, attempt))
        );
      }
    }
  }

  throw lastError;
}
