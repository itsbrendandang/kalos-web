import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // deploy/Dockerfile.web (kalos repo) copies .next/standalone at build
  // time and fails loudly without this - see that file's header comment.
  output: "standalone",
};

export default nextConfig;
