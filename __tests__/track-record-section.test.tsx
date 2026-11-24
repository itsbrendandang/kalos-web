// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackRecordSection } from "@/components/validate/track-record-section";
import type { CoverageStat, TrackRecord, TrackRound, TrackRun } from "@/lib/assist";

/*
 * Validate's track record against the engine's response shapes
 * (kalos/portal/history_api.py). fetch is the only seam: GET track-record and
 * track-record/runs; everything else is unexpected.
 */

const ID = "cmp_test";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const RULES = {
  scored_only_if: "the engine recorded a prediction for the run before the run's first recorded result",
  band: "the band recorded when the run was started, at the requested coverage; never the current analysis",
  error_formula: "measured minus the prediction recorded at start",
  coverage_interval: "Wilson score interval, 95%",
  judged_from_n: 10,
};

const cov = (n: number, inside: number, over: Partial<CoverageStat> = {}): CoverageStat => ({
  n, inside, outside: n - inside, observed: n ? inside / n : null, nominal: 0.9, wilson_95: n ? [0.5, 0.97] : null, basis: "prospective", ...over,
});

const round = (r: number, over: Partial<TrackRound> = {}): TrackRound => ({
  round: r, dataset_epoch: 1, current_dataset: true, first_recorded_at: 1000 + r, n_started: 4, n_engine_predictions: 4, n_measured: 4, n_corrected: 0, n_folded: 4,
  coverage: cov(4, 3), coverage_so_far: cov(4, 3), error: { n: 4, mean: 0.1234, mean_abs: 0.2, rmse: 0.25 }, excluded: {}, ...over,
});

const record = (rounds: TrackRound[], pooled: CoverageStat): TrackRecord => ({
  campaign_id: ID, has_campaign: true, basis: "prospective", coverage: 0.9, band: "proposal", current_round: rounds.length, rounds,
  page: { limit: 100, offset: 0, total_rounds: rounds.length, has_more: false, next_offset: null },
  pooled: { coverage: pooled, error: { n: 8, mean: 0.1, mean_abs: 0.2, rmse: 0.3 } },
  rounds_without_record: { rounds: [], count: 0, reason: null }, rules: RULES, excluded_reasons: {},
});

const run = (id: number, over: Partial<TrackRun> = {}): TrackRun => ({
  id, run_id: `run${id}`, round: 0, status: "folded", prediction: { available: true, pred: 1.7, recorded_at: 1000 },
  band: { lo: 1.5, hi: 1.9, coverage: 0.9 }, measured: { value: 1.8, corrected: false }, scored: true, inside: true, error: 0.1, ...over,
});

let trackRecord: () => Response;
let trackRuns: () => Response;
let calls: string[];

beforeEach(() => {
  calls = [];
  trackRecord = () => json(record([round(1), round(0, { error: { n: 4, mean: -0.0042, mean_abs: 0.1, rmse: 0.1 } })], cov(8, 6, { judged: false, reason: "needs 10 scored runs to judge; has 8" })));
  trackRuns = () => json({ campaign_id: ID, items: [run(1), run(2, { measured: { value: 1.6, corrected: true } }), run(3, { measured: { value: null }, scored: false, inside: null, error: null, band: null })], has_more: false, rules: RULES });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes(`/api/campaigns/${ID}/track-record/runs`)) return trackRuns();
      if (url.includes(`/api/campaigns/${ID}/track-record`)) return trackRecord();
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderSection = (unit: string | null = "g/L") => render(<TrackRecordSection campaignId={ID} unit={unit} />);

describe("TrackRecordSection", () => {
  it("shows a loading state, then the pooled verdict, the per-round table and the mean-error note", async () => {
    renderSection();
    expect(screen.getByRole("status", { name: "Loading the track record" })).toBeTruthy();
    const table = await screen.findByRole("table", { name: "Track record by round" });
    expect(calls).toEqual(
      expect.arrayContaining([`/api/engine/api/campaigns/${ID}/track-record?coverage=0.9&limit=100`, `/api/engine/api/campaigns/${ID}/track-record/runs?coverage=0.9&limit=500`]),
    );
    expect(screen.getByText(/6 of 8 measured results landed inside the 90% range recorded when the run started\. Too few to judge the range yet: that takes 10 scored runs, and there are 8 so far\./)).toBeTruthy();
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Round", "Started", "Measured", "Inside 90% range", "Mean error (g/L)"]);
    const rows = within(table).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    // Oldest first, 1-based rounds; mean error at 3 significant figures (no engine uncertainty), signed, never 0.
    expect(rows).toEqual([
      ["Round 1", "4", "4", "3 of 4", "\u22120.00420"],
      ["Round 2", "4", "4", "3 of 4", "+0.123"],
    ]);
    expect(screen.getByText(/Mean error is measured minus the prediction recorded at start, in g\/L/)).toBeTruthy();
    // The runs add what the record leaves out.
    expect(await screen.findByText(/1 run is awaiting a result\. 1 result was corrected after entry/)).toBeTruthy();
  });

  it("never calls the ranges calibrated, wide or narrow unless the engine judged them", async () => {
    renderSection();
    await screen.findByRole("table", { name: "Track record by round" });
    expect(document.body.textContent).not.toMatch(/calibrat|consistent with|too narrow|wide side/i);
  });

  it("states the engine's judgement when it made one", async () => {
    trackRecord = () => json(record([round(1), round(0)], cov(24, 22, { judged: true, reason: null, wilson_95: [0.74, 0.98] })));
    renderSection();
    expect(await screen.findByText(/22 of 24 measured results .* That is consistent with 90% \(plausibly 74% to 98%\)\./)).toBeTruthy();
  });

  it("with one scored round it does not repeat Learn's k-of-n sentence", async () => {
    trackRecord = () => json(record([round(0)], cov(4, 3, { judged: false, reason: "needs 10 scored runs to judge; has 4" })));
    renderSection();
    expect(await screen.findByText("Only round 1 has results scored against a prediction recorded at start so far. Too few to judge the range yet: that takes 10 scored runs, and there are 4 so far.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/3 of 4 measured results/);
  });

  it("puts the engine's scoring rules behind a disclosure", async () => {
    renderSection();
    await screen.findByRole("table", { name: "Track record by round" });
    const summary = screen.getByText("How this is scored");
    expect(screen.queryByText("Judged from")).toBeNull();
    fireEvent.click(summary);
    const details = summary.closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText("Judged from")).toBeTruthy();
    expect(screen.getByText("10 scored runs or more")).toBeTruthy();
    expect(screen.getByText("measured minus the prediction recorded at start")).toBeTruthy();
  });

  it("is hidden on an engine without the track-record route", async () => {
    trackRecord = () => json({ detail: "Not Found" }, 404);
    const { container } = renderSection();
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failed read is a request problem with a retry, never an empty record", async () => {
    trackRecord = () => json({ error: "engine_busy" }, 503);
    renderSection();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Could not load the track record/);
    expect(alert.textContent).toMatch(/not a finding about your results/);
    expect(screen.queryByText(/nothing to score/)).toBeNull();
    trackRecord = () => json(record([round(0), round(1)], cov(8, 6, { judged: false, reason: "needs 10 scored runs to judge; has 8" })));
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Track record by round" })).toBeTruthy();
  });

  it("a campaign the engine does not know is an error, not a hidden section", async () => {
    trackRecord = () => json({ error: "campaign not found", code: "not_found" }, 404);
    renderSection();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not load the track record/);
  });

  it("an empty record says there is nothing to score yet", async () => {
    trackRecord = () => json(record([], cov(0, 0, { judged: false, reason: "needs 10 scored runs to judge; has 0" })));
    trackRuns = () => json({ items: [], has_more: false });
    renderSection();
    expect(await screen.findByText("No run has a prediction recorded at start yet, so there is nothing to score.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("leaves out an earlier run sheet's rounds and does not judge the re-summed record", async () => {
    trackRecord = () =>
      json(record([round(0, { current_dataset: true, first_recorded_at: 5000 }), round(1, { current_dataset: false, first_recorded_at: 2000 }), round(0, { current_dataset: false, first_recorded_at: 1000 })], cov(40, 37, { judged: true, wilson_95: [0.8, 0.97] })));
    trackRuns = () => json({ items: [run(1, { prediction: { available: true, pred: 1.7, recorded_at: 1000 } }), run(2, { prediction: { available: true, pred: 1.7, recorded_at: 5000 } })], has_more: false });
    renderSection();
    const table = await screen.findByRole("table", { name: "Track record by round" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(await screen.findByText(/Runs from earlier run sheets are left out\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/consistent with/);
  });

  it("keeps the verdict and table when only the runs read fails", async () => {
    trackRuns = () => json({ error: "engine_busy" }, 503);
    renderSection();
    expect(await screen.findByRole("table", { name: "Track record by round" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
