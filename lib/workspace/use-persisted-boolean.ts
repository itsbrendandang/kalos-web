"use client";

import { useCallback, useSyncExternalStore } from "react";

// Same external-store mechanism ThemeToggle (components/theme-toggle.tsx)
// uses for the `dark` class: useSyncExternalStore instead of
// useEffect+setState, so the server and first client render always agree
// (getServerSnapshot is a constant) and there is no "set state synchronously
// inside an effect" to reconcile with react-hooks' set-state-in-effect rule.
const listeners = new Map<string, Set<() => void>>();

function readStored(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === "1";
  } catch {
    // localStorage unavailable (private mode, disabled storage) - fall back
    // to the default for this session.
    return defaultValue;
  }
}

function notify(key: string) {
  listeners.get(key)?.forEach((cb) => cb());
}

/** A boolean persisted to localStorage under `key`. Used for `railOpen` and
 *  `askOpen`, both of which default true and are read/written from a single
 *  browser tab, so a plain module-level listener set (no storage-event
 *  cross-tab sync) is enough. */
export function usePersistedBoolean(key: string, defaultValue: boolean): [boolean, (next: boolean) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(onChange);
      return () => set.delete(onChange);
    },
    [key],
  );

  const getSnapshot = useCallback(() => readStored(key, defaultValue), [key, defaultValue]);
  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // localStorage unavailable - the toggle still works for this load,
        // it just won't persist across a reload.
      }
      notify(key);
    },
    [key],
  );

  return [value, set];
}
