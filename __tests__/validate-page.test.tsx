// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/link needs the Next router at runtime; a plain anchor is enough here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ValidatePage from "@/app/campaigns/[id]/validate/page";
import { EngineDataProvider } from "@/hooks/use-engine";
import { trimCorrectionReason } from "@/components/campaign/stage-logic";
import type { CampaignRun, Job } from "@/lib/api";
import fixture from "./fixtures/validate-v2-runs.json";

/*
 * Component tests for the Validate page against the engine's response shapes
 * (runs as the live engine returns them since R5: `prediction_at_start` with
 * the band recorded at start, `residual`, `inside_band`; see
 * fixtures/validate-v2-runs.json). fetch is the only seam: GET the campaign,
 * its analysis, its jobs and its result history; POST a result; the
 * re-analysis job (POST /reanalyze/jobs, GET /api/jobs/{id}, POST cancel).
 */

const ID = "cmp_test";
const HASH = "9836c009efd80007d4fbe2e6be5f82b0d5ec884235790e8efa5cc74a45eea0e0";
const prov = { provenance_sha256: HASH, engine_version: "0.1.0", seed: 1234, timestamp: 1795058474 };
const HW = 0.2036;

/** A run started since R5: the engine's prediction and its band (pred ± 0.2036 at 90%) recorded at start. */
const mkRun = (id: string, pred: number, over: Partial<CampaignRun> = {}): CampaignRun => {
  const result = over.result ?? null;
  return {
    id, recipe: { pH: 6.97, temperature_C: 36.19, medium_base: "ProCHO" as unknown as number }, pred, std: 0.07, mode: "exploit",
    reason: "predicted high", result: null, awaiting: true, round: 0, created_at: 1795058703.9, measured_at: null, analysis_provenance: prov,
    pred_source: "engine",
    prediction_at_start: {
      available: true, basis: "predicted", pred, std: 0.07, std_method: "gp_posterior",
      interval: { lo: pred - HW, hi: pred + HW, half_width: HW, coverage: 0.9, method: "conformal_global" }, interval_unavailable_reason: null,
    },
    residual: result == null ? null : result - pred,
    residual_basis: result == null ? null : "derived",
    inside_band: result == null ? null : Math.abs(result - pred) <= HW,
    ...over,
  };
};

let runs: CampaignRun[];
let summaryOver: Record<string, unknown>;
let analysisOver: Record<string, unknown>;
let results: { url: string; body: { value: number; reason?: string } }[];
let jobsList: Job[];
let history: unknown[];
let historyCalls: number;
let submitCalls: number;
let cancelCalls: number;
let onSubmit: () => Response;
let jobNow: Job;
let onResult: (body: { value: number; reason?: string }, runId: string) => Response;
/** GET the campaign answers 503 (the read after a write fails). */
let detailFails: boolean;
/** When set, a result POST waits for it before answering. */
let holdWrite: Promise<void> | null;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const job = (over: Partial<Job> = {}): Job => ({
  id: "job_0123456789abcdef0123456789abcdef", campaign_id: ID, kind: "reanalyze", state: "running", stage: "fitting", progress: 0.15, attempts: 1,
  created_at: 1795116400, started_at: 1795116401, finished_at: null, updated_at: 1795116402, cancel_requested: false, input_bytes: null, error: null,
  campaign_generation: null, ...over,
});

const summary = () => ({
  has_campaign: true, target: "titer_g_L", features: ["pH", "temperature_C"], n_base: 160, best: 1.422, goal: "maximize", round: 0,
  history: [{ round: 0, best: 1.422, n_base: 160 }], pending: runs,
  n_awaiting: runs.filter((r) => r.awaiting).length, n_measured: runs.filter((r) => !r.awaiting).length, analysis_in_sync: false,
  ...summaryOver,
});
const detail = () => ({
  campaign: { id: ID, name: "Test", created_by: null, created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false },
  summary: summary(),
});
const analysis = () => ({
  has_data: true, dataset: "synthetic_bioprocess.csv", updated: 1795058474.2, timestamp: 1795058474, engine_version: "0.1.0",
  target: "titer_g_L", target_unit: { unit: "g/L", source: "header", header: "titer_g_L", note: "parsed from the target column header" },
  conformal_q: HW, conformal_coverage: 0.9, drivers: [], proposals: [], oof: [], features: [],
  proposal_provenance: { provenance_sha256: HASH },
  ...analysisOver,
});

beforeEach(() => {
  runs = [mkRun("aaaaaaa1", 1.75), mkRun("bbbbbbb2", 1.715)];
  summaryOver = {};
  analysisOver = {};
  results = [];
  jobsList = [];
  history = [];
  historyCalls = 0;
  submitCalls = 0;
  cancelCalls = 0;
  jobNow = job();
  onSubmit = () => json({ job: job({ state: "queued", stage: "queued", progress: 0, started_at: null }) }, 202);
  onResult = (body, runId) => json({ ...runs.find((r) => r.id === runId), result: body.value, awaiting: false });
  detailFails = false;
  holdWrite = null;
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/campaigns/${ID}`)) return detailFails ? json({ error: "unavailable", code: "engine_unavailable" }, 503) : json(detail());
      if (url.endsWith(`/api/campaigns/${ID}/analysis`)) return json(analysis());
      if (url.includes(`/api/campaigns/${ID}/jobs`)) return json({ jobs: jobsList });
      if (url.includes(`/api/campaigns/${ID}/results/history`)) {
        historyCalls += 1;
        return json({ campaign_id: ID, limit: 500, results: { items: history, has_more: false, next_before_id: null } });
      }
      if (url.endsWith("/result") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        results.push({ url, body });
        if (holdWrite) await holdWrite;
        const id = url.split("/runs/")[1].split("/")[0];
        // The engine: a run that already has a result is only corrected with a (non-blank) reason.
        if (runs.some((r) => r.id === id && r.result != null) && !trimCorrectionReason(body.reason ?? ""))
          return json({ error: "a correction to a recorded result needs a reason", code: "reason_required" }, 400);
        const res = onResult(body, id);
        if (res.ok) {
          runs = runs.map((r) =>
            r.id === id
              ? { ...r, result: body.value, awaiting: false, result_version: (r.result_version ?? 0) + 1, residual: body.value - r.pred, inside_band: Math.abs(body.value - r.pred) <= HW }
              : r,
          );
        }
        return res;
      }
      if (url.endsWith(`/api/campaigns/${ID}/reanalyze/jobs`) && init?.method === "POST") {
        submitCalls += 1;
        return onSubmit();
      }
      if (url.endsWith(`/api/jobs/${jobNow.id}/cancel`) && init?.method === "POST") {
        cancelCalls += 1;
        jobNow = { ...jobNow, cancel_requested: true };
        return json({ job: jobNow });
      }
      if (url.endsWith(`/api/jobs/${jobNow.id}`)) return json({ job: jobNow });
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderValidate() {
  render(
    <EngineDataProvider campaignId={ID}>
      <ValidatePage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 2, name: "In the lab" });
}

const section = (id: string) => within(document.getElementById(id) as HTMLElement);
const reanalyzeButton = () => screen.getByRole("button", { name: /^Re-analyze and propose round 2/ });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");
/** Let the provider's job poll (every 2.5 s) run once. */
const poll = () => act(() => vi.advanceTimersByTimeAsync(2600));
const measuredRuns = () => {
  runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 }), mkRun("bbbbbbb2", 1.715)];
};

describe("Validate page", () => {
  it("shows the three anchored sections, the engine's predictions with the band recorded when each run started", async () => {
    await renderValidate();
    for (const id of ["run", "record", "learn", "reanalyze"]) expect(document.getElementById(id)).not.toBeNull();
    const lab = section("run");
    // The band is its own "[lo, hi]" column under the engine's coverage, never "±" (VIZ_SPEC 2.3);
    // precision follows the recorded half-width 0.2036 (PDG: 2 significant figures -> 2 dp).
    expect(lab.getByRole("columnheader", { name: "90% band" })).toBeTruthy();
    expect(lab.getByText("[1.55, 1.95]")).toBeTruthy();
    expect(lab.getByText("[1.51, 1.92]")).toBeTruthy();
    expect(lab.getByText("1.75")).toBeTruthy();
    expect(lab.getByText("predicted 1.75")).toBeTruthy(); // sr-only basis word per value
    expect(lab.getByText(/the engine recorded when the run started/)).toBeTruthy();
    // The unit comes from the analysis' target_unit.
    expect(lab.getByRole("columnheader", { name: /Predicted \(g\/L\)/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/±/);
    expect(document.body.textContent).not.toMatch(/95%/);
    expect(document.body.textContent).not.toMatch(/reports no stages|does not report stages/);
    // The stepper marks Validate as the page you are on, and links never use the old /campaign/* paths.
    expect(screen.getByRole("link", { current: "step" }).getAttribute("href")).toBe(`/campaigns/${ID}/validate`);
    for (const a of document.querySelectorAll("a[href]")) expect(a.getAttribute("href")).not.toMatch(/^\/campaign\//);
  });

  it("uses the user's unit from the analysis setup over the header", async () => {
    analysisOver = { target_unit: { unit: "mg/mL", source: "user", header: "titer_g_L", note: "set by the user" } };
    await renderValidate();
    expect(section("run").getByRole("columnheader", { name: /Predicted \(mg\/mL\)/ })).toBeTruthy();
  });

  it("a run the engine did not propose shows no engine prediction and no band, with the engine's reason", async () => {
    const reason = "recipe is not one of the published proposals; the engine has no prediction recorded for it";
    runs = [mkRun("aaaaaaa1", 1.75), mkRun("ccccccc3", 2.5, { pred_source: "caller", prediction_at_start: { available: false, reason } })];
    await renderValidate();
    const lab = section("run");
    expect(lab.getAllByText("No engine prediction").length).toBeGreaterThan(0);
    expect(lab.queryByText("2.50")).toBeNull(); // the caller's number is never shown as a prediction
    fireEvent.click(lab.getByRole("button", { name: "Full recipe for run ccccccc" }));
    expect(lab.getByText(new RegExp(reason))).toBeTruthy();
    expect(lab.getByText(/Your prediction, not the engine's/)).toBeTruthy();
  });

  it("records a first result without a reason and shows it as measured, against its recorded band", async () => {
    await renderValidate();
    fireEvent.change(screen.getByLabelText("Measured result for run aaaaaaa"), { target: { value: "1.62" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save 1 result" }));
    });
    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0].url).toContain(`/api/campaigns/${ID}/runs/aaaaaaa1/result`);
    expect(results[0].body).toEqual({ value: 1.62 });
    const record = section("record");
    await waitFor(() => expect(record.getByText("Inside the band")).toBeTruthy());
    expect(record.getByText("1.62")).toBeTruthy();
    expect(record.getByText(/^Version 1/)).toBeTruthy();
  });

  it("asks for a reason before correcting a recorded value, and shows what it replaced", async () => {
    measuredRuns();
    await renderValidate();
    fireEvent.click(screen.getByRole("button", { name: "Correct the result for run aaaaaaa" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Corrected value/), { target: { value: "1.64" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    expect(await dialog.findByText(/Say why the value changed/)).toBeTruthy();
    expect(results).toHaveLength(0);

    fireEvent.change(dialog.getByLabelText(/Reason for the correction/), { target: { value: "dilution error" } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(results[0].body).toEqual({ value: 1.64, reason: "dilution error" });
    const record = section("record");
    await waitFor(() => expect(record.getByText(/Version 2 \(corrected\), was 1.62/)).toBeTruthy());
    expect(record.getByText("dilution error")).toBeTruthy();
    expect(record.getByRole("link", { name: "Full result history in the Report" }).getAttribute("href")).toBe(`/campaigns/${ID}/report#history`);
  });

  it("shows a correction made elsewhere from the engine's result history (live corrected run)", async () => {
    const corrected = (fixture as unknown as { corrected: CampaignRun }).corrected;
    // The campaign summary carries the version but not the earlier value or the reason.
    const fromSummary: CampaignRun = { ...corrected };
    delete fromSummary.previous_result;
    delete fromSummary.result_reason;
    runs = [fromSummary, (fixture as unknown as { awaiting: CampaignRun }).awaiting];
    history = [
      { id: 10, run_id: corrected.id, version: 2, value: 1.68, previous_value: 1.6, reason: "E2E fixture: re-read plate", actor: "dev-user", recorded_at: 1795116379.26, is_correction: true, basis: "measured" },
      { id: 9, run_id: corrected.id, version: 1, value: 1.6, previous_value: null, reason: null, actor: "dev-user", recorded_at: 1795116379.25, is_correction: false, basis: "measured" },
    ];
    await renderValidate();
    const record = section("record");
    await waitFor(() => expect(record.getByText(/Version 2 \(corrected\), was 1.60/)).toBeTruthy());
    expect(record.getByText("E2E fixture: re-read plate")).toBeTruthy();
    expect(historyCalls).toBe(1);
    // The engine's residual (-0.07) and inside_band (true), not recomputed.
    expect(record.getByText("\u22120.07")).toBeTruthy();
    expect(record.getByText("Inside the band")).toBeTruthy();
  });

  it("does not show the engine's refusal code when a correction is not accepted", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 })];
    onResult = () => json({ error: "a correction to a recorded result needs a reason", code: "reason_required" }, 400);
    await renderValidate();
    fireEvent.click(screen.getByRole("button", { name: "Correct the result for run aaaaaaa" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Corrected value/), { target: { value: "1.64" } });
    fireEvent.change(dialog.getByLabelText(/Reason for the correction/), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    });
    expect(await dialog.findByText(/Correcting a recorded result needs a reason/)).toBeTruthy();
    expect(dialog.queryByText(/reason_required/)).toBeNull();
  });

  it("shows measured first with the engine's residual and band check, and the dumbbell audit trail with an exact hit rate", async () => {
    runs = [
      mkRun("aaaaaaa1", 1.75, { result: 1.64, awaiting: false, result_version: 2 }),
      mkRun("bbbbbbb2", 1.736),
      mkRun("ccccccc3", 1.715, { result: 1.5, awaiting: false, result_version: 1 }),
    ];
    await renderValidate();
    const record = section("record");
    const headers = record.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Run", "Measured (g/L)", "Predicted (g/L)", "90% band", "Measured − predicted", "Against the band"]);
    expect(record.getByText("\u22120.11")).toBeTruthy();
    expect(record.getByText("\u22120.22")).toBeTruthy();
    expect(record.getByText("Inside the band")).toBeTruthy();
    expect(record.getByText("Outside the band")).toBeTruthy();
    expect(record.getByText("Awaiting result")).toBeTruthy();
    const learn = section("learn");
    expect(learn.getByText(/vs the best measured before this round/)).toBeTruthy();
    expect(learn.getByText(/1 of 2 measured runs landed inside the 90% band recorded when they started/)).toBeTruthy();
    expect(learn.getByText(/Hit rate: 1 of 2 inside the 90% band recorded when they started \(50%\)\. Counts only runs with a band recorded when they started\./)).toBeTruthy();
    expect(learn.getByText(/Each band was recorded by the engine when the run started/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/95%|±/);
  });

  it("minimize goal: the round's best is the lowest measured value, and says so", async () => {
    summaryOver = { goal: "minimize", best: 1.2 };
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.64, awaiting: false, result_version: 1 }), mkRun("ccccccc3", 1.715, { result: 1.5, awaiting: false, result_version: 1 })];
    await renderValidate();
    const learn = section("learn");
    const line = learn.getByText("Best (lowest) measured result this round:").parentElement!;
    expect(line.textContent).toMatch(/1\.50/);
    expect(learn.getByText(/the goal is to minimize, so lower is better/)).toBeTruthy();
  });

  it("disables re-analysis with a reason until a result is recorded", async () => {
    await renderValidate();
    expect(isDisabled(reanalyzeButton())).toBe(true);
    expect(screen.getByText(/Record at least one measured result first/)).toBeTruthy();
    fireEvent.click(reanalyzeButton());
    expect(submitCalls).toBe(0);
  });

  it("says the analysis predates the recorded results and that awaiting runs stay in flight", async () => {
    measuredRuns();
    await renderValidate();
    expect(screen.getByText("The current analysis predates 1 recorded result. Re-analyze to fold it into the model.")).toBeTruthy();
    expect(screen.getByText(/1 run still awaiting a result stays in flight: not folded in and not proposed again/)).toBeTruthy();
  });

  it("runs the re-analysis as a job: the engine's stage and progress, then a link to Predict", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    measuredRuns();
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    expect(submitCalls).toBe(1);
    // Queued: the re-analysis stage list (not the upload one), and Cancel.
    const progress = await screen.findByRole("region", { name: "Re-analysis progress" });
    expect(within(progress).getByText("Gathering the measured results to fold in")).toBeTruthy();
    expect(within(progress).queryByText("Reading and checking the sheet")).toBeNull();
    expect(within(progress).getByRole("button", { name: "Cancel" })).toBeTruthy();
    // The engine reports fitting at 15%: the bar shows exactly that, with the stage.
    jobNow = job({ stage: "fitting", progress: 0.15 });
    await poll();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("15");
    expect(bar.getAttribute("aria-valuetext")).toBe("15%, Re-fitting the model and cross-validating");
    // It succeeds: the campaign moves to round 1 and the page links to the new batch.
    runs = runs.filter((r) => r.awaiting);
    summaryOver = { round: 1, best: 1.62, history: [{ round: 0, best: 1.422, n_base: 160 }, { round: 1, best: 1.62, n_base: 161 }], analysis_in_sync: true };
    jobNow = job({ state: "succeeded", stage: "succeeded", progress: 1, finished_at: 1795116460 });
    await poll();
    const link = await screen.findByRole("link", { name: /Review round 2 on Predict/ });
    expect(link.getAttribute("href")).toBe(`/campaigns/${ID}/predict`);
    expect(screen.queryByRole("progressbar")).toBeNull();
    // What the folded round showed, from the engine's history.
    const li = within(document.getElementById("learn") as HTMLElement).getAllByRole("listitem").find((el) => /Best measured after round 1/.test(el.textContent ?? ""))!;
    expect(li.textContent).toMatch(/\+0\.20\s*g\/L\s*\(\+14%\)\s*vs the uploaded data \(1\.42\s*g\/L\)/);
  });

  it("cancels the job: says nothing was written", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    measuredRuns();
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    jobNow = job({ stage: "calibrating", progress: 0.55 });
    await poll();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(cancelCalls).toBe(1);
    expect(await screen.findByText("Cancelling the re-analysis")).toBeTruthy();
    jobNow = job({ state: "cancelled", stage: "cancelled", progress: 0.55, cancel_requested: true, finished_at: 1795116430 });
    await poll();
    expect(await screen.findByText("The re-analysis was cancelled")).toBeTruthy();
    expect(screen.getByText(/Nothing was written/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("The re-analysis was cancelled")).toBeNull();
  });

  it("a failed job keeps its error (plain copy, raw code one click down) until dismissed, and offers a retry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    measuredRuns();
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    jobNow = job({ state: "failed", stage: "failed", error: { code: "conflict", message: "the campaign was written meanwhile; nothing was written" } });
    await poll();
    expect(await screen.findByText("The re-analysis did not finish")).toBeTruthy();
    expect(screen.getByText(/The campaign changed while re-analyzing .*so nothing was written/)).toBeTruthy();
    expect(screen.getByText("Engine details")).toBeTruthy();
    // Try again submits a new job.
    jobNow = job({ id: "job_ffffffffffffffffffffffffffffffff", state: "queued", stage: "queued", progress: 0 });
    onSubmit = () => json({ job: jobNow }, 202);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(submitCalls).toBe(2);
    expect(screen.queryByText("The re-analysis did not finish")).toBeNull();
  });

  it("a failed re-analysis from before (another page or a reload) is shown from the engine's jobs list", async () => {
    measuredRuns();
    jobsList = [job({ state: "failed", stage: "failed", error: { code: "fit_failed", message: "the model could not be fitted" } })];
    await renderValidate();
    expect(await screen.findByText("The re-analysis did not finish")).toBeTruthy();
    expect(screen.getByText(/could not be fitted to the data with the new results folded in, so nothing was written/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("The re-analysis did not finish")).toBeNull();
  });

  it("refused before queueing: nothing to fold, no instant retry", async () => {
    measuredRuns();
    onSubmit = () => json({ error: "no measured runs to fold; log at least one result first", code: "nothing_to_fold" }, 400);
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    expect(await screen.findByText(/There are no measured results to fold in yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText(/nothing_to_fold/)).toBeNull();
  });

  it("engine busy: says to wait a minute, without an instant retry", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 })];
    onSubmit = () => json({ error: "busy", code: "engine_busy" }, 503);
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    expect(await screen.findByText(/Try again in about a minute/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("with no runs started, points to Predict", async () => {
    runs = [];
    render(
      <EngineDataProvider campaignId={ID}>
        <ValidatePage />
      </EngineDataProvider>,
    );
    expect(await screen.findByText("No runs started yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Predict" }).getAttribute("href")).toBe(`/campaigns/${ID}/predict`);
  });
});

/*
 * Carried over from main's record-page tests (#87, b289185) onto the redesign's Record section: an acknowledged
 * result survives a failed read, saving waits for a refresh, unsaved entries are kept, a double submit writes once,
 * a run recorded elsewhere comes back as a correction, and the reason follows the engine's rules.
 */
describe("Validate page: recording through failures", () => {
  const entry = (id: string) => screen.getByLabelText(`Measured result for run ${id}`) as HTMLInputElement;
  const saveButton = () => screen.getByRole("button", { name: /^Save (\d+ )?results?$/ }) as HTMLButtonElement;

  it("keeps an acknowledged result shown when the read after the save fails, and saves more only after a refresh", async () => {
    await renderValidate();
    detailFails = true;
    fireEvent.change(entry("aaaaaaa"), { target: { value: "1.62" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await screen.findByRole("button", { name: "Refresh results" });
    expect(results.map((r) => r.body)).toEqual([{ value: 1.62 }]);
    const record = section("record");
    expect(screen.queryByLabelText("Measured result for run aaaaaaa")).toBeNull(); // shown as recorded, not as awaiting
    expect(record.getByText("1.62")).toBeTruthy();

    fireEvent.change(entry("bbbbbbb"), { target: { value: "1.70" } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.submit(entry("bbbbbbb").closest("form")!);
    expect(results).toHaveLength(1);

    detailFails = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Refresh results" })).toBeNull());
    expect(entry("bbbbbbb").value).toBe("1.70");
    expect(saveButton().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(results).toHaveLength(2));
    expect(results[1].body).toEqual({ value: 1.7 });
  });

  it("does not claim earlier rows were saved when the first write fails, and keeps the entry", async () => {
    onResult = () => json({ error: "try again", code: "engine_unavailable" }, 503);
    await renderValidate();
    fireEvent.change(entry("aaaaaaa"), { target: { value: "1.62" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    const alert = await screen.findByText(/Run aaaaaaa was not saved/);
    expect(alert.textContent).not.toMatch(/before it/);
    expect(alert.textContent).toMatch(/Your unsaved entries are kept/);
    expect(entry("aaaaaaa").value).toBe("1.62");
    expect(saveButton().disabled).toBe(false);
  });

  it("keeps a failed row's entry while the rows before it stay saved", async () => {
    let failB = true;
    onResult = (body, id) => (id === "bbbbbbb2" && failB ? json({ error: "try again", code: "engine_unavailable" }, 503) : json({ ...runs.find((r) => r.id === id), result: body.value, awaiting: false }));
    await renderValidate();
    fireEvent.change(entry("aaaaaaa"), { target: { value: "1.62" } });
    fireEvent.change(entry("bbbbbbb"), { target: { value: "1.70" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect((await screen.findByText(/Run bbbbbbb was not saved/)).textContent).toMatch(/The result before it was saved/);
    expect(entry("bbbbbbb").value).toBe("1.70");
    failB = false;
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(results).toHaveLength(3));
    expect(results.map((r) => r.url.split("/runs/")[1].split("/")[0])).toEqual(["aaaaaaa1", "bbbbbbb2", "bbbbbbb2"]);
  });

  it("sends one write when the form is submitted twice before React renders", async () => {
    await renderValidate();
    let release!: () => void;
    holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    fireEvent.change(entry("aaaaaaa"), { target: { value: "1.62" } });
    act(() => {
      fireEvent.submit(entry("aaaaaaa").closest("form")!);
      fireEvent.submit(entry("aaaaaaa").closest("form")!);
    });
    expect(results).toHaveLength(1);
    await act(async () => release());
    await waitFor(() => expect(section("record").getByText("Inside the band")).toBeTruthy());
    expect(results).toHaveLength(1);
  });

  it("a run recorded elsewhere comes back as a correction: re-read, shown, and Correct opens with the entry", async () => {
    await renderValidate();
    fireEvent.change(entry("aaaaaaa"), { target: { value: "1.62" } });
    // Another tab records this run before this page saves.
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.6, awaiting: false, result_version: 1 }), runs[1]];
    await act(async () => {
      fireEvent.click(saveButton());
    });
    const alert = await screen.findByText(/Run aaaaaaa was not saved/);
    expect(alert.textContent).toMatch(/already has a recorded result/);
    expect(alert.textContent).not.toMatch(/reason_required/);
    await waitFor(() => expect(screen.queryByLabelText("Measured result for run aaaaaaa")).toBeNull());
    expect(section("record").getByText("1.60")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Correct the result for run aaaaaaa" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect((dialog.getByLabelText(/Corrected value/) as HTMLInputElement).value).toBe("1.62");
    fireEvent.change(dialog.getByLabelText(/Reason for the correction/), { target: { value: "  re-read the plate  " } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(results.map((r) => r.body)).toEqual([{ value: 1.62 }, { value: 1.62, reason: "re-read the plate" }]);
  });

  it("a correction reason follows the engine's rules: its whitespace, and 256 characters counted as code points", async () => {
    measuredRuns();
    await renderValidate();
    fireEvent.click(screen.getByRole("button", { name: "Correct the result for run aaaaaaa" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Corrected value/), { target: { value: "1.64" } });
    const reason = dialog.getByLabelText(/Reason for the correction/) as HTMLInputElement;
    expect(reason.hasAttribute("maxlength")).toBe(false); // a UTF-16 maxlength would cut 256 emoji at 128
    fireEvent.change(reason, { target: { value: "\u0085\u001c " } });
    fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    expect(await dialog.findByText(/Say why the value changed/)).toBeTruthy();
    expect(results).toHaveLength(0);

    const explanation = "\u{1F9EA}".repeat(256);
    fireEvent.change(reason, { target: { value: `\u0085${explanation}\u001c` } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    });
    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0].body).toEqual({ value: 1.64, reason: explanation });
  });
});
