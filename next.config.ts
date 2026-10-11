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
    ];
  },
};

export default nextConfig;
