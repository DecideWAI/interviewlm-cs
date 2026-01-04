import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  /* config options here */

  // Enable standalone output for Docker
  output: 'standalone',

  // Don't fail build on type errors if DATABASE_URL is not set (Vercel build fix)
  typescript: {
    ignoreBuildErrors: !process.env.DATABASE_URL,
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // External packages for server components (required for Sentry profiling)
  serverExternalPackages: ['@sentry/profiling-node'],

  // Webpack configuration for Prisma Edge compatibility
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize Prisma client to avoid bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        '@prisma/client': '@prisma/client',
      });
    }
    return config;
  },
};

// Wrap with Sentry configuration
const sentryWebpackPluginOptions = {
  // Suppress source map upload logs in CI
  silent: true,

  // Organization and project from environment
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps for better stack traces
  widenClientFileUpload: true,

  // Hide source maps from production build
  hideSourceMaps: true,

  // Transpile SDK to target older browsers
  transpileClientSDK: true,

  // Route browser requests to Sentry through Next.js rewrite to avoid ad-blockers
  tunnelRoute: '/monitoring-tunnel',

  // Webpack-specific options (new format to fix deprecation warnings)
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
};

// Only apply Sentry config in production or if explicitly enabled
const shouldUseSentry =
  process.env.NODE_ENV === 'production' ||
  process.env.SENTRY_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN;

export default shouldUseSentry
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
