import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // The Dockerfile copies .next/standalone at build time and fails loudly
  // without this - see its header comment.
  output: "standalone",
  // Native addon for the auth database (lib/server/auth-db.ts). Already on
  // Next's built-in external list; listed to document intent. The standalone
  // trace then copies only prebuilds/<platform>-<arch>.node of the BUILD host,
  // so the image must be built on the production platform (see Dockerfile).
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    agentUpgrade: "security",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
  async redirects() {
    return [
      // The 2026-11 engine-aligned redesign (docs/REDESIGN.md): campaigns live at
      // /campaigns/[id]; pages without an engine behind them were removed.
      { source: "/campaign", destination: "/", permanent: false },
      { source: "/campaign/:stage", destination: "/", permanent: false },
      { source: "/data", destination: "/", permanent: false },
      { source: "/projects", destination: "/", permanent: false },
      { source: "/projects/:path*", destination: "/", permanent: false },
      { source: "/library", destination: "/", permanent: false },
      { source: "/library/scale-up", destination: "/scale-up", permanent: true },
      { source: "/library/:path*", destination: "/", permanent: false },
      { source: "/scale-readout", destination: "/scale-up", permanent: true },
      // Older routes from before 2026-10.
      { source: "/decide", destination: "/", permanent: false },
      { source: "/results", destination: "/", permanent: false },
      { source: "/analyze", destination: "/", permanent: false },
      { source: "/validate", destination: "/", permanent: false },
      { source: "/optimize", destination: "/", permanent: false },
      { source: "/experiments", destination: "/", permanent: false },
      { source: "/experiments/:path*", destination: "/", permanent: false },
      { source: "/planning", destination: "/", permanent: false },
      { source: "/vessels", destination: "/", permanent: false },
      { source: "/plate", destination: "/", permanent: false },
      { source: "/simulate", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
