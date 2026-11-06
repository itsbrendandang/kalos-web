"use client";

// The run sheets this browser has loaded, kept in IndexedDB so the Data pages can show the rows of a sheet
// after a reload without sending it anywhere again. Keyed by the sha256 of the bytes, which is what the
// engine stamps on its analysis as `run.input_sha256`, so a stored sheet and an engine analysis can be
// joined without guessing. The engine keeps its own copy; forgetting a sheet here removes only this one.
//
// Every access is guarded: a browser without IndexedDB (or with site data blocked) reads as "no sheets"
// and writes are dropped, and the app works without the store.

import { useCallback, useEffect, useState } from "react";

const DB_NAME = "kalos-sheets";
const STORE = "sheets";
const VERSION = 1;

/** What the engine said about the sheet when it was uploaded, kept so the index can describe a sheet offline. */
export type SheetEngineFacts = {
  target: string;
  features: string[];
  n: number;
  d: number;
  dataset: string;
};

export type StoredSheet = {
  sha256: string;
  name: string;
  size: number;
  type: string;
  /** When this browser first loaded it (ms since epoch). */
  addedAt: number;
  /** The last upload of it from this browser. */
  lastUsedAt: number;
  /** The worksheet the engine read, for a workbook; null for a single-sheet file. */
  worksheet: string | null;
  engine: SheetEngineFacts | null;
  bytes: ArrayBuffer;
};

/** A stored sheet without its bytes: what the Data index lists. */
export type SheetSummary = Omit<StoredSheet, "bytes">;

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest({ name: "SHA-256" }, bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "sha256" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>, fallback: T): Promise<T> {
  const db = await open();
  if (!db) return fallback;
  try {
    const tx = db.transaction(STORE, mode);
    const out = await fn(tx.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return out;
  } catch {
    return fallback;
  } finally {
    db.close();
  }
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

/** Keep a sheet after the engine accepted it. Returns its sha256, or null when nothing could be stored. */
export async function rememberSheet(file: File, opts: { worksheet?: string | null; engine?: SheetEngineFacts | null } = {}): Promise<string | null> {
  try {
    const bytes = await file.arrayBuffer();
    const sha256 = await sha256Hex(bytes);
    const now = Date.now();
    const ok = await withStore(
      "readwrite",
      async (store) => {
        const prev = (await request(store.get(sha256))) as StoredSheet | undefined;
        const next: StoredSheet = {
          sha256,
          name: file.name,
          size: file.size,
          type: file.type,
          addedAt: prev?.addedAt ?? now,
          lastUsedAt: now,
          worksheet: opts.worksheet ?? prev?.worksheet ?? null,
          engine: opts.engine ?? prev?.engine ?? null,
          bytes,
        };
        await request(store.put(next));
        return true;
      },
      false,
    );
    if (ok) notify();
    return ok ? sha256 : null;
  } catch {
    return null;
  }
}

/** Every stored sheet, newest first, without bytes. */
export async function listSheets(): Promise<SheetSummary[]> {
  const all = await withStore("readonly", (store) => request(store.getAll()) as Promise<StoredSheet[]>, [] as StoredSheet[]);
  return all
    .map((s) => {
      const { bytes, ...rest } = s;
      void bytes;
      return rest;
    })
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function loadSheet(sha256: string): Promise<StoredSheet | null> {
  const found = await withStore("readonly", (store) => request(store.get(sha256)) as Promise<StoredSheet | undefined>, undefined);
  return found ?? null;
}

export async function forgetSheet(sha256: string): Promise<void> {
  const ok = await withStore(
    "readwrite",
    async (store) => {
      await request(store.delete(sha256));
      return true;
    },
    false,
  );
  if (ok) notify();
}

/** A `File` rebuilt from a stored sheet, so the browser-side readers (`readSheetRows`) can be reused as they are. */
export function sheetFile(sheet: StoredSheet): File {
  return new File([sheet.bytes], sheet.name, { type: sheet.type });
}

export type SheetListState = { status: "loading" } | { status: "ready"; sheets: SheetSummary[] };

/** The stored sheets, re-read whenever one is remembered or forgotten in this tab. */
export function useStoredSheets(): SheetListState {
  const [state, setState] = useState<SheetListState>({ status: "loading" });
  const read = useCallback(() => {
    let live = true;
    void listSheets().then((sheets) => {
      if (live) setState({ status: "ready", sheets });
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let cancel = read();
    const onChange = () => {
      cancel();
      cancel = read();
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      cancel();
    };
  }, [read]);
  return state;
}

export type StoredSheetState = { status: "loading" } | { status: "missing" } | { status: "ready"; sheet: StoredSheet; file: File };

/**
 * One stored sheet by sha256, with a `File` ready for the browser-side readers. Each result is tagged with
 * the sha it answers, so a slow read of an earlier sheet is never shown for the current one.
 */
export function useStoredSheet(sha256: string | null): StoredSheetState {
  const [result, setResult] = useState<{ sha256: string; state: StoredSheetState } | null>(null);
  useEffect(() => {
    if (!sha256) return;
    let live = true;
    void loadSheet(sha256).then((sheet) => {
      if (!live) return;
      setResult({ sha256, state: sheet ? { status: "ready", sheet, file: sheetFile(sheet) } : { status: "missing" } });
    });
    return () => {
      live = false;
    };
  }, [sha256]);
  if (!sha256) return { status: "missing" };
  return result && result.sha256 === sha256 ? result.state : { status: "loading" };
}
