/**
 * Environment Configuration and Validation
 *
 * Centralized environment variable management with validation.
 * Fails fast on startup if required variables are missing.
 */

import { z } from "zod";

// Environment schema with validation
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database
  DATABASE_URL: z.string().url("Invalid DATABASE_URL format"),

  // Authentication
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url("Invalid NEXTAUTH_URL format"),

  // OAuth (optional)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Anthropic API
  ANTHROPIC_API_KEY: z
    .string()
    .min(1, "ANTHROPIC_API_KEY is required")
    .startsWith("sk-", "ANTHROPIC_API_KEY must start with 'sk-'"),

  // Modal AI Sandbox
  MODAL_TOKEN_ID: z.string().optional(),
  MODAL_TOKEN_SECRET: z.string().optional(),
  MODAL_EXECUTE_URL: z.string().url("Invalid MODAL_EXECUTE_URL").optional(),
  MODAL_WRITE_FILE_URL: z.string().url("Invalid MODAL_WRITE_FILE_URL").optional(),
  MODAL_READ_FILE_URL: z.string().url("Invalid MODAL_READ_FILE_URL").optional(),
  MODAL_LIST_FILES_URL: z.string().url("Invalid MODAL_LIST_FILES_URL").optional(),
  MODAL_EXECUTE_COMMAND_URL: z.string().url("Invalid MODAL_EXECUTE_COMMAND_URL").optional(),

  // Email Service (Resend)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email("Invalid RESEND_FROM_EMAIL").optional(),

  // Payment Gateway (Paddle)
  PADDLE_VENDOR_ID: z.string().optional(),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_PUBLIC_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),

  // AWS S3 (Session Recordings)
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Redis (BullMQ, Caching)
  REDIS_URL: z.string().url("Invalid REDIS_URL").optional(),

  // Feature Flags
  ENABLE_CODE_STREAMING: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  ENABLE_DYNAMIC_QUESTIONS: z
    .string()
    .transform((val) => val === "true")
    .default("false"), // Disabled by default for safety

  // Monitoring (Sentry)
  SENTRY_DSN: z.string().url("Invalid SENTRY_DSN").optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url("Invalid NEXT_PUBLIC_SENTRY_DSN").optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Cloudflare Turnstile (Bot Protection)
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // CORS Configuration
  ALLOWED_ORIGINS: z.string().optional(), // Comma-separated list of allowed origins
});

// Parse and validate environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => {
        const path = issue.path.join(".");
        return `  - ${path}: ${issue.message}`;
      });

      console.error("❌ Environment validation failed:\n");
      console.error(issues.join("\n"));
      console.error("\nPlease check your .env file and ensure all required variables are set.");

      throw new Error("Invalid environment configuration");
    }
    throw error;
  }
}

// Export validated environment
export const env = validateEnv();

// Export type for TypeScript
export type Env = z.infer<typeof envSchema>;

// Helper to check if feature is enabled
export const features = {
  codeStreaming: env.ENABLE_CODE_STREAMING,
  dynamicQuestions: env.ENABLE_DYNAMIC_QUESTIONS,
  hasEmail: Boolean(env.RESEND_API_KEY),
  hasPayments: Boolean(env.PADDLE_API_KEY),
  hasS3: Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
  hasRedis: Boolean(env.REDIS_URL),
  hasModal: Boolean(env.MODAL_EXECUTE_URL),
  hasOAuth: {
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  },
  hasTurnstile: Boolean(
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY
  ),
  hasSentry: Boolean(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN),
} as const;

// Helper to check if running in production
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/**
 * Warn about missing optional features on startup
 */
export function logMissingFeatures() {
  const warnings: string[] = [];

  if (!features.hasModal) {
    warnings.push("⚠️  Modal not configured - code execution will fail");
  }

  if (!features.hasEmail) {
    warnings.push("⚠️  Email service not configured - invitations/notifications disabled");
  }

  if (!features.hasPayments) {
    warnings.push("⚠️  Paddle not configured - payment processing disabled");
  }

  if (!features.hasS3) {
    warnings.push("⚠️  S3 not configured - session recordings may not persist");
  }

  if (!features.hasRedis) {
    warnings.push("⚠️  Redis not configured - background jobs and caching disabled");
  }

  if (!features.hasTurnstile) {
    warnings.push("⚠️  Turnstile not configured - bot protection disabled");
  }

  if (warnings.length > 0 && isProd) {
    console.warn("\n🚨 Production warnings:");
    warnings.forEach((w) => console.warn(w));
    console.warn("");
  } else if (warnings.length > 0 && isDev) {
    console.info("\n💡 Optional features not configured:");
    warnings.forEach((w) => console.info(w));
    console.info("");
  }
}
