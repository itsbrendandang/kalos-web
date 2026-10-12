"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // slow early response never overwrites a newer one, and unmount drops all.
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const data = await fetcher();
      if (mine === ticket.current) setState({ data, error: false });
    } catch {
      if (mine === ticket.current) setState((s) => ({ data: s.data, error: true }));
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
    return () => {
      ticket.current++;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const set = useCallback((next: T) => {
    ticket.current++;
    setState({ data: next, error: false });
  }, []);

  const status = state.data != null ? "data" : state.error ? "error" : "loading";
  return { ...state, status, refreshing, refresh, set };
}

/** GET /api/latest: the most recent analysis (or `{ has_data: false }`). */
export function useLatest(): EngineResource<LatestResult> {
  return useEngineResource(getLatest);
}

/** GET /api/campaign: the live campaign (or `{ has_campaign: false }`). */
export function useCampaign(): EngineResource<Campaign> {
  return useEngineResource(getCampaign);
}
