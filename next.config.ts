import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // Exclude base_components from compilation
  },
};

export default nextConfig;
