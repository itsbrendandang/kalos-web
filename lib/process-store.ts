"use client";

import { useSyncExternalStore } from "react";
import { diffMaps } from "@/lib/audit";
import { recordAudit } from "@/lib/audit-store";
import { mabTemplate, parseStored, STORAGE_KEY, type ProcessMap } from "@/lib/process";

/** The process map lives in this browser's storage (on this device). A tiny external store so every tab and component sees one copy. */
let cachedRaw: string | null | undefined;
let cached: ProcessMap | null = null;
const listeners = new Set<() => void>();
const SERVER: ProcessMap | null = null;

function read(): ProcessMap | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseStored(raw);
  }
  return cached;
}

export function saveMap(m: ProcessMap): void {
  recordAudit(diffMaps(read(), m));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  listeners.forEach((l) => l());
}

export function clearMap(): void {
  recordAudit(diffMaps(read(), null));
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((l) => l());
}

export function useProcessMap(): { map: ProcessMap | null; ready: boolean } {
  const stored = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => SERVER,
  );
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  return { map: stored, ready };
}

export const freshMap = mabTemplate;
