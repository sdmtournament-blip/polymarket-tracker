import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/polymarket-tracker',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;