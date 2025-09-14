import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // ⚠️ Allows production builds to succeed even with ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;