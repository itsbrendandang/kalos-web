"use client";

import { useSyncExternalStore } from "react";

/*
 * Theme preference: "light", "dark", or "system" (follow the OS). Stored in
 * localStorage under "theme" ("light" | "dark"; absent means system), which
 * the no-flash script in app/layout.tsx reads before first paint. The `dark`
 * class on <html> is what styles read.
 */

export type ThemePreference = "light" | "dark" | "system";

const KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked (private mode): the choice still applies to this page load.
  }
  apply(pref);
  listeners.forEach((l) => l());
}

/** Flip between light and dark from whatever is showing now. */
export function toggleTheme() {
  setThemePreference(document.documentElement.classList.contains("dark") ? "light" : "dark");
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia(DARK_QUERY);
  const onMedia = () => {
    if (read() === "system") apply("system");
  };
  media.addEventListener("change", onMedia);
  // Another tab changed the theme: apply it here too, then notify subscribers.
  const onStorage = () => {
    apply(read());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onMedia);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved preference; "system" during server render and hydration. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, read, () => "system");
}
