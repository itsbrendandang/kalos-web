import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Dockerfile copies .next/standalone at build time and fails loudly
  // without this - see its header comment.
  output: "standalone",
  // One upload-limit setting for server and browser: KALOS_MAX_UPLOAD_MB is inlined for the
  // browser preflight (lib/upload-limits.ts). Changing it needs a rebuild of the web image.
  env: { NEXT_PUBLIC_MAX_UPLOAD_MB: process.env.KALOS_MAX_UPLOAD_MB ?? "" },
  async redirects() {
    return [
      // The 2026-10 redesign moved every page into Campaign / Data / Library.
      { source: "/decide", destination: "/campaign/plan", permanent: true },
      { source: "/results", destination: "/campaign/learn", permanent: true },
      { source: "/analyze", destination: "/campaign/setup", permanent: true },
      { source: "/validate", destination: "/campaign/setup", permanent: true },
      { source: "/optimize", destination: "/campaign/plan", permanent: true },
      { source: "/experiments", destination: "/", permanent: true },
      { source: "/experiments/:path*", destination: "/", permanent: true },
      { source: "/planning", destination: "/", permanent: true },
      { source: "/scale-readout", destination: "/library/scale-up", permanent: true },
      { source: "/vessels", destination: "/library/vessels", permanent: true },
      { source: "/plate", destination: "/library/plate", permanent: true },
      { source: "/simulate", destination: "/library/simulator", permanent: true },
    ];
  },
};

export default nextConfig;
