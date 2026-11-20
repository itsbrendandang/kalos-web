"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The width of a container, null until mounted (server render and first
 * client render), so a chart renders a fixed-height skeleton first and the
 * SVG once it knows its width. No dynamic import, no layout jump, no
 * hydration mismatch. A fixed `width` (report and print) skips measuring.
 */
export function useWidth<T extends HTMLElement = HTMLDivElement>(fixed?: number) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number | null>(fixed ?? null);
  useEffect(() => {
    if (fixed != null) return;
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(0, Math.floor(el.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixed]);
  return { ref, width: fixed ?? width };
}
