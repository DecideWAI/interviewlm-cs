import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */

  // Enable standalone output for Docker
  output: 'standalone',

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
