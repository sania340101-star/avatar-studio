import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  middlewareClientMaxBodySize: '100mb',
  env: {
    JWT_SECRET: process.env.JWT_SECRET,
    SSO_JWT_SECRET: process.env.SSO_JWT_SECRET,
    INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY,
  },
};

export default nextConfig;
