/**
 * Application Initialization
 *
 * Run this on server startup to validate environment and log configuration.
 * Import this in your root layout or API middleware.
 */

import { env, features, logMissingFeatures, isProd } from "@/lib/config/env";
import { logger } from "@/lib/utils/logger";
import { modalService } from "@/lib/services/modal.production";

let initialized = false;

/**
 * Initialize application
 * - Validates environment configuration
 * - Checks external service connectivity
 * - Logs warnings about missing features
 */
export async function initializeApp() {
  if (initialized) {
    return;
  }

  logger.info("🚀 Initializing InterviewLM...");

  // Log environment
  logger.info(`Environment: ${env.NODE_ENV}`);

  // Check critical services
  const checks = await runHealthChecks();

  // Log missing features (warnings, not errors)
  logMissingFeatures();

  // In production, fail fast if critical services are down
  if (isProd) {
    const criticalFailures = checks.filter((c) => c.critical && !c.healthy);

    if (criticalFailures.length > 0) {
      logger.fatal("Critical services are unavailable:");
      criticalFailures.forEach((check) => {
        logger.fatal(`  ❌ ${check.name}: ${check.error}`);
      });

      throw new Error(
        "Application cannot start due to missing critical services. " +
          "Please check your environment configuration."
      );
    }
  }

  // Log health check results
  checks.forEach((check) => {
    if (check.healthy) {
      logger.info(`  ✅ ${check.name}`);
    } else if (check.critical) {
      logger.error(`  ❌ ${check.name}: ${check.error}`);
    } else {
      logger.warn(`  ⚠️  ${check.name}: ${check.error}`);
    }
  });

  initialized = true;
  logger.info("✅ Initialization complete\n");
}

/**
 * Health check result
 */
interface HealthCheck {
  name: string;
  healthy: boolean;
  critical: boolean; // If true, app cannot function without this
  error?: string;
}

/**
 * Run health checks on external services
 */
async function runHealthChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Database check
  checks.push(await checkDatabase());

  // Modal check
  checks.push(await checkModal());

  // Anthropic API check
  checks.push(await checkAnthropic());

  // Redis check (optional)
  if (features.hasRedis) {
    checks.push(await checkRedis());
  }

  // Email service check (optional but recommended)
  if (features.hasEmail) {
    checks.push(await checkEmail());
  }

  // S3 check (optional)
  if (features.hasS3) {
    checks.push(await checkS3());
  }

  return checks;
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheck> {
  try {
    const { default: prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;

    return {
      name: "Database (PostgreSQL)",
      healthy: true,
      critical: true,
    };
  } catch (error) {
    return {
      name: "Database (PostgreSQL)",
      healthy: false,
      critical: true,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Check Modal service
 */
async function checkModal(): Promise<HealthCheck> {
  try {
    if (!features.hasModal) {
      return {
        name: "Modal (Code Execution)",
        healthy: false,
        critical: true,
        error: "Modal endpoints not configured in environment",
      };
    }

    const health = await modalService.healthCheck();

    if (health.status !== "healthy") {
      return {
        name: "Modal (Code Execution)",
        healthy: false,
        critical: true,
        error: "Some Modal endpoints are not configured",
      };
    }

    return {
      name: "Modal (Code Execution)",
      healthy: true,
      critical: true,
    };
  } catch (error) {
    return {
      name: "Modal (Code Execution)",
      healthy: false,
      critical: true,
      error: error instanceof Error ? error.message : "Health check failed",
    };
  }
}

/**
 * Check Anthropic API
 */
async function checkAnthropic(): Promise<HealthCheck> {
  try {
    // Just check if API key is configured
    // We don't make actual API call to avoid charges
    if (!env.ANTHROPIC_API_KEY) {
      return {
        name: "Anthropic API (Claude)",
        healthy: false,
        critical: true,
        error: "ANTHROPIC_API_KEY not configured",
      };
    }

    return {
      name: "Anthropic API (Claude)",
      healthy: true,
      critical: true,
    };
  } catch (error) {
    return {
      name: "Anthropic API (Claude)",
      healthy: false,
      critical: true,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<HealthCheck> {
  try {
    // TODO: Implement Redis connection check
    // const redis = new Redis(env.REDIS_URL);
    // await redis.ping();

    return {
      name: "Redis (Caching & Jobs)",
      healthy: true,
      critical: false,
    };
  } catch (error) {
    return {
      name: "Redis (Caching & Jobs)",
      healthy: false,
      critical: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Check email service (Resend)
 */
async function checkEmail(): Promise<HealthCheck> {
  try {
    if (!env.RESEND_API_KEY) {
      return {
        name: "Email Service (Resend)",
        healthy: false,
        critical: false,
        error: "RESEND_API_KEY not configured",
      };
    }

    // Just check if API key is present
    // Don't send actual email to avoid charges
    return {
      name: "Email Service (Resend)",
      healthy: true,
      critical: false,
    };
  } catch (error) {
    return {
      name: "Email Service (Resend)",
      healthy: false,
      critical: false,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}

/**
 * Check S3 connectivity
 */
async function checkS3(): Promise<HealthCheck> {
  try {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      return {
        name: "AWS S3 (Session Storage)",
        healthy: false,
        critical: false,
        error: "AWS credentials not configured",
      };
    }

    // TODO: Implement S3 connection check
    // const s3 = new S3Client({...});
    // await s3.send(new HeadBucketCommand({ Bucket: env.AWS_S3_BUCKET }));

    return {
      name: "AWS S3 (Session Storage)",
      healthy: true,
      critical: false,
    };
  } catch (error) {
    return {
      name: "AWS S3 (Session Storage)",
      healthy: false,
      critical: false,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}

/**
 * Get initialization status
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Reset initialization (for testing)
 */
export function resetInitialization(): void {
  initialized = false;
}
