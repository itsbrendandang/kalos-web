"use client";

import { useSyncExternalStore } from "react";

/*
 * How much of the app a person sees. "simple": Overview is a conversation
 * with Kalos and the sidebar is short; the full pages are one link away.
 * "full": every page as it is. Saved on this device under "kalos.view",
 * the same way the theme is; the sidebar footer and Settings both set it.
 */

export type ViewMode = "simple" | "full";

const KEY = "kalos.view";
const listeners = new Set<() => void>();

function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === "full" ? "full" : "simple";
  } catch {
    return "simple";
  }
}

export function setViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage blocked: the choice still applies to this page load.
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The current view. Before the browser answers (server render), "simple". */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, read, () => "simple");
}

export const VIEW_MODES: { value: ViewMode; label: string; description: string }[] = [
  { value: "simple", label: "Simple", description: "Overview is a conversation with Kalos. The full pages are one link away." },
  { value: "full", label: "Full", description: "Every page, chart and table, as before." },
];
