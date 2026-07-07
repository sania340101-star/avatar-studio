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
  },
};

export default nextConfig;
