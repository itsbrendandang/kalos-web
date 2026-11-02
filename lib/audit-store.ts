"use client";

import { useEffect, useSyncExternalStore } from "react";
import { coalesce, makeEntry, type AuditEntry, type AuditEvent } from "@/lib/audit";
import { ENGINE_CSRF_HEADER, ENGINE_CSRF_VALUE } from "@/lib/engine-csrf";

/*
 * Where the history lives: in a file in the Kalos state folder when the app runs
 * on this device (/api/audit), otherwise in this browser's storage. Both use the
 * same hash chain. The file is the record; the browser copy is only the fallback.
 */
const KEY = "kalos.audit.v1";
const listeners = new Set<() => void>();
const EMPTY: AuditEntry[] = [];
let entries: AuditEntry[] = EMPTY;
let where: "file" | "browser" | "unknown" = "unknown";

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function parseLocal(): AuditEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as AuditEntry[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function publish(next: AuditEntry[]): void {
  entries = next;
  listeners.forEach((l) => l());
}

/** Load the history from wherever it lives. */
export async function refreshAudit(): Promise<void> {
  try {
    const r = await fetch("/api/audit", { cache: "no-store" });
    if (r.ok) {
      where = "file";
      const j = (await r.json()) as { entries?: AuditEntry[] };
      return publish(Array.isArray(j.entries) ? j.entries : EMPTY);
    }
  } catch {
    // fall through to the browser copy
  }
  where = "browser";
  publish(parseLocal());
}

let pending: AuditEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

/** Queue changes. They are flushed together after a short pause so typing is one entry; the log itself is append-only. */
export function recordAudit(events: AuditEvent[]): void {
  if (typeof window === "undefined" || !events.length) return;
  pending.push(...events);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushAudit(), 1500);
}

export function flushAudit(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const batch = coalesce(pending);
  pending = [];
  if (!batch.length) return chain;
  chain = chain.then(async () => {
    try {
      const r = await fetch("/api/audit", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json", [ENGINE_CSRF_HEADER]: ENGINE_CSRF_VALUE },
        body: JSON.stringify({ events: batch.map((e) => ({ action: e.action, detail: e.detail })) }),
      });
      if (r.ok) { where = "file"; return refreshAudit(); }
    } catch {
      // fall through to the browser copy
    }
    try {
      const list = [...parseLocal()];
      for (const ev of batch) list.push(await makeEntry(list[list.length - 1] ?? null, ev, new Date(), sha256));
      localStorage.setItem(KEY, JSON.stringify(list));
      where = "browser";
      publish(list);
    } catch {
      // Storage unavailable: the change itself is unaffected.
    }
  });
  return chain;
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => void flushAudit());

export function useAudit(): { entries: AuditEntry[]; where: "file" | "browser" | "unknown" } {
  const list = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => entries,
    () => EMPTY,
  );
  useEffect(() => { void refreshAudit(); }, []);
  return { entries: list, where };
}
