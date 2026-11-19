"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as api from "@/lib/api";
import {
  getCampaignAnalysis,
  getCampaignDetail,
  isJobActive,
  listCampaigns,
  type AnalyzeResult,
  type Campaign,
  type CampaignDetail,
  type CampaignMeta,
  type Job,
  type LatestResult,
  type UploadOptions,
} from "@/lib/api";
import { EngineError } from "@/lib/engine-error";
import { toRejection, type UploadRejection } from "@/components/campaign/plan-view";

/**
 * One engine read with honest states. `data` is the last good response and is
 * kept when a refresh fails, so callers decide: show it with a "refresh
 * failed" note, or let `error` win.
 *
 *  - status "loading": no answer yet (never shown as empty)
 *  - status "error":   the request failed and there is nothing to show
 *  - status "data":    `data` is set; `error` true means it is stale
 *
 * `failure` is the last thrown error (an EngineError carries the status, so a
 * 404 "no such campaign" can be told apart from a dropped connection).
 */
export type EngineResource<T> = {
  data: T | null;
  error: boolean;
  failure: unknown;
  status: "loading" | "error" | "data";
  /** A user-started refresh is in flight. */
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Replace `data` with a response a write already returned (e.g. `reanalyze()`), without refetching. */
  set: (next: T) => void;
};

function useEngineResource<T>(fetcher: () => Promise<T>): EngineResource<T> {
  const [state, setState] = useState<{ data: T | null; error: boolean; failure: unknown }>({ data: null, error: false, failure: null });
  const [refreshing, setRefreshing] = useState(false);
  // Every request takes a ticket; only the newest one may write state, so a
  // slow early response never overwrites a newer one.
  const ticket = useRef(0);

  const request = useCallback(
    () => fetcher().then((data) => ({ ok: true as const, data }), (failure: unknown) => ({ ok: false as const, failure })),
    [fetcher],
  );
  const settle = useCallback((mine: number, outcome: { ok: true; data: T } | { ok: false; failure: unknown }) => {
    if (mine !== ticket.current) return;
    setState((s) => (outcome.ok ? { data: outcome.data, error: false, failure: null } : { data: s.data, error: true, failure: outcome.failure }));
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
    setState({ data: next, error: false, failure: null });
    setRefreshing(false); // a refresh this supersedes no longer clears it itself
  }, []);

  const status = state.data != null ? "data" : state.error ? "error" : "loading";
  return { ...state, status, refreshing, refresh, set };
}

/** True when a resource failed because the engine said the thing does not exist (or is not visible to this tenant). */
export const isNotFound = (r: Pick<EngineResource<unknown>, "failure">): boolean => r.failure instanceof EngineError && r.failure.status === 404;

// --- Campaign list (app-wide) -------------------------------------------------

const CampaignsContext = createContext<EngineResource<CampaignMeta[]> | null>(null);

/** Mounted once by the app shell: the tenant's campaigns (archived ones excluded). */
export function CampaignsProvider({ children }: { children: ReactNode }) {
  const fetcher = useCallback(() => listCampaigns(false), []);
  const campaigns = useEngineResource(fetcher);
  return <CampaignsContext.Provider value={campaigns}>{children}</CampaignsContext.Provider>;
}

/** GET /api/campaigns. */
export function useCampaigns(): EngineResource<CampaignMeta[]> {
  const c = useContext(CampaignsContext);
  if (!c) throw new Error("useCampaigns needs <CampaignsProvider> (mounted by the app shell)");
  return c;
}

// --- One campaign -------------------------------------------------------------

/**
 * The last upload the engine rejected in this browser session, or null. The
 * engine keeps its previous analysis when it rejects a sheet, so pages that
 * read the analysis (Predict) need this to say the batch is from the earlier
 * file, or why there is no batch at all (e.g. `target_constant`). In memory
 * only: a reload forgets it, because the engine does not report it.
 */
type LastRejection = { rejection: UploadRejection | null; setRejection: (r: UploadRejection | null) => void };

/** How an upload job ended, as the page needs it. */
export type UploadOutcome =
  | { kind: "refused"; result: AnalyzeResult }
  | { kind: "succeeded"; job: Job }
  | { kind: "failed"; job: Job }
  | { kind: "cancelled"; job: Job };

export type UploadTracker = {
  /** The newest upload job known for this campaign: active, or finished in this session (until dismissed). */
  job: Job | null;
  /** Polling the job failed repeatedly; the job may still be running on the engine. */
  pollTrouble: boolean;
  /** Submit an upload job and resolve when it ends. Throws CampaignHasRunsError / EngineError like lib/api. */
  submit: (file: File, opts?: UploadOptions) => Promise<UploadOutcome>;
  cancel: () => Promise<void>;
  dismiss: () => void;
};

export type ReanalysisState = { running: boolean; startedAt: number | null };

type EngineData = {
  campaignId: string;
  detail: EngineResource<CampaignDetail>;
  latest: EngineResource<LatestResult>;
  campaign: EngineResource<Campaign>;
  upload: UploadTracker;
  reanalysis: ReanalysisState;
  runReanalysis: () => Promise<{ analysis: api.PopulatedResult; campaign: Campaign }>;
} & LastRejection;

const EngineContext = createContext<EngineData | null>(null);

// The engine reports progress only at stage boundaries, so a 2.5 s poll loses nothing and keeps a long
// job well inside the proxy's per-session rate limit (120 requests a minute).
const POLL_MS = 2500;
const TERMINAL: readonly Job["state"][] = ["succeeded", "failed", "cancelled", "timed_out"];

/**
 * Mounted by the app shell for the campaign in the URL (keyed by its id), so
 * the sidebar and every page read the same responses: after a page writes
 * (starts runs, logs a result, re-analyzes) everything updates together. An
 * upload job and a re-analysis live here, not in a page, so they keep running
 * and stay visible while the user moves between the campaign's pages.
 */
export function EngineDataProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const detailFetcher = useCallback(() => getCampaignDetail(campaignId), [campaignId]);
  const latestFetcher = useCallback(() => getCampaignAnalysis(campaignId), [campaignId]);
  const detail = useEngineResource(detailFetcher);
  const latest = useEngineResource(latestFetcher);
  const campaigns = useContext(CampaignsContext);
  const [rejection, setRejection] = useState<UploadRejection | null>(null);

  // The summary as its own resource, so pages keep reading `useCampaign()`.
  const { set: setDetail } = detail;
  const detailData = detail.data;
  const setSummary = useCallback(
    (next: Campaign) => {
      if (detailData) setDetail({ campaign: detailData.campaign, summary: next });
    },
    [detailData, setDetail],
  );
  const campaign: EngineResource<Campaign> = useMemo(
    () => ({ ...detail, data: detail.data?.summary ?? null, set: setSummary }),
    [detail, setSummary],
  );

  // --- Upload job ---
  const [job, setJob] = useState<Job | null>(null);
  const [pollTrouble, setPollTrouble] = useState(false);
  const waiters = useRef(new Map<string, ((j: Job) => void)[]>());
  const { refresh: refreshLatest } = latest;
  const { refresh: refreshDetail } = detail;
  const refreshCampaigns = campaigns?.refresh;

  // Resume an upload already running on the engine (another tab, or before a reload).
  useEffect(() => {
    let cancelled = false;
    api.listJobs(campaignId, 1).then(
      (jobs) => {
        if (!cancelled && jobs[0] && isJobActive(jobs[0])) setJob((cur) => cur ?? jobs[0]);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const activeJobId = job && isJobActive(job) ? job.id : null;
  useEffect(() => {
    if (!activeJobId) return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await api.getJob(activeJobId);
        failures = 0;
        setPollTrouble(false);
        if (stopped) return;
        setJob(j);
        if (TERMINAL.includes(j.state)) {
          if (j.state === "succeeded") await Promise.all([refreshLatest(), refreshDetail(), refreshCampaigns?.()]);
          for (const w of waiters.current.get(j.id) ?? []) w(j);
          waiters.current.delete(j.id);
          return;
        }
      } catch {
        failures += 1;
        if (failures >= 3) setPollTrouble(true);
      }
      if (!stopped) timer = setTimeout(tick, Math.min(POLL_MS * 2 ** Math.max(0, failures - 2), 15_000));
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [activeJobId, refreshLatest, refreshDetail, refreshCampaigns]);

  const submit = useCallback(
    async (file: File, opts: UploadOptions = {}): Promise<UploadOutcome> => {
      const out = await api.submitUploadJob(campaignId, file, opts);
      if ("refused" in out) return { kind: "refused", result: out.refused };
      const done = new Promise<Job>((resolve) => {
        const list = waiters.current.get(out.job.id) ?? [];
        waiters.current.set(out.job.id, [...list, resolve]);
      });
      setPollTrouble(false);
      setJob(out.job);
      const j = await done;
      if (j.state === "succeeded") return { kind: "succeeded", job: j };
      if (j.state === "cancelled") return { kind: "cancelled", job: j };
      return { kind: "failed", job: j };
    },
    [campaignId],
  );
  const cancel = useCallback(async () => {
    if (!job || !isJobActive(job)) return;
    const j = await api.cancelJob(job.id);
    setJob(j);
  }, [job]);
  const dismiss = useCallback(() => setJob((j) => (j && isJobActive(j) ? j : null)), []);
  const upload: UploadTracker = useMemo(() => ({ job, pollTrouble, submit, cancel, dismiss }), [job, pollTrouble, submit, cancel, dismiss]);

  // --- Re-analysis (synchronous on the engine; tracked here so it survives navigation) ---
  const [reanalysis, setReanalysis] = useState<ReanalysisState>({ running: false, startedAt: null });
  const inflight = useRef<Promise<{ analysis: api.PopulatedResult; campaign: Campaign }> | null>(null);
  const runReanalysis = useCallback(() => {
    if (inflight.current) return inflight.current;
    setReanalysis({ running: true, startedAt: Date.now() });
    const p = (async () => {
      try {
        const out = await api.reanalyzeCampaign(campaignId);
        await Promise.all([refreshDetail(), refreshLatest()]);
        return out;
      } finally {
        inflight.current = null;
        setReanalysis({ running: false, startedAt: null });
      }
    })();
    inflight.current = p;
    return p;
  }, [campaignId, refreshDetail, refreshLatest]);

  const value: EngineData = { campaignId, detail, latest, campaign, upload, reanalysis, runReanalysis, rejection, setRejection };
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

function useEngineData(): EngineData {
  const data = useContext(EngineContext);
  if (!data) throw new Error("campaign hooks need <EngineDataProvider> (mounted by the app shell inside /campaigns/[id])");
  return data;
}

/** The campaign in the URL, or null outside a campaign. */
export function useOptionalCampaignData(): EngineData | null {
  return useContext(EngineContext);
}

/** The id of the campaign in the URL. */
export function useCampaignId(): string {
  return useEngineData().campaignId;
}

/** GET /api/campaigns/{id}: identity, lifecycle and summary. */
export function useCampaignDetail(): EngineResource<CampaignDetail> {
  return useEngineData().detail;
}

/** GET /api/campaigns/{id}/analysis: the current analysis (or `{ has_data: false }`). */
export function useLatest(): EngineResource<LatestResult> {
  return useEngineData().latest;
}

/** The campaign summary (stage, next action, best, history, pending runs). */
export function useCampaign(): EngineResource<Campaign> {
  return useEngineData().campaign;
}

/** The upload job for this campaign: progress from the engine, cancel, and the outcome. */
export function useUploadJob(): UploadTracker {
  return useEngineData().upload;
}

/** Whether a re-analysis is running for this campaign (it survives page navigation). */
export function useReanalysis(): ReanalysisState {
  return useEngineData().reanalysis;
}

/** The last rejected upload this session, and a way to dismiss it (e.g. "keep planning from the previous sheet"). */
export function useLastRejection(): LastRejection {
  const { rejection, setRejection } = useEngineData();
  return { rejection, setRejection };
}

/** Engine refusal codes that describe the sheet itself (rendered inline like a 400, not as a service failure). */
const SHEET_CODES = new Set(["too_few_rows", "too_few_complete_rows", "target_constant", "no_process_inputs", "too_many_fit_rows", "parse_error", "fit_failed", "empty_file", "unsupported_file_type", "corrupt_excel", "ambiguous_header", "sheet_not_found"]);

/*
 * The one write path. Pages must call these instead of the lib/api writes so
 * the sidebar, overview and every page update without a reload:
 *
 *   const { runFile, startRuns, logResult, reanalyze } = useEngineWrites();
 *
 *   runFile(file, target?, roles?, sheet?, { replace? }) -> AnalyzeResult
 *       Submits a background job and resolves when it ends. A sheet the engine refuses (before or during the
 *       job) resolves to `{ error, code, sheets? }` like /api/run's 400; a 409 throws CampaignHasRunsError;
 *       service failures and a cancel throw EngineError. Progress is on useUploadJob().
 *   startRuns(recipes)               -> void      (refreshes the campaign)
 *   logResult(id, value, reason?)    -> void      (refreshes the campaign; a correction needs a reason)
 *   reanalyze()                      -> { analysis, campaign }
 */
export function useEngineWrites() {
  const { campaignId, latest, detail, upload, runReanalysis, setRejection } = useEngineData();
  const { refresh: refreshLatest } = latest;
  const { refresh: refreshDetail } = detail;
  const { submit } = upload;
  const shown = latest.data?.has_data ? latest.data.dataset : null;

  const runFile = useCallback(
    async (file: File, target?: string, roles?: api.ColumnRolesInput, sheet?: string, opts?: { replace?: boolean }): Promise<AnalyzeResult> => {
      const out = await submit(file, { target, roles, sheet, replace: opts?.replace });
      if (out.kind === "refused") {
        setRejection(toRejection(file.name, out.result, shown));
        return out.result;
      }
      if (out.kind === "cancelled") throw new EngineError(0, "job_cancelled");
      if (out.kind === "failed") {
        const err = out.job.error ?? { code: out.job.state === "timed_out" ? "timeout" : "analysis_failed", message: "" };
        if (SHEET_CODES.has(err.code)) {
          const refused = { error: err.message || err.code, code: err.code } as unknown as AnalyzeResult;
          setRejection(toRejection(file.name, refused, shown));
          return refused;
        }
        throw new EngineError(0, err.code, undefined, err.message || undefined);
      }
      setRejection(null);
      const fresh = await getCampaignAnalysis(campaignId);
      latest.set(fresh);
      if (!fresh.has_data) throw new EngineError(0, "engine_error");
      return fresh;
    },
    [submit, setRejection, shown, campaignId, latest],
  );
  const startRuns = useCallback(
    async (recipes: api.StartRecipe[]) => {
      await api.startCampaignRuns(campaignId, recipes);
      await refreshDetail();
    },
    [campaignId, refreshDetail],
  );
  const logResult = useCallback(
    async (id: string, value: number, reason?: string): Promise<api.CampaignRun> => {
      const run = await api.recordCampaignResult(campaignId, id, value, reason);
      await refreshDetail();
      return run;
    },
    [campaignId, refreshDetail],
  );
  const reanalyze = useCallback(() => runReanalysis(), [runReanalysis]);
  const refreshAll = useCallback(() => Promise.all([refreshLatest(), refreshDetail()]).then(() => undefined), [refreshLatest, refreshDetail]);

  return { runFile, startRuns, logResult, reanalyze, refreshAll };
}
