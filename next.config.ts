import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Self-contained server (.next/standalone) with only the files it needs: this is what the Docker image runs.
  output: "standalone"
};

export default nextConfig;
