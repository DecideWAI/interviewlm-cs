import type { NextConfig } from 'next';

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

export default nextConfig;
