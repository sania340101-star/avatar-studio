import type { NextConfig } from "next";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    proxyClientMaxBodySize: '100mb',
  },
  env: {
    APP_VERSION: version,
    JWT_SECRET: process.env.JWT_SECRET,
    SSO_JWT_SECRET: process.env.SSO_JWT_SECRET,
    INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY,
  },
};

export default nextConfig;
