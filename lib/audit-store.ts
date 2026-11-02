"use client";

import { useSyncExternalStore } from "react";
import { coalesce, makeEntry, type AuditEntry, type AuditEvent } from "@/lib/audit";

const KEY = "kalos.audit.v1";
const listeners = new Set<() => void>();
const EMPTY: AuditEntry[] = [];
let cachedRaw: string | null | undefined;
let cached: AuditEntry[] = EMPTY;

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function parse(raw: string | null): AuditEntry[] {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as AuditEntry[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readAudit(): AuditEntry[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

let pending: AuditEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

/** Queue changes. They are flushed together after a short pause so typing is one entry; the log itself is append-only. */
export function recordAudit(events: AuditEvent[]): void {
  if (!events.length) return;
  pending.push(...events);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushAudit, 1500);
}

export function flushAudit(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const batch = coalesce(pending);
  pending = [];
  if (!batch.length) return chain;
  chain = chain.then(async () => {
    const entries = [...parse(localStorage.getItem(KEY))];
    for (const ev of batch) entries.push(await makeEntry(entries[entries.length - 1] ?? null, ev, new Date(), sha256));
    localStorage.setItem(KEY, JSON.stringify(entries));
    listeners.forEach((l) => l());
  });
  return chain;
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => void flushAudit());

export function useAudit(): AuditEntry[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
    },
    readAudit,
    () => EMPTY,
  );
}
