/**
 * Production Logger
 *
 * Structured logging with different levels and contexts.
 * Integrates with Sentry for error monitoring in production.
 */

import * as Sentry from "@sentry/nextjs";
import { isProd, isDev } from "@/lib/config/env";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
  stack?: string;
}

class Logger {
  private minLevel: LogLevel;

  constructor() {
    // Only show DEBUG in development
    this.minLevel = isDev ? LogLevel.DEBUG : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatMessage(entry: LogEntry): string {
    const levelNames = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
    const levelName = levelNames[entry.level];
    const timestamp = entry.timestamp;

    if (isDev) {
      // Pretty format for development
      const emoji = ["🔍", "ℹ️", "⚠️", "❌", "💀"][entry.level];
      let msg = `${emoji} [${levelName}] ${entry.message}`;

      if (entry.context && Object.keys(entry.context).length > 0) {
        msg += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
      }

      if (entry.error) {
        msg += `\n  Error: ${entry.error.message}`;
        if (entry.stack) {
          msg += `\n  Stack: ${entry.stack}`;
        }
      }

      return msg;
    } else {
      // JSON format for production (parseable by log aggregators)
      return JSON.stringify({
        level: levelName,
        message: entry.message,
        timestamp,
        ...entry.context,
        ...(entry.error && {
          error: {
            message: entry.error.message,
            name: entry.error.name,
            stack: entry.stack,
          },
        }),
      });
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
      stack: error?.stack,
    };

    const formatted = this.formatMessage(entry);

    // Console output
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formatted);
        break;
    }

    // In production, send to monitoring service (Sentry)
    // Send INFO+ logs to Sentry for correlation with errors
    if (isProd && level >= LogLevel.INFO) {
      this.sendToMonitoring(entry);
    }
  }

  private mapLogLevelToSentry(
    level: LogLevel
  ): "debug" | "info" | "warning" | "error" | "fatal" {
    const map: Record<
      LogLevel,
      "debug" | "info" | "warning" | "error" | "fatal"
    > = {
      [LogLevel.DEBUG]: "debug",
      [LogLevel.INFO]: "info",
      [LogLevel.WARN]: "warning",
      [LogLevel.ERROR]: "error",
      [LogLevel.FATAL]: "fatal",
    };
    return map[level] || "info";
  }

  private sendToMonitoring(entry: LogEntry): void {
    // Add breadcrumb for all logs (correlates with errors in Sentry)
    // Breadcrumbs are automatically attached to error events for context
    Sentry.addBreadcrumb({
      category: "log",
      message: entry.message,
      level: this.mapLogLevelToSentry(entry.level),
      data: entry.context,
    });

    // Send ERROR/FATAL with full error context
    if (entry.level >= LogLevel.ERROR) {
      if (entry.error) {
        Sentry.captureException(entry.error, {
          level: entry.level === LogLevel.FATAL ? "fatal" : "error",
          extra: {
            message: entry.message,
            ...entry.context,
          },
          tags: {
            logLevel: LogLevel[entry.level],
          },
        });
      } else {
        Sentry.captureMessage(entry.message, {
          level: entry.level === LogLevel.FATAL ? "fatal" : "error",
          extra: entry.context,
          tags: {
            logLevel: LogLevel[entry.level],
          },
        });
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.FATAL, message, context, error);
  }

  /**
   * Create a child logger with additional context
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger();
    const originalLog = childLogger.log.bind(childLogger);

    childLogger.log = (level: LogLevel, message: string, context?: LogContext, error?: Error) => {
      originalLog(level, message, { ...defaultContext, ...context }, error);
    };

    return childLogger;
  }

  /**
   * Time an operation and log duration
   */
  async time<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = Date.now();
    this.debug(`Starting: ${operation}`, context);

    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.debug(`Completed: ${operation}`, { ...context, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`Failed: ${operation}`, error as Error, { ...context, duration });
      throw error;
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = {
  debug: logger.debug.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  fatal: logger.fatal.bind(logger),
  child: logger.child.bind(logger),
  time: logger.time.bind(logger),
};

export default logger;
