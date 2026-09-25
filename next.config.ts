import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ./Containerfile copies .next/standalone at build
  // time and fails loudly without this - see that file's header comment.
  output: "standalone",
};

export default nextConfig;
