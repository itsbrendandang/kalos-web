import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Dockerfile copies .next/standalone at build time and fails loudly
  // without this - see its header comment.
  output: "standalone",
  // The Projects surface lived under /voyager until it was renamed; keep old
  // links and bookmarks working. Two rules, because /voyager/projects/:id
  // moved up to /projects/:id rather than to /projects/projects/:id.
  async redirects() {
    return [
      { source: "/voyager", destination: "/projects", permanent: true },
      { source: "/voyager/projects/:path*", destination: "/projects/:path*", permanent: true },
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
