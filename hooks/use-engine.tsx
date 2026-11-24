"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as api from "@/lib/api";
import {
  getCampaignAnalysis,
  getCampaignDetail,
  isJobActive,
  listAllCampaignSummaries,
  type AnalyzeResult,
  type Campaign,
  type CampaignDetail,
  type CampaignSummaryRow,
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
  /** Apply an acknowledged write to the last good snapshot (keeping `error`), superseding any read in flight. */
  update: (change: (current: T | null) => T | null) => void;
};

export function useEngineResource<T>(fetcher: () => Promise<T>): EngineResource<T> {
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

  const update = useCallback((change: (current: T | null) => T | null) => {
    ticket.current++;
    setState((s) => ({ ...s, data: change(s.data) }));
    setRefreshing(false);
  }, []);

  const status = state.data != null ? "data" : state.error ? "error" : "loading";
  return { ...state, status, refreshing, refresh, set, update };
}

/** True when a resource failed because the engine said the thing does not exist (or is not visible to this tenant). */
export const isNotFound = (r: Pick<EngineResource<unknown>, "failure">): boolean => r.failure instanceof EngineError && r.failure.status === 404;

// --- Campaign list (app-wide) -------------------------------------------------

/** The campaign list; `more` is true when the engine had pages beyond the ones read (see CampaignsProvider). */
export type CampaignsResource = EngineResource<CampaignSummaryRow[]> & { more: boolean };

const CampaignsContext = createContext<CampaignsResource | null>(null);

/**
 * Mounted once by the app shell: the tenant's campaigns (archived ones
 * excluded) with the engine's summary fields (best measured, reliability,
 * goal, stage, latest gate decision, active job), from the summary list
 * (GET /api/campaigns?summary=true, 200 per page), never a request per
 * campaign. Pages are followed through `next_cursor`; past the page cap the
 * list says it is partial (`more`) rather than look complete.
 */
export function CampaignsProvider({ children }: { children: ReactNode }) {
  const [more, setMore] = useState(false);
  const fetcher = useCallback(
    () =>
      listAllCampaignSummaries({ limit: 200 }).then((d) => {
        setMore(!d.complete);
        return d.campaigns;
      }),
    [],
  );
  const campaigns = useEngineResource(fetcher);
  const value = useMemo(() => ({ ...campaigns, more }), [campaigns, more]);
  return <CampaignsContext.Provider value={value}>{children}</CampaignsContext.Provider>;
}

/** GET /api/campaigns?summary=true, every page. */
export function useCampaigns(): CampaignsResource {
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

/**
 * A re-analysis runs as an engine background job (POST /reanalyze/jobs), so it
 * has the engine's own stages and progress, can be cancelled, and survives
 * navigation and reloads: the provider resumes an active job from the jobs
 * list, and a failed job's error comes back from the engine too (until the
 * user dismisses it, remembered per job id in sessionStorage).
 */
export type ReanalysisState = {
  /** A job is queued or running. */
  running: boolean;
  /** When the job was created (ms), for elapsed time; null when no job. */
  startedAt: number | null;
  /** The newest re-analysis job known for this campaign (active, or finished and not dismissed). */
  job: Job | null;
  /** How the last re-analysis failed (engine job error, or a refusal before queueing); null when none or dismissed. */
  error: { code: string; message: string | null } | null;
  /** Polling failed repeatedly; the job may still be running on the engine. */
  pollTrouble: boolean;
  cancel: () => Promise<void>;
  /** Clear a finished job and its error (remembered across navigation). */
  dismiss: () => void;
};

export type ReanalysisOutcome = { kind: "succeeded" | "failed" | "cancelled"; job: Job };

type EngineData = {
  campaignId: string;
  detail: EngineResource<CampaignDetail>;
  latest: EngineResource<LatestResult>;
  campaign: EngineResource<Campaign>;
  upload: UploadTracker;
  reanalysis: ReanalysisState;
  runReanalysis: () => Promise<ReanalysisOutcome>;
} & LastRejection;

const EngineContext = createContext<EngineData | null>(null);

// The engine reports progress only at stage boundaries, so a 2.5 s poll loses nothing and keeps a long
// job well inside the proxy's per-session rate limit (120 requests a minute).
const POLL_MS = 2500;
const TERMINAL: readonly Job["state"][] = ["succeeded", "failed", "cancelled", "timed_out"];
const FAILED: readonly Job["state"][] = ["failed", "timed_out"];

/** A finished job's error as the page shows it (fixed engine text; never exception text). */
function jobError(j: Job): { code: string; message: string | null } {
  if (j.error) return { code: j.error.code, message: j.error.message || null };
  return { code: j.state === "timed_out" ? "timeout" : "analysis_failed", message: null };
}

// Dismissed re-analysis errors, per campaign, for this browser session (so a dismissed failure is not resurrected
// from the engine's jobs list on the next page).
const DISMISSED_KEY = "kalos.reanalysis.dismissed";
function readDismissed(): Record<string, string[]> {
  try {
    const v: unknown = JSON.parse(globalThis.sessionStorage?.getItem(DISMISSED_KEY) ?? "{}");
    return typeof v === "object" && v !== null ? (v as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}
function isDismissed(campaignId: string, jobId: string): boolean {
  const ids = readDismissed()[campaignId];
  return Array.isArray(ids) && ids.includes(jobId);
}
function rememberDismissed(campaignId: string, jobId: string): void {
  try {
    const all = readDismissed();
    all[campaignId] = [...(Array.isArray(all[campaignId]) ? all[campaignId] : []), jobId].slice(-20);
    globalThis.sessionStorage?.setItem(DISMISSED_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the dismissal lasts until the provider unmounts
  }
}

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
  const { update: updateDetail } = detail;
  const updateSummary = useCallback(
    (change: (current: Campaign | null) => Campaign | null) =>
      updateDetail((d) => {
        if (!d) return d;
        const next = change(d.summary);
        return next ? { ...d, summary: next } : d;
      }),
    [updateDetail],
  );
  const campaign: EngineResource<Campaign> = useMemo(
    () => ({ ...detail, data: detail.data?.summary ?? null, set: setSummary, update: updateSummary }),
    [detail, setSummary, updateSummary],
  );

  // --- Upload job ---
  const [job, setJob] = useState<Job | null>(null);
  const [pollTrouble, setPollTrouble] = useState(false);
  const waiters = useRef(new Map<string, ((j: Job) => void)[]>());
  const { refresh: refreshLatest } = latest;
  const { refresh: refreshDetail } = detail;
  const refreshCampaigns = campaigns?.refresh;

  // Resume jobs already known to the engine (another tab, or before a reload or navigation): an active upload,
  // and the newest re-analysis when it is active or ended in an error the user has not dismissed.
  const [reJob, setReJob] = useState<Job | null>(null);
  const [reError, setReError] = useState<{ code: string; message: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.listJobs(campaignId, 10).then(
      (jobs) => {
        if (cancelled) return;
        const upload = jobs.find((j) => j.kind !== "reanalyze");
        if (upload && isJobActive(upload)) setJob((cur) => cur ?? upload);
        const re = jobs.find((j) => j.kind === "reanalyze");
        if (re && (isJobActive(re) || (FAILED.includes(re.state) && !isDismissed(campaignId, re.id)))) {
          setReJob((cur) => cur ?? re);
          if (!isJobActive(re)) setReError((cur) => cur ?? jobError(re));
        }
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

  // --- Re-analysis job (engine stages and progress; tracked here so it survives navigation) ---
  const [rePollTrouble, setRePollTrouble] = useState(false);
  const reWaiters = useRef(new Map<string, ((j: Job) => void)[]>());
  const activeReJobId = reJob && isJobActive(reJob) ? reJob.id : null;
  useEffect(() => {
    if (!activeReJobId) return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await api.getJob(activeReJobId);
        failures = 0;
        setRePollTrouble(false);
        if (stopped) return;
        setReJob(j);
        if (TERMINAL.includes(j.state)) {
          if (j.state === "succeeded") await Promise.all([refreshLatest(), refreshDetail(), refreshCampaigns?.()]);
          else if (FAILED.includes(j.state)) setReError(jobError(j));
          for (const w of reWaiters.current.get(j.id) ?? []) w(j);
          reWaiters.current.delete(j.id);
          return;
        }
      } catch {
        failures += 1;
        if (failures >= 3) setRePollTrouble(true);
      }
      if (!stopped) timer = setTimeout(tick, Math.min(POLL_MS * 2 ** Math.max(0, failures - 2), 15_000));
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [activeReJobId, refreshLatest, refreshDetail, refreshCampaigns]);

  const reInflight = useRef<Promise<ReanalysisOutcome> | null>(null);
  const runReanalysis = useCallback(() => {
    if (reInflight.current) return reInflight.current;
    const p = (async (): Promise<ReanalysisOutcome> => {
      try {
        setReError(null);
        let submitted: Job;
        try {
          submitted = await api.submitReanalyzeJob(campaignId);
        } catch (e) {
          // Refused before queueing (job_pending, nothing_to_fold, rate_limited, ...): keep it visible like a job error.
          if (e instanceof EngineError) setReError({ code: e.code, message: e.detail ?? null });
          throw e;
        }
        const done = new Promise<Job>((resolve) => {
          const list = reWaiters.current.get(submitted.id) ?? [];
          reWaiters.current.set(submitted.id, [...list, resolve]);
        });
        setRePollTrouble(false);
        setReJob(submitted);
        const j = await done;
        if (j.state === "succeeded") return { kind: "succeeded", job: j };
        if (j.state === "cancelled") return { kind: "cancelled", job: j };
        return { kind: "failed", job: j };
      } finally {
        reInflight.current = null;
      }
    })();
    reInflight.current = p;
    return p;
  }, [campaignId]);
  const cancelReanalysis = useCallback(async () => {
    if (!reJob || !isJobActive(reJob)) return;
    setReJob(await api.cancelJob(reJob.id));
  }, [reJob]);
  const dismissReanalysis = useCallback(() => {
    setReJob((j) => {
      if (j && isJobActive(j)) return j;
      if (j) rememberDismissed(campaignId, j.id);
      return null;
    });
    setReError(null);
  }, [campaignId]);
  const reanalysis: ReanalysisState = useMemo(
    () => ({
      running: isJobActive(reJob),
      startedAt: reJob && isJobActive(reJob) ? reJob.created_at * 1000 : null,
      job: reJob,
      error: reError,
      pollTrouble: rePollTrouble,
      cancel: cancelReanalysis,
      dismiss: dismissReanalysis,
    }),
    [reJob, reError, rePollTrouble, cancelReanalysis, dismissReanalysis],
  );

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

/**
 * The summary with one acknowledged result applied: the engine's returned run when it is that run, else the value
 * marked measured. Counts follow, and the analysis no longer describes the campaign (every result write re-mints it).
 */
export function withRecordedResult(summary: Campaign, id: string, value: number, run?: api.CampaignRun | null): Campaign {
  if (!summary.has_campaign || !summary.pending.some((r) => r.id === id)) return summary;
  const echoed = run && typeof run === "object" && run.id === id ? run : null;
  const pending = summary.pending.map((r) => (r.id === id ? { ...r, ...echoed, result: value, awaiting: false } : r));
  return {
    ...summary,
    pending,
    n_awaiting: pending.filter((r) => r.awaiting).length,
    n_measured: pending.filter((r) => !r.awaiting).length,
    analysis_in_sync: false,
  };
}

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
 *   logResult(id, value, reason?)    -> run       (applies the acknowledged result to the summary, then refreshes
 *                                       it, so a failed refresh never hides a saved value; a correction needs a
 *                                       reason, and a reason_required refusal refreshes the campaign so a value
 *                                       recorded elsewhere, e.g. another tab, shows and can be corrected)
 *   reanalyze()                      -> { kind: succeeded | failed | cancelled, job } (a background job; progress,
 *                                       cancel and a persisted error are on useReanalysis(); a refusal before
 *                                       queueing throws EngineError)
 */
export function useEngineWrites() {
  const { campaignId, latest, detail, upload, runReanalysis, setRejection } = useEngineData();
  const { refresh: refreshLatest } = latest;
  const { refresh: refreshDetail, update: updateDetail } = detail;
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
      let run: api.CampaignRun;
      try {
        run = await api.recordCampaignResult(campaignId, id, value, reason);
      } catch (e) {
        if (e instanceof EngineError && e.code === "reason_required") await refreshDetail();
        throw e;
      }
      updateDetail((current) => (current ? { ...current, summary: withRecordedResult(current.summary, id, value, run) } : current));
      await refreshDetail();
      return run;
    },
    [campaignId, refreshDetail, updateDetail],
  );
  const reanalyze = useCallback(() => runReanalysis(), [runReanalysis]);
  const refreshAll = useCallback(() => Promise.all([refreshLatest(), refreshDetail()]).then(() => undefined), [refreshLatest, refreshDetail]);

  return { runFile, startRuns, logResult, reanalyze, refreshAll };
}
