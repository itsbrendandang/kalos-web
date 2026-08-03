import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Codex desktop preview opens the local app as 127.0.0.1 while Next's
  // dev server identifies itself as localhost. Allow that loopback-only
  // origin so hot reload works during local visual QA.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
