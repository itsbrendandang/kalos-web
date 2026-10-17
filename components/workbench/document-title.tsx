"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { documentTitle } from "@/lib/route-metadata";

/**
 * Keeps document.title in step with the route for pages that cannot export
 * metadata (client pages with no layout: Overview, Setup). Other routes get
 * the same title from their layout's metadata, so this is a no-op for them.
 * Project pages title themselves.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/projects")) return;
    const title = documentTitle(pathname);
    document.title = title;
    // On a hard load, Next re-applies the root metadata title right after
    // hydration; set ours again once that has settled.
    const timer = window.setTimeout(() => {
      if (document.title !== title) document.title = title;
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}
