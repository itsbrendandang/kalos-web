import { describe, expect, it } from "vitest";
import type { ConstraintReport, PopulatedResult, Proposal } from "@/lib/api";
import {
  activeRejection,
  dataNotes,
  runFacts,
  BAND_CAVEAT,
  bandLabel,
  bandSentence,
  exactSetpoint,
  formatGain,
  toRejection,
  boundaryChecks,
  compareRecipes,
  constraintPrediction,
  decimalsOf,
  diversitySummary,
  formatInterval,
  formatSetpoint,
  groupFlags,
  observedRanges,
  predictionInterval,
  recipeFlags,
  rejectionCopy,
  stripDomain,
  toggleCompare,
  type FlagContext,
  type ObservedRange,
} from "@/components/campaign/plan-view";

const p = (pred: number, extra: Partial<Proposal> = {}): Proposal => ({ vals: [0], pred, std: 0.8, mode: "explore", reason: "", ...extra });
const obs = (min: number, max: number, decimals: number | null = 2): ObservedRange => ({ min, max, n: 10, source: "observed", decimals });

type Surface = NonNullable<PopulatedResult["response_surface"]>;
const surface = (runs: [number, number, number][]): Surface => ({ x_feature: "pH", y_feature: "Temp_C", x_vals: [], y_vals: [], z: [], runs });

describe("observedRanges", () => {
  it("takes min/max and the sheet's decimals from the measured runs the engine returned", () => {
    const r = observedRanges({ response_surface: surface([[6.28, 31.6, 49.76], [5.01, 25.1, 40], [6.93, 35, 41]]) });
    expect(r.pH).toEqual({ min: 5.01, max: 6.93, n: 3, source: "observed", decimals: 2 });
    expect(r.Temp_C).toEqual({ min: 25.1, max: 35, n: 3, source: "observed", decimals: 1 });
  });
  it("prefers the engine's feature_ranges when present, keeping the observed decimals", () => {
    const r = observedRanges({ response_surface: surface([[6.25, 30, 1], [7, 31, 2]]), feature_ranges: { pH: [5, 8], Methanol: [0.5, 3] } });
    expect(r.pH).toEqual({ min: 5, max: 8, n: 0, source: "engine", decimals: 2 });
    expect(r.Temp_C.source).toBe("observed");
    expect(r.Methanol).toEqual({ min: 0.5, max: 3, n: 0, source: "engine", decimals: null });
  });
  it("returns nothing when the engine sent neither (no ranges are guessed)", () => {
    expect(observedRanges({})).toEqual({});
    expect(observedRanges({ response_surface: undefined, feature_ranges: undefined })).toEqual({});
    expect(observedRanges({ response_surface: surface([]) })).toEqual({});
  });
});

describe("decimalsOf", () => {
  it("counts written decimals and caps float noise at 4", () => {
    expect(decimalsOf(31.6)).toBe(1);
    expect(decimalsOf(5)).toBe(0);
    expect(decimalsOf(6.28)).toBe(2);
    expect(decimalsOf(0.1 + 0.2)).toBe(1);
    expect(decimalsOf(Math.PI)).toBe(4);
  });
});

describe("boundaryChecks", () => {
  const ranges = { pH: obs(5, 7), Temp_C: obs(25, 35) };
  it("classifies each setpoint against the observed range", () => {
    const where = (v: number) => boundaryChecks({ pH: v }, ranges)[0].where;
    expect(where(6)).toBe("inside");
    expect(where(5.03)).toBe("at-min"); // within 2% of a width of 2
    expect(where(5.05)).toBe("inside");
    expect(where(6.97)).toBe("at-max");
    expect(where(7)).toBe("at-max");
    expect(where(4.9)).toBe("below");
    expect(where(7.2)).toBe("above");
  });
  it("skips inputs without a range and categorical labels", () => {
    expect(boundaryChecks({ Methanol: 1, pH: "buffer A" }, ranges)).toEqual([]);
  });
  it("reports the position in the range", () => {
    expect(boundaryChecks({ Temp_C: 30 }, ranges)[0].position).toBeCloseTo(0.5);
  });
  it("a zero-width range only flags values outside it", () => {
    const one = { pH: obs(6, 6) };
    expect(boundaryChecks({ pH: 6 }, one)[0].where).toBe("inside");
    expect(boundaryChecks({ pH: 6.1 }, one)[0].where).toBe("above");
    expect(boundaryChecks({ pH: 6 }, one)[0].position).toBeNull();
  });
});

describe("recipeFlags", () => {
  const ctx: FlagContext = { incumbent: 50, band: 3, nonNegative: true, ranges: { pH: obs(5, 7) } };
  const kinds = (pr: Proposal, recipe: Record<string, number | string> = { pH: 6 }, c = ctx) => recipeFlags(pr, recipe, c).map((f) => f.kind);

  it("is empty for an unremarkable recipe", () => {
    expect(kinds(p(45))).toEqual([]);
  });
  it("compares the gain with the likely range's ± width, the same measure as the gain, in plain words", () => {
    const flag = recipeFlags(p(51), { pH: 6 }, ctx).find((f) => f.kind === "gain-within-band");
    expect(flag?.detail).toContain("likely range of ± 3");
    expect(flag?.detail).not.toMatch(/half-width|prediction band|interval/);
  });
  it("flags a gain smaller than the band, but not a gain larger than it or no gain", () => {
    expect(kinds(p(51))).toEqual(["gain-within-band"]);
    expect(kinds(p(54))).toEqual([]);
    expect(kinds(p(49))).toEqual([]);
  });
  it("never flags gain-within-band without a band or an incumbent", () => {
    expect(kinds(p(51), { pH: 6 }, { ...ctx, band: null })).toEqual([]);
    expect(kinds(p(51), { pH: 6 }, { ...ctx, incumbent: null })).toEqual([]);
  });
  it("flags edge and outside-range inputs from the observed ranges only", () => {
    expect(kinds(p(45), { pH: 5.01 })).toEqual(["at-edge"]);
    expect(kinds(p(45), { pH: 7.5 })).toEqual(["outside-range"]);
    expect(kinds(p(45), { pH: 5.01 }, { ...ctx, ranges: {} })).toEqual([]);
  });
  it("flags low feasibility only when the engine sent a probability", () => {
    expect(kinds(p(45, { p_feasible: 0.2 }))).toEqual(["low-feasibility"]);
    expect(kinds(p(45, { p_feasible: null }))).toEqual([]);
    expect(kinds(p(45))).toEqual([]);
  });
  it("flags a negative prediction for a never-negative target, most serious first", () => {
    expect(kinds(p(-1), { pH: 5.0 })).toEqual(["negative", "at-edge"]);
    expect(kinds(p(-1), { pH: 6 }, { ...ctx, nonNegative: false })).toEqual([]);
  });
  it("flags a predicted constraint value below the floor only when the constraint was applied", () => {
    const applied: ConstraintReport = { column: "purity", floor: 0.9, n_rows_with_value: 20, applied: true, reason: null };
    const pr = { ...p(45), pred_purity: { mean: 0.8, std: 0.05 } } as Proposal;
    expect(kinds(pr, { pH: 6 }, { ...ctx, constraint: applied })).toEqual(["constraint"]);
    expect(kinds(pr, { pH: 6 }, { ...ctx, constraint: { ...applied, applied: false } })).toEqual([]);
    expect(constraintPrediction(pr, applied)).toEqual({ mean: 0.8, std: 0.05 });
    expect(constraintPrediction(p(45), applied)).toBeNull();
  });
  it("groups the batch's flags by kind with the recipes that carry them", () => {
    const g = groupFlags([
      { rank: 1, flags: recipeFlags(p(51), { pH: 6 }, ctx) },
      { rank: 2, flags: recipeFlags(p(52), { pH: 5 }, ctx) },
      { rank: 3, flags: [] },
    ]);
    expect(g.map((x) => [x.kind, x.ranks])).toEqual([
      ["at-edge", [2]],
      ["gain-within-band", [1, 2]],
    ]);
  });
});

describe("uncertainty display", () => {
  it("gives an interval only when the engine supplied a band", () => {
    expect(predictionInterval(50, 3)).toEqual([47, 53]);
    expect(predictionInterval(50, null)).toBeNull();
    expect(predictionInterval(50, undefined)).toBeNull();
    expect(predictionInterval(50, Number.NaN)).toBeNull();
    expect(predictionInterval(50, -1)).toBeNull();
    expect(formatInterval(51.205, 3.8329)).toBe("47.37 to 55.04");
    expect(formatInterval(51.205, null)).toBeNull();
  });
  it("labels the likely range the same everywhere and says the coverage as a count of past runs, only when the engine reported it", () => {
    expect(bandLabel(0.9)).toBe("Likely range");
    expect(bandLabel(undefined)).toBe("Likely range");
    expect(bandSentence(0.9)).toBe("9 of 10 past runs landed this close to their prediction.");
    expect(bandSentence(0.95)).toBe("19 of 20 past runs landed this close to their prediction.");
    expect(bandSentence(0.8)).toBe("8 of 10 past runs landed this close to their prediction.");
    expect(bandSentence(0.874)).toBe("About 87% of past runs landed this close to their prediction.");
    expect(bandSentence(undefined)).toBeNull();
    expect(bandSentence(null)).toBeNull();
    expect(BAND_CAVEAT).toMatch(/not a promise about new recipes/);
    expect(`${bandLabel(0.9)} ${bandSentence(0.9)} ${BAND_CAVEAT}`).not.toMatch(/held-out|coverage|conformal|interval|band/i);
  });
  it("builds one padded axis for the batch strips that holds every interval and the best", () => {
    const [lo, hi] = stripDomain([50, 45], 2, 49)!;
    expect(lo).toBeLessThan(43);
    expect(hi).toBeGreaterThan(52);
    const [lo2, hi2] = stripDomain([50, 45], null, 60)!;
    expect(lo2).toBeLessThan(45);
    expect(hi2).toBeGreaterThan(60);
    expect(stripDomain([], null, null)).toBeNull();
  });
});

describe("formatSetpoint", () => {
  it("uses the sheet's decimals when known, else 2, and passes labels through", () => {
    expect(formatSetpoint(33.035, 1)).toBe("33.0");
    expect(formatSetpoint(1.795, null)).toBe("1.80");
    expect(formatSetpoint(1234.5, 0)).toBe("1,235");
    expect(formatSetpoint(-0.004, 2)).toBe("0.00");
    expect(formatSetpoint(-1.26, 1)).toBe("-1.3");
    expect(formatSetpoint("glycerol", 2)).toBe("glycerol");
    expect(formatSetpoint(null)).toBe("n/a");
    expect(formatSetpoint(Number.NaN)).toBe("n/a");
  });
  it("never shows a tiny gain as +0.00", () => {
    expect(formatGain(1.4523)).toBe("+1.45");
    expect(formatGain(-4.3)).toBe("-4.30");
    expect(formatGain(0.0031)).toBe("+0.0031");
    expect(formatGain(-0.00042)).toBe("-0.00042");
    expect(formatGain(0)).toBe("0");
    expect(formatGain(null)).toBe("n/a");
  });
  it("shows the exact value that is sent", () => {
    expect(exactSetpoint(29.968)).toBe("29.968");
    expect(exactSetpoint("glucose")).toBe("glucose");
    expect(exactSetpoint(Number.NaN)).toBe("n/a");
  });
});

describe("compareRecipes", () => {
  const ranges = { pH: obs(5, 7, 2), Temp_C: obs(25, 35, 1) };
  it("marks a row as differing only when values differ at display precision", () => {
    const rows = compareRecipes(
      [
        { pH: 5.97, Temp_C: 29.97 },
        { pH: 5.92, Temp_C: 29.98 },
      ],
      ["pH", "Temp_C"],
      ranges,
    );
    expect(rows[0]).toMatchObject({ key: "pH", shown: ["5.97", "5.92"], differs: true, lowest: [1], highest: [0] });
    expect(rows[0].spread).toBeCloseTo(0.05);
    expect(rows[0].spreadOfRange).toBeCloseTo(0.025);
    expect(rows[1]).toMatchObject({ key: "Temp_C", shown: ["30.0", "30.0"], differs: false, lowest: [], highest: [] });
  });
  it("has no range-relative spread without an observed range, and handles labels and missing keys", () => {
    const rows = compareRecipes(
      [
        { Methanol: 1.7, carbon: "glucose" },
        { Methanol: 2.3, carbon: "glycerol" },
        { Methanol: 2.3 },
      ],
      ["Methanol", "carbon"],
      ranges,
    );
    expect(rows[0].spreadOfRange).toBeNull();
    expect(rows[0].spread).toBeCloseTo(0.6);
    expect(rows[0].highest).toEqual([1, 2]);
    expect(rows[1]).toMatchObject({ shown: ["glucose", "glycerol", "n/a"], differs: true, spread: null });
  });
  it("toggles candidates in selection order, capped at five", () => {
    expect(toggleCompare([], 3)).toEqual([3]);
    expect(toggleCompare([3, 1], 3)).toEqual([1]);
    expect(toggleCompare([1, 2, 3, 4, 5], 6)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("diversitySummary", () => {
  it("is null when the engine sent neither field (no claim is made)", () => {
    expect(diversitySummary(undefined, undefined)).toBeNull();
    expect(diversitySummary(null, null)).toBeNull();
  });
  it("describes a full batch in plain words, and keeps the engine's metric text apart from them", () => {
    const s = diversitySummary({ requested: 5, returned: 5, near_duplicates_replaced: 1, min_separation: 0.05, metric: "max over continuous factors of |difference| / factor range" }, null)!;
    expect(s.short).toBe(false);
    expect(s.headline).toBe("Kalos proposed all 5 recipes asked for.");
    expect(s.notes).toEqual(["Proposed recipes are kept at least 5% apart on the input ranges.", "Kalos replaced 1 near-duplicate recipe."]);
    expect(s.notes.join(" ")).not.toMatch(/max over|factor range|engine|distinct|in flight/);
    expect(s.rawNotes).toEqual(['Separation measured as "max over continuous factors of |difference| / factor range".']);
  });
  it("says when the batch came back short", () => {
    const s = diversitySummary(
      { requested: 5, returned: 3, near_duplicates_replaced: 0, min_separation: 0.05 },
      { code: "fewer_distinct_candidates", requested: 5, returned: 3, min_separation: 0.05, message: "..." },
    )!;
    expect(s.short).toBe(true);
    expect(s.headline).toBe("Kalos proposed 3 of the 5 recipes asked for.");
    expect(s.notes.at(-1)).toBe("No further recipe was far enough from the others, so this round has fewer than asked for.");
    expect(s.notes.join(" ")).not.toMatch(/fewer_distinct_candidates|code/);
    expect(s.rawNotes).toEqual(["Notice code: fewer_distinct_candidates."]);
  });
});

describe("toRejection / activeRejection", () => {
  const body = {
    error: "The target column 'lipase_titer' has the same value (5) in every row...",
    code: "target_constant",
    target: "lipase_titer",
    target_summary: { status: "constant", n_nonblank: 40, n_numeric: 40, n_distinct: 1, min: 5, max: 5 },
    available_targets: ["biomass_gL", 3],
  };
  it("maps the engine's structured 400 body", () => {
    expect(toRejection("constant_target.csv", body, "good.csv")).toEqual({
      name: "constant_target.csv",
      forDataset: "good.csv",
      code: "target_constant",
      error: body.error,
      target: "lipase_titer",
      targetSummary: body.target_summary,
      availableTargets: ["biomass_gL"],
    });
  });
  it("ignores errors without a machine code (could be a server fault) and non-objects", () => {
    expect(toRejection("a.csv", { error: "could not analyze" }, null)).toBeNull();
    expect(toRejection("a.csv", { error: "x", code: "" }, null)).toBeNull();
    expect(toRejection("a.csv", null, null)).toBeNull();
    expect(toRejection("a.csv", "boom", null)).toBeNull();
  });
  it("only applies while the same dataset is on screen", () => {
    const r = toRejection("constant_target.csv", body, "good.csv")!;
    expect(activeRejection(r, "good.csv")).toBe(r);
    expect(activeRejection(r, "campaign round 1")).toBeNull();
    expect(activeRejection(r, null)).toBeNull();
    expect(activeRejection({ ...r, forDataset: null }, null)).not.toBeNull();
    expect(activeRejection(null, "good.csv")).toBeNull();
  });
});

describe("rejectionCopy", () => {
  it("explains a constant target from the engine's structured fields", () => {
    const c = rejectionCopy({
      name: "constant_target.csv",
      forDataset: null,
      code: "target_constant",
      error: "raw",
      target: "lipase_titer",
      targetSummary: { n_numeric: 40, n_distinct: 1, min: 5, max: 5 },
      availableTargets: ["biomass_gL"],
    });
    expect(c.title).toBe("No proposed recipes: the target never changes");
    expect(c.body).toBe("In constant_target.csv, lipase_titer has the same value (5) in every one of its 40 rows, so there is nothing for the model to learn from and Kalos proposed no runs.");
    expect(c.suggestion).toBe("Columns that do vary and could be the target: biomass_gL.");
  });
  it("gives a known code its plain sentence and never shows the raw code", () => {
    const c = rejectionCopy({ name: "tiny.csv", forDataset: null, code: "too_few_rows", error: "need at least 6 rows" });
    expect(c.body).toMatch(/^Kalos did not accept tiny\.csv\. /);
    expect(c.body).not.toContain("too_few_rows");
    expect(c.suggestion).toBeNull();
  });
  it("falls back to the engine's own sentence for an unknown code, still without the code", () => {
    const c = rejectionCopy({ name: "x.csv", forDataset: null, code: "novel_code", error: "Column 'pH' is not numeric" });
    expect(c.body).toBe("Kalos did not accept x.csv. Column 'pH' is not numeric");
    expect(c.body).not.toContain("novel_code");
  });
});

describe("dataNotes", () => {
  it("says nothing when the engine reports no drops and no categoricals", () => {
    expect(dataNotes({ auto_categorical: [], n_dropped_incomplete: 0, n_censored_excluded: 0 })).toEqual([]);
    expect(dataNotes({})).toEqual([]);
  });

  it("names auto-detected categoricals and asks for the declaration on Setup", () => {
    const [n] = dataNotes({ auto_categorical: ["Strain"] });
    expect(n.tone).toBe("neutral");
    expect(n.why).toBe("auto_categorical");
    expect(n.text).toContain("Strain was read as a choice between its text values");
    expect(n.text).toContain("Change how the columns are used on Setup");
  });

  it("counts missing and censored exclusions separately and says nothing was imputed", () => {
    const [n] = dataNotes({ n_dropped_incomplete: 2, n_censored_excluded: 1 });
    expect(n.tone).toBe("warn");
    expect(n.why).toBe("dropped_rows");
    expect(n.text).toContain("2 runs with a missing or non-numeric value");
    expect(n.text).toContain("1 run with a value below the detection limit, such as <LOD");
    expect(n.text).toContain("Nothing was filled in");
  });

  it("falls back to data_drops when the top-level counts are absent", () => {
    const [n] = dataNotes({ data_drops: { rows_dropped: 3, censored_rows_excluded: 0 } });
    expect(n.text).toContain("3 runs with a missing or non-numeric value");
    expect(n.text).not.toContain("detection limit");
  });
});

describe("runFacts", () => {
  it("returns nothing when the engine sent no run record", () => {
    expect(runFacts(undefined)).toEqual([]);
    expect(runFacts(null)).toEqual([]);
  });

  it("shows the fingerprint and build, and never the sheet name under anonymize", () => {
    const facts = runFacts({ kind: "upload", profile: "bioprocess", input_sha256: "abcdef0123456789ff", sheet: "Runs", anonymize: true, torch_threads: null, build_sha: "1234567890abcdef" });
    const get = (label: string) => facts.find((f) => f.label === label)?.value;
    expect(get("Sheet fingerprint (SHA-256)")).toBe("abcdef012345");
    expect(get("Sheet")).toBeUndefined();
    expect(get("Threads")).toBe("not pinned");
    expect(get("Engine build")).toBe("1234567890ab");
    expect(get("Source")).toBe("Run sheet upload");
  });

  it("shows the sheet when the upload was not anonymized", () => {
    const facts = runFacts({ sheet: "Runs", anonymize: false });
    expect(facts).toEqual([{ label: "Sheet", value: "Runs" }]);
  });
});
