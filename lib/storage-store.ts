"use client";

import { useSyncExternalStore } from "react";

/**
 * A per-viewer convenience kept in localStorage or sessionStorage (explorer
 * collapsed, open tabs). Storage can be missing or throw (private mode,
 * blocked site data), so every access is guarded and the app works without
 * it. Server render and hydration use `initial`; the stored value applies
 * right after, with no hydration mismatch.
 */
export function createStorageStore<T>(area: "local" | "session", key: string, parse: (raw: string | null) => T, initial: T) {
  const listeners = new Set<() => void>();
  let value: T | undefined;

  const storage = () => (area === "local" ? window.localStorage : window.sessionStorage);

  function get(): T {
    if (value === undefined) {
      try {
        value = parse(storage().getItem(key));
      } catch {
        value = initial;
      }
    }
    return value;
  }

  function set(next: T) {
    value = next;
    try {
      storage().setItem(key, JSON.stringify(next));
    } catch {
      // Not persisted; still applies to this page.
    }
    listeners.forEach((l) => l());
  }

  function subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, () => initial);
  }

  return { get, set, useValue };
}
