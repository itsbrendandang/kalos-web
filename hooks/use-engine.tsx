"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as api from "@/lib/api";
import { getCampaign, getLatest, type AnalyzeResult, type Campaign, type LatestResult } from "@/lib/api";
import type { UploadRejection } from "@/components/campaign/plan-view";

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
    if (mine === ticket.current) setRefreshing(false);
  }, [request, settle]);

  const set = useCallback((next: T) => {
    ticket.current++;
    setState({ data: next, error: false });
    setRefreshing(false); // a refresh this supersedes no longer clears it itself
  }, []);

  const status = state.data != null ? "data" : state.error ? "error" : "loading";
  return { ...state, status, refreshing, refresh, set };
}

/**
 * The last upload the engine rejected in this browser session, or null. The
 * engine keeps its previous analysis when it rejects a sheet, so pages that
 * read /api/latest (Plan) need this to say the batch is from the earlier file,
 * or why there is no batch at all (e.g. `target_constant`). In memory only:
 * a reload forgets it, because the engine does not report it.
 */
type LastRejection = { rejection: UploadRejection | null; setRejection: (r: UploadRejection | null) => void };

type EngineData = { latest: EngineResource<LatestResult>; campaign: EngineResource<Campaign> } & LastRejection;

/** The structured fields of a rejected-upload body (`{ error, code, target, target_summary, available_targets }`). */
function toRejection(file: File, d: AnalyzeResult): UploadRejection {
  const extra = d as AnalyzeResult & { target_summary?: UploadRejection["targetSummary"]; available_targets?: unknown };
  return {
    name: file.name,
    code: typeof d.code === "string" ? d.code : null,
    error: d.error ?? "",
    target: typeof d.target === "string" ? d.target : undefined,
    targetSummary: extra.target_summary && typeof extra.target_summary === "object" ? extra.target_summary : undefined,
    availableTargets: Array.isArray(extra.available_targets) ? extra.available_targets.filter((t): t is string => typeof t === "string") : undefined,
  };
}

const EngineContext = createContext<EngineData | null>(null);

/**
 * Mounted once by the app shell, so the explorer, the status bar and every
 * page read the same two responses: after a page writes (starts runs, logs a
 * result, re-analyzes) and refreshes or `set`s, everything updates together.
 */
export function EngineDataProvider({ children }: { children: ReactNode }) {
  const latest = useEngineResource(getLatest);
  const campaign = useEngineResource(getCampaign);
  const [rejection, setRejection] = useState<UploadRejection | null>(null);
  return <EngineContext.Provider value={{ latest, campaign, rejection, setRejection }}>{children}</EngineContext.Provider>;
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

/** The last rejected upload this session, and a way to dismiss it (e.g. "keep planning from the previous sheet"). */
export function useLastRejection(): LastRejection {
  const { rejection, setRejection } = useEngineData();
  return { rejection, setRejection };
}

/*
 * The one write path. Pages must call these instead of the lib/api writes so
 * the status bar, Explorer stages and Next card update without a reload:
 *
 *   const { runFile, startRuns, logResult, reanalyze } = useEngineWrites();
 *
 *   runFile(file, target?, roles?, sheet?)  -> AnalyzeResult   (same contract as lib/api runFile; refreshes latest + campaign unless the engine rejected the upload)
 *   startRuns(recipes)      -> void            (refreshes campaign)
 *   logResult(id, value)    -> void            (refreshes campaign)
 *   reanalyze()             -> { analysis, campaign }  (sets campaign from the response, refreshes latest)
 *
 * Each throws exactly as the lib/api function does and updates the provider
 * only after the write succeeded. Read state with useLatest()/useCampaign().
 */
export function useEngineWrites() {
  const { latest, campaign, setRejection } = useEngineData();
  const { refresh: refreshLatest } = latest;
  const { refresh: refreshCampaign, set: setCampaign } = campaign;

  const runFile = useCallback(
    async (file: File, target?: string, roles?: api.ColumnRolesInput, sheet?: string) => {
      const d = await api.runFile(file, target, roles, sheet);
      setRejection(d.error ? toRejection(file, d) : null);
      if (!d.error) await Promise.all([refreshLatest(), refreshCampaign()]);
      return d;
    },
    [refreshLatest, refreshCampaign, setRejection],
  );
  const startRuns = useCallback(
    async (recipes: api.StartRecipe[]) => {
      await api.startRuns(recipes);
      await refreshCampaign();
    },
    [refreshCampaign],
  );
  const logResult = useCallback(
    async (id: string, value: number) => {
      await api.logResult(id, value);
      await refreshCampaign();
    },
    [refreshCampaign],
  );
  const reanalyze = useCallback(async () => {
    const out = await api.reanalyze();
    setCampaign(out.campaign);
    await refreshLatest();
    return out;
  }, [setCampaign, refreshLatest]);

  return { runFile, startRuns, logResult, reanalyze };
}
