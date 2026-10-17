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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
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
