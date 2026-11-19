"use client";

/*
 * Reads for the Report page's engine-backed sections (raw-rows export, result
 * history and audit log, gates, setup) with one small state shape each, and
 * the plain copy for their refusals. Nothing here computes a statistic: the
 * engine's answers are kept as sent, and a failed read becomes an
 * `Unavailable` with the engine's code and a sentence, never an empty list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportRowsJson,
  getGates,
  getResultHistory,
  getSetup,
  type AuditItem,
  type GatesView,
  type ResultHistory,
  type ResultHistoryItem,
  type RowsExport,
  type SetupView,
} from "@/lib/api";
import { EngineError, errorMessage } from "@/lib/engine-error";
import type { PackageExtras, Unavailable } from "@/lib/report-package";

/** Copy for the report routes' own refusals (engine ENGINE_API_V2 section 9); anything else goes through errorMessage. */
const REPORT_COPY: Record<string, string> = {
  anonymized_export_unavailable:
    "The engine refused this export: it could not reproduce the anonymized column names this campaign's analysis uses, so exporting the rows could have revealed real names. It refused rather than risk a leak.",
  no_data: "This campaign has no data rows yet, so there is nothing to export.",
  export_too_large: "The export is larger than the engine will build in one response (its limit is 2,000,000 cells), so it declined.",
  engine_busy: "The engine is busy with another fit. Try again in a minute.",
};

/** A failed read as the package and the page show it: the engine's code and a plain sentence. */
export function unavailableFrom(err: unknown): Unavailable {
  if (err instanceof EngineError) {
    const reason = REPORT_COPY[err.code] ?? errorMessage(err).message;
    return { status: "unavailable", code: err.code, reason };
  }
  return { status: "unavailable", code: "engine_unreachable", reason: errorMessage(err).message };
}

/** The engine's own sentence for a failure, when it sent one (shown verbatim in a disclosure). */
export const engineDetail = (err: unknown): string | null => (err instanceof EngineError && err.detail ? err.detail : null);

export type Read<T> = { status: "loading" } | { status: "loaded"; data: T } | (Unavailable & { detail: string | null });

/** One engine read on mount, with a reload. Only the newest request may write state. */
export function useRead<T>(fetcher: () => Promise<T>): Read<T> & { reload: () => void } {
  const [state, setState] = useState<Read<T>>({ status: "loading" });
  const ticket = useRef(0);
  const run = useCallback(() => {
    const mine = ++ticket.current;
    fetcher().then(
      (data) => {
        if (mine === ticket.current) setState({ status: "loaded", data });
      },
      (err: unknown) => {
        if (mine === ticket.current) setState({ ...unavailableFrom(err), detail: engineDetail(err) });
      },
    );
  }, [fetcher]);
  // Unmount or a new fetcher: any answer still in flight is dropped.
  const invalidate = useCallback(() => {
    ticket.current++;
  }, []);
  useEffect(() => {
    run();
    return invalidate;
  }, [run, invalidate]);
  const reload = useCallback(() => {
    setState({ status: "loading" });
    run();
  }, [run]);
  return useMemo(() => ({ ...state, reload }), [state, reload]);
}

export function useRowsExport(id: string) {
  return useRead(useCallback(() => exportRowsJson(id), [id]));
}
export function useGates(id: string) {
  return useRead(useCallback(() => getGates(id), [id]));
}
export function useSetup(id: string) {
  return useRead(useCallback(() => getSetup(id), [id]));
}

/** A loaded read as a package extra; a read still in flight is left out (the package says it was not read). */
export function asExtra<T>(r: Read<T>): { status: "loaded"; data: T } | Unavailable | undefined {
  if (r.status === "loading") return undefined;
  if (r.status === "loaded") return { status: "loaded", data: r.data };
  return { status: "unavailable", code: r.code, reason: r.reason };
}

// --- Result history and audit log (one cursor per section) ------------------

export type HistorySection<T> = { items: T[]; hasMore: boolean; nextBeforeId: number | null; loadingMore: boolean; moreError: string | null };

export type HistoryState =
  | { status: "loading" }
  | (Unavailable & { detail: string | null })
  | { status: "loaded"; results: HistorySection<ResultHistoryItem>; audit: HistorySection<AuditItem>; notes: Record<string, string> };

export const HISTORY_PAGE = 50;

const section = <T,>(s: { items: T[]; has_more: boolean; next_before_id: number | null } | undefined): HistorySection<T> => ({
  items: s?.items ?? [],
  hasMore: s?.has_more === true && s.next_before_id != null,
  nextBeforeId: s?.next_before_id ?? null,
  loadingMore: false,
  moreError: null,
});

/** Newest first, as the engine sends them; older pages are appended (ids already shown are skipped). */
function appendPage<T extends { id: number }>(cur: HistorySection<T>, page: { items: T[]; has_more: boolean; next_before_id: number | null } | undefined): HistorySection<T> {
  const seen = new Set(cur.items.map((i) => i.id));
  const next = section(page);
  return { ...next, items: [...cur.items, ...next.items.filter((i) => !seen.has(i.id))] };
}

/** GET /results/history: the first page of both sections, then "Load older" per section through its own cursor. */
export function useResultHistory(id: string) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const load = useCallback(() => {
    setState({ status: "loading" });
    let live = true;
    getResultHistory(id, { section: "all", limit: HISTORY_PAGE }).then(
      (h) => {
        if (live) setState({ status: "loaded", results: section(h.results), audit: section(h.audit), notes: h.notes ?? {} });
      },
      (err: unknown) => {
        if (live) setState({ ...unavailableFrom(err), detail: engineDetail(err) });
      },
    );
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => load(), [load]);

  const loadOlder = useCallback(
    async (which: "results" | "audit") => {
      if (state.status !== "loaded" || state[which].loadingMore || !state[which].hasMore) return;
      const cursor = state[which].nextBeforeId;
      if (cursor == null) return;
      setState((s) => (s.status !== "loaded" ? s : { ...s, [which]: { ...s[which], loadingMore: true, moreError: null } }));
      try {
        const h: ResultHistory = await getResultHistory(id, {
          section: which,
          limit: HISTORY_PAGE,
          ...(which === "results" ? { resultsBeforeId: cursor } : { auditBeforeId: cursor }),
        });
        setState((s) => {
          if (s.status !== "loaded") return s;
          return which === "results" ? { ...s, results: appendPage(s.results, h.results) } : { ...s, audit: appendPage(s.audit, h.audit) };
        });
      } catch (err) {
        setState((s) => (s.status !== "loaded" ? s : { ...s, [which]: { ...s[which], loadingMore: false, moreError: unavailableFrom(err).reason } }));
      }
    },
    [id, state],
  );
  return { state, reload: load, loadOlder };
}

/**
 * Every page of both history sections, for the data package (the page shows
 * only what was paged in). Stops after `maxPages` requests per section and
 * says so (`complete: false`) rather than claiming a full history.
 */
export async function readFullHistory(id: string, maxPages = 20): Promise<NonNullable<PackageExtras["history"]>> {
  try {
    const first = await getResultHistory(id, { section: "all", limit: 500 });
    const results = [...(first.results?.items ?? [])];
    const audit = [...(first.audit?.items ?? [])];
    let pages = 1;
    let complete = true;
    for (const which of ["results", "audit"] as const) {
      let page = first[which];
      let n = 1;
      while (page?.has_more && page.next_before_id != null) {
        if (n >= maxPages) {
          complete = false;
          break;
        }
        const h = await getResultHistory(id, {
          section: which,
          limit: 500,
          ...(which === "results" ? { resultsBeforeId: page.next_before_id } : { auditBeforeId: page.next_before_id }),
        });
        page = h[which];
        n += 1;
        pages += 1;
        if (which === "results") results.push(...(h.results?.items ?? []));
        else audit.push(...(h.audit?.items ?? []));
      }
    }
    return { status: "loaded", results, audit, notes: first.notes ?? {}, complete, pages };
  } catch (err) {
    return unavailableFrom(err);
  }
}

export type { GatesView, RowsExport, SetupView };
