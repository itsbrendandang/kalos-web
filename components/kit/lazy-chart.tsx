"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Load a recharts-based chart on demand. recharts is large; a page that only
 * shows one chart below the fold should not ship it in the first load.
 * `ssr: false` because recharts measures its container in the browser; the
 * placeholder keeps the layout from jumping while the chunk loads.
 */
export function lazyChart<P extends object>(load: () => Promise<ComponentType<P>>) {
  return dynamic(load, {
    ssr: false,
    loading: () => <div aria-hidden className="h-64 w-full animate-pulse rounded-lg bg-subtle" />,
  });
}
