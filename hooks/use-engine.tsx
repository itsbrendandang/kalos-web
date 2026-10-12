"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getCampaign, getLatest, type Campaign, type LatestResult } from "@/lib/api";

/**
 * One engine read with honest states. `data` is the last good response and is
 * kept when a refresh fails, so callers decide: show it with a "refresh
 * failed" note, or (like the workbench's `campaignView`) let `error` win.
 *
 *  - status "loading": no answer yet (never shown as empty)
 *  - status "error":   the request failed and there is nothing to show
 *  - status "data":    `data` is set; `error` true means it is stale
 */
export type EngineResource<T> = {
  data: T | null;
  error: boolean;
  status: "loading" | "error" | "data";
  /** A user-started refresh is in flight. */
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Replace `data` with a response a write already returned (e.g. `reanalyze()`), without refetching. */
  set: (next: T) => void;
};

function useEngineResource<T>(fetcher: () => Promise<T>): EngineResource<T> {
  const [state, setState] = useState<{ data: T | null; error: boolean }>({ data: null, error: false });
  const [refreshing, setRefreshing] = useState(false);
  // Every request takes a ticket; only the newest one may write state, so a
  // slow early response never overwrites a newer one.
  const ticket = useRef(0);

  const request = useCallback(
    () => fetcher().then((data) => ({ ok: true as const, data }), () => ({ ok: false as const })),
    [fetcher],
  );
  const settle = useCallback((mine: number, outcome: { ok: true; data: T } | { ok: false }) => {
    if (mine !== ticket.current) return;
    setState((s) => (outcome.ok ? { data: outcome.data, error: false } : { data: s.data, error: true }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const mine = ++ticket.current;
    request().then((outcome) => {
      if (!cancelled) settle(mine, outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [request, settle]);

  const refresh = useCallback(async () => {
    const mine = ++ticket.current;
    setRefreshing(true);
    settle(mine, await request());
    setRefreshing(false);
  }, [request, settle]);

  const set = useCallback((next: T) => {
    ticket.current++;
    setState({ data: next, error: false });
  }, []);

  const status = state.data != null ? "data" : state.error ? "error" : "loading";
  return { ...state, status, refreshing, refresh, set };
}

type EngineData = { latest: EngineResource<LatestResult>; campaign: EngineResource<Campaign> };

const EngineContext = createContext<EngineData | null>(null);

/**
 * Mounted once by the app shell, so the explorer, the status bar and every
 * page read the same two responses: after a page writes (starts runs, logs a
 * result, re-analyzes) and refreshes or `set`s, everything updates together.
 */
export function EngineDataProvider({ children }: { children: ReactNode }) {
  const latest = useEngineResource(getLatest);
  const campaign = useEngineResource(getCampaign);
  return <EngineContext.Provider value={{ latest, campaign }}>{children}</EngineContext.Provider>;
}

function useEngineData(): EngineData {
  const data = useContext(EngineContext);
  if (!data) throw new Error("useLatest/useCampaign need <EngineDataProvider> (mounted by the app shell)");
  return data;
}

/** GET /api/latest: the most recent analysis (or `{ has_data: false }`). */
export function useLatest(): EngineResource<LatestResult> {
  return useEngineData().latest;
}

/** GET /api/campaign: the live campaign (or `{ has_campaign: false }`). */
export function useCampaign(): EngineResource<Campaign> {
  return useEngineData().campaign;
}
