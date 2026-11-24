import { describe, expect, it } from "vitest";
import {
  currentSheetOnly,
  judgeReason,
  leftOutNote,
  roundRows,
  scoringRules,
  trackPoints,
  trackVerdict,
} from "@/components/campaign/track-record-data";
import type { CoverageStat, TrackRecord, TrackRound, TrackRun } from "@/lib/assist";

const run = (over: Partial<TrackRun> & { id: number }): TrackRun => ({
  run_id: `run${over.id}abcdef`,
  round: 0,
  status: "measured",
  prediction: { available: true, pred: 6 },
  band: { lo: 5.5, hi: 6.5, coverage: 0.9 },
  measured: { value: 6.2, corrected: false },
  scored: true,
  inside: true,
  error: 0.2,
  ...over,
});

const awaiting = (id: number, round = 1): TrackRun =>
  run({ id, round, status: "awaiting", band: null, measured: { value: null, corrected: false }, scored: false, inside: null, error: null });

const cov = (over: Partial<CoverageStat> = {}): CoverageStat => ({ n: 7, inside: 6, outside: 1, observed: 0.857, nominal: 0.9, wilson_95: [0.49, 0.97], ...over });

describe("trackPoints", () => {
  it("maps a scored run with its recorded band, display round 1-based", () => {
    const [p] = trackPoints([run({ id: 1 })]);
    expect(p).toMatchObject({ id: 1, round: 1, kind: "scored", pred: 6, lo: 5.5, hi: 6.5, measured: 6.2, inside: true, error: 0.2, corrected: false });
  });
  it("awaiting runs keep only the prediction", () => {
    const [p] = trackPoints([awaiting(2)]);
    expect(p).toMatchObject({ kind: "awaiting", round: 2, pred: 6, measured: null, lo: null, hi: null, inside: null, error: null });
  });
  it("flags corrected results and keeps the latest value", () => {
    const [p] = trackPoints([run({ id: 3, measured: { value: 7.1, corrected: true } })]);
    expect(p.corrected).toBe(true);
    expect(p.measured).toBe(7.1);
  });
  it("a measured run that is not scored is 'unscored', with no inside or error claimed", () => {
    const [p] = trackPoints([run({ id: 4, scored: false, inside: true, error: 0.3, prediction: { available: false, pred: null } })]);
    expect(p).toMatchObject({ kind: "unscored", pred: null, inside: null, error: null, measured: 6.2 });
  });
  it("drops runs with neither a prediction nor a result, and orders a reversed band", () => {
    const pts = trackPoints([
      run({ id: 5, prediction: { available: false, pred: null }, measured: null, scored: false }),
      run({ id: 6, band: { lo: 7, hi: 5, coverage: 0.9 } }),
    ]);
    expect(pts.map((p) => p.id)).toEqual([6]);
    expect([pts[0].lo, pts[0].hi]).toEqual([5, 7]);
  });
  it("is empty for no runs", () => {
    expect(trackPoints([])).toEqual([]);
  });
});

describe("trackVerdict", () => {
  it("states k of n against the recorded range and the engine's reason when not judged", () => {
    expect(trackVerdict(cov({ judged: false, reason: "needs 10 scored runs to judge; has 7" }))).toBe(
      "6 of 7 measured results landed inside the 90% range recorded when the run started. Too few to judge the range yet: that takes 10 scored runs, and there are 7 so far.",
    );
  });
  it("never judges when the engine did not say it judged", () => {
    const s = trackVerdict(cov({ judged: undefined, reason: null }));
    expect(s).toBe("6 of 7 measured results landed inside the 90% range recorded when the run started.");
    expect(s).not.toMatch(/consistent|calibrat|narrow|wide/);
  });
  it("zero scored runs says so instead of 0 of 0", () => {
    expect(trackVerdict(cov({ n: 0, inside: 0, outside: 0, observed: null, judged: false, reason: "needs 10 scored runs to judge; has 0" }))).toBe(
      "No measured result can be compared with its recorded prediction yet.",
    );
  });
  it("singular wording for one result", () => {
    expect(trackVerdict(cov({ n: 1, inside: 1, judged: false, reason: null }))).toBe("1 of 1 measured result landed inside the 90% range recorded when the run started.");
  });
  it("when judged, compares the target with the 95% interval", () => {
    expect(trackVerdict(cov({ n: 20, inside: 18, judged: true, wilson_95: [0.7, 0.97] }))).toMatch(/consistent with 90% \(plausibly 70% to 97%\)\.$/);
    expect(trackVerdict(cov({ n: 20, inside: 12, judged: true, wilson_95: [0.39, 0.78] }))).toMatch(/too narrow/);
    expect(trackVerdict(cov({ n: 40, inside: 40, judged: true, wilson_95: [0.91, 1] }))).toMatch(/wide side/);
  });
  it("other reasons are passed through as a sentence", () => {
    expect(judgeReason("mixed coverage levels")).toBe("Not judged yet: mixed coverage levels.");
    expect(judgeReason(null)).toBeNull();
  });
});

const round = (r: number, over: Partial<TrackRound> = {}): TrackRound => ({
  round: r,
  n_started: 5,
  n_measured: 5,
  n_corrected: 0,
  coverage: cov({ n: 5, inside: 4 }),
  coverage_so_far: cov(),
  error: { n: 5, mean: 0.1678, mean_abs: 0.385, rmse: 0.44 },
  excluded: {},
  ...over,
});

const record = (rounds: TrackRound[]): TrackRecord => ({
  campaign_id: "c",
  has_campaign: true,
  coverage: 0.9,
  current_round: 1,
  rounds,
  pooled: { coverage: cov(), error: { n: 7, mean: 0.2, mean_abs: 0.4, rmse: 0.5 } },
});

describe("roundRows", () => {
  it("orders oldest first with display rounds", () => {
    const rows = roundRows(record([round(1, { n_measured: 2, coverage: cov({ n: 2, inside: 2 }) }), round(0)]));
    expect(rows.map((r) => [r.round, r.inside, r.scored])).toEqual([
      [1, 4, 5],
      [2, 2, 2],
    ]);
  });
  it("mean error is null when nothing is scored (all awaiting)", () => {
    const [r] = roundRows(record([round(0, { n_measured: 0, coverage: cov({ n: 0, inside: 0 }), error: { n: 0, mean: null, mean_abs: null, rmse: null } })]));
    expect(r).toMatchObject({ measured: 0, scored: 0, meanError: null });
  });
  it("carries corrected counts", () => {
    expect(roundRows(record([round(0, { n_corrected: 2 })]))[0].corrected).toBe(2);
  });
});

describe("leftOutNote", () => {
  it("is null when nothing is left out", () => {
    expect(leftOutNote(trackPoints([run({ id: 1 })]), false)).toBeNull();
  });
  it("names awaiting, corrected and truncated runs", () => {
    const pts = trackPoints([run({ id: 1, measured: { value: 6, corrected: true } }), awaiting(2), awaiting(3)]);
    const note = leftOutNote(pts, true)!;
    expect(note).toContain("2 runs are awaiting a result");
    expect(note).toContain("1 result was corrected");
    expect(note).toContain("Only the first 3 runs were read");
  });
  it("all awaiting", () => {
    expect(leftOutNote(trackPoints([awaiting(1)]), false)).toBe("1 run is awaiting a result.");
  });
});

describe("scoringRules", () => {
  it("labels the engine's rules and skips unknown input", () => {
    const rules = scoringRules({ rules: { error_formula: "measured minus the prediction recorded at start", judged_from_n: 10, other: "x" } });
    expect(rules).toEqual([
      { label: "Error", text: "measured minus the prediction recorded at start" },
      { label: "Judged from", text: "10 scored runs or more" },
    ]);
    expect(scoringRules(null)).toEqual([]);
    expect(scoringRules({ rules: "nope" })).toEqual([]);
  });
});

describe("currentSheetOnly", () => {
  const rnd = (round: number, current: boolean | undefined, first: number, n: number, inside: number): TrackRound => ({
    round,
    current_dataset: current,
    first_recorded_at: first,
    n_started: n,
    n_measured: n,
    n_corrected: 0,
    coverage: cov({ n, inside, outside: n - inside }),
    coverage_so_far: cov(),
    error: { n, mean: 0.1, mean_abs: 0.2, rmse: 0.3 },
    excluded: {},
  });
  const rec = (rounds: TrackRound[]): TrackRecord => ({ campaign_id: "c", has_campaign: true, coverage: 0.9, current_round: 0, rounds, pooled: { coverage: cov({ judged: true }), error: { n: 1, mean: 0, mean_abs: 0, rmse: 0 } } });
  const at = (id: number, recorded_at: number) => run({ id, prediction: { available: true, pred: 6, recorded_at } });

  it("passes everything through when no round belongs to an earlier sheet (or the engine does not say)", () => {
    const r = rec([rnd(0, true, 100, 5, 4), rnd(1, undefined, 200, 2, 2)]);
    const out = currentSheetOnly(r, [at(1, 100), at(2, 200)]);
    expect(out.leftOut).toBe(false);
    expect(out.items).toHaveLength(2);
    expect(out.coverage).toBe(r.pooled.coverage);
  });

  it("drops rounds and runs of an earlier sheet so round numbers never merge, and re-sums coverage without judging", () => {
    // Old sheet: rounds 0 and 1 (t=100, 200). After a replacing upload the new sheet restarts at round 0 (t=300).
    const r = rec([rnd(1, false, 200, 5, 5), rnd(0, false, 100, 5, 4), rnd(0, true, 300, 4, 3)]);
    const out = currentSheetOnly(r, [at(1, 100), at(2, 200), at(3, 300), at(4, 310), run({ id: 5, prediction: { available: false, pred: null } })]);
    expect(out.leftOut).toBe(true);
    expect(out.rounds.map((x) => x.first_recorded_at)).toEqual([300]);
    expect(out.items.map((x) => x.id)).toEqual([3, 4]);
    expect(out.coverage).toMatchObject({ n: 4, inside: 3, outside: 1, judged: false });
    expect(roundRows(out).map((x) => x.round)).toEqual([1]);
    expect(leftOutNote(trackPoints(out.items), false, true)).toMatch(/earlier run sheets are left out/);
  });

  it("keeps no runs when the current sheet has no recorded round yet", () => {
    const out = currentSheetOnly(rec([rnd(0, false, 100, 5, 4)]), [at(1, 100)]);
    expect([out.rounds.length, out.items.length, out.coverage.n]).toEqual([0, 0, 0]);
    expect(trackVerdict(out.coverage)).toMatch(/No measured result/);
  });
});

describe("engine-shape edges", () => {
  it("a run without a round keeps null, never round 1", () => {
    expect(trackPoints([run({ id: 1, round: null })])[0].round).toBeNull();
  });
  it("the level comes from the engine's nominal, not a typed 90%", () => {
    expect(trackVerdict(cov({ nominal: 0.95, judged: false, reason: null }))).toBe("6 of 7 measured results landed inside the 95% range recorded when the run started.");
  });
  it("the pooling rule is labelled too", () => {
    expect(scoringRules({ rules: { pooling: "a coverage figure pools every scored band" } })).toEqual([{ label: "Pooling", text: "a coverage figure pools every scored band" }]);
  });
});
