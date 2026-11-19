import { describe, expect, it } from "vitest";
import type { Campaign, CampaignMeta, CampaignRun } from "@/lib/api";
import {
  NOT_INCLUDED,
  PROPOSALS_FIXED_COLUMNS,
  RUNS_FIXED_COLUMNS,
  buildPackage,
  csvCell,
  packageContents,
  packageFilename,
  packageJson,
  proposalsCsv,
  runsCsv,
  slugify,
  toCsv,
  type PackageAnalysis,
} from "@/lib/report-package";

const CAVEAT = "Calibrated on held-out runs similar to past runs; at proposed recipes coverage measured lower in simulation (about 60-80% for a nominal 90%).";

const meta: Pick<CampaignMeta, "id" | "name" | "created_at"> = { id: "cmp_1", name: "Fed-batch CHO", created_at: 1795058340 };
const AT = new Date("2026-11-19T10:30:00Z");

const prov = {
  provenance_sha256: "p".repeat(64),
  input_sha256: "i".repeat(64),
  config_sha256: "c".repeat(64),
  engine_version: "0.1.0",
  seed: 1234,
  timestamp: 1795058474,
};

const run = (over: Partial<CampaignRun> = {}): CampaignRun => ({
  id: "r1",
  recipe: { pH: 7, medium_base: "ProCHO" } as unknown as Record<string, number>,
  pred: 1.75,
  std: 0.069,
  mode: "exploit",
  reason: "predicted high",
  result: null,
  awaiting: true,
  round: 0,
  created_at: 1795058703,
  analysis_provenance: prov,
  ...over,
});

const summary = (pending: CampaignRun[] = [run()]): Campaign => ({
  has_campaign: true,
  target: "titer_g_L",
  features: ["pH"],
  n_base: 160,
  best: 1.422,
  round: 0,
  history: [{ round: 0, best: 1.422, n_base: 160 }],
  pending,
  n_awaiting: pending.filter((r) => r.awaiting).length,
  n_measured: pending.filter((r) => !r.awaiting).length,
  analysis_in_sync: false,
});

const analysis = (over: Partial<PackageAnalysis> = {}): PackageAnalysis => ({
  n: 160,
  d: 11,
  target: "titer_g_L",
  group_col: null,
  targets: ["titer_g_L"],
  features: ["pH", "temperature_C"],
  cv_spearman: 0.655,
  cv_ci95: [0.539, 0.767],
  conformal_q: 0.2036,
  conformal_coverage: 0.9,
  best: 1.422,
  drivers: [{ name: "temperature_C", rho: 0.318, ci95: [0.177, 0.457], significant: true }],
  proposal_features: ["pH", "temperature_C"],
  feature_ranges: { pH: [6.005, 7.594], temperature_C: [30.039, 38.968] },
  proposals: [
    { vals: [7, 36], pred: 1.75, std: 0.069, mode: "exploit", reason: "predicted high", recipe: { pH: 7, temperature_C: 36 } },
    { vals: [6.5, 31], pred: 0.9, std: 0.3, mode: "explore", reason: "uncertain region" },
  ],
  oof: [],
  reliability: { spearman: 0.655, ci95: [0.539, 0.767], spearman_floor: 0.2, clears_floor: true, ci_excludes_zero: true, unmodeled: [] },
  promotion: { passed: false, failures: ["feasibility_auc=0.626 < min 0.65"], metrics: { feasibility_auc: 0.6256 }, summary: "GATES FAILED", meaning: "not yet shown fit" },
  run: { input_sha256: "i".repeat(64), filename: "runs.csv", sheet: null, build_sha: "unknown", library_versions: { numpy: "2.5.1" }, seed: 1234, data_drops: { rows_dropped: 0 } },
  proposal_provenance: { ...prov, build_sha: "abc123", library_versions: { torch: "2.13.0" } },
  validation: { schema_version: 1, status: "pass_with_warnings", mode: "warn", n_rows: 160, n_columns: 13, checks_run: ["outliers"], counts: { error: 0, warning: 1, info: 0 }, findings: [], conversions: [] },
  provenance: [{ name: "pH", status: "kept_feature", coerced_cells: 0, non_null: 160 }],
  data_drops: { rows_dropped: 0, censored_rows_excluded: 0 },
  design_box_exclusions: [],
  engine_version: "0.1.0",
  seed: 1234,
  timestamp: 1795058474,
  dataset: "runs.csv",
  ...over,
});

describe("buildPackage", () => {
  const pkg = buildPackage(meta, summary(), analysis(), AT);

  it("is versioned and self-describing", () => {
    expect(pkg).toMatchObject({ kind: "kalos.data-package", schema_version: 2, generated_by: "kalos-web", generated_at: "2026-11-19T10:30:00.000Z" });
    expect(pkg.campaign).toEqual({ id: "cmp_1", name: "Fed-batch CHO", created_at: 1795058340, round: 0, analysis_in_sync: false });
  });

  it("maximizes by default, says so, and takes the target from the summary", () => {
    expect(pkg.objective).toMatchObject({ direction: "maximize", direction_source: "engine_default", target: "titer_g_L" });
    expect(pkg.objective.note).toMatch(/default/);
  });

  it("evidence is the engine's measured best and counts", () => {
    expect(pkg.evidence).toEqual({ best_measured: 1.422, n_base_rows: 160, n_measured_runs: 0, n_awaiting_runs: 1 });
    expect(pkg.history).toEqual([{ round: 0, best_measured: 1.422, n_base: 160 }]);
  });

  it("labels the observed box as a search box, not an operating range", () => {
    expect(pkg.data.observed_design_space.ranges).toEqual({ pH: [6.005, 7.594], temperature_C: [30.039, 38.968] });
    expect(pkg.data.observed_design_space.label).toMatch(/observed search box/i);
    expect(pkg.data.observed_design_space.label).toMatch(/not an operating range/i);
  });

  it("carries the data description and fingerprint", () => {
    expect(pkg.data).toMatchObject({ dataset: "runs.csv", filename: "runs.csv", sheet: null, n_rows: 160, n_features: 11, input_sha256: "i".repeat(64) });
    expect(pkg.data.validation?.status).toBe("pass_with_warnings");
    expect(pkg.data.columns).toHaveLength(1);
  });

  it("reports the conformal band with the engine's coverage and promotion as not enforced", () => {
    expect(pkg.model.conformal).toEqual({ half_width: 0.2036, coverage: 0.9, caveat: null });
    expect(pkg.model.promotion).toMatchObject({ passed: false, enforced: false, failures: ["feasibility_auc=0.626 < min 0.65"] });
    expect(pkg.model.reliability).toMatchObject({ verdict: "reliable", label: "Reliable" });
    expect(pkg.model.cv_ci95).toEqual([0.539, 0.767]);
  });

  it("proposals keep predictions in their own block, with the full recipe", () => {
    expect(pkg.proposals[0]).toEqual({
      index: 1,
      recipe: { pH: 7, temperature_C: 36 },
      mode: "exploit",
      reason: "predicted high",
      predicted: {
        value: 1.75,
        sd: 0.069,
        band_half_width: 0.2036,
        band_coverage: 0.9,
        p_feasible: null,
        predictive_std: null,
        intervals: [],
        gp_intervals: [],
        // The global band travels with its trust caveat (the fixed text: this analysis sent no engine caveat).
        interval_caveats: [
          { applies_to: "global_band", coverage: 0.9, text: CAVEAT, source: "web_fixed_text", engine_code: null, interval_basis: null, coverage_at_proposals_estimate: null },
        ],
      },
    });
    // Older engine without `recipe`: falls back to proposal_features + vals.
    expect(pkg.proposals[1].recipe).toEqual({ pH: 6.5, temperature_C: 31 });
    expect(pkg.proposals[0]).not.toHaveProperty("measured");
  });

  it("an awaiting run has predicted values and measured null", () => {
    expect(pkg.runs[0]).toMatchObject({ id: "r1", status: "awaiting", predicted: { value: 1.75, sd: 0.069 }, measured: null });
    expect(pkg.runs[0].recipe).toEqual({ pH: 7, medium_base: "ProCHO" });
    expect(pkg.runs[0].proposed_by).toMatchObject({ provenance_sha256: "p".repeat(64), seed: 1234 });
  });

  it("a measured run carries its version, previous value and reason", () => {
    const p = buildPackage(
      meta,
      summary([run({ awaiting: false, result: 1.9, result_version: 2, previous_result: 1.6, result_reason: "typo", result_actor: "ana", result_recorded_at: 1795060000 })]),
      analysis(),
      AT,
    );
    expect(p.runs[0]).toMatchObject({
      status: "measured",
      predicted: { value: 1.75, sd: 0.069 },
      measured: { value: 1.9, version: 2, previous: 1.6, reason: "typo", recorded_by: "ana", recorded_at: 1795060000 },
    });
  });

  it("a run flagged not awaiting but without a result is not called measured", () => {
    const p = buildPackage(meta, summary([run({ awaiting: false, result: null })]), analysis(), AT);
    expect(p.runs[0]).toMatchObject({ status: "awaiting", measured: null });
  });

  it("missing values are null, never 0", () => {
    const bare = analysis({
      conformal_q: undefined,
      conformal_coverage: undefined,
      cv_ci95: undefined,
      cv_spearman: null,
      engine_version: undefined,
      seed: undefined,
      timestamp: undefined,
      run: undefined,
      proposal_provenance: undefined,
      reliability: undefined,
      promotion: undefined,
      validation: undefined,
      feature_ranges: undefined,
    });
    const p = buildPackage(meta, summary([run({ pred: Number.NaN, std: undefined as unknown as number, analysis_provenance: null, round: undefined })]), bare, AT);
    expect(p.model.conformal).toEqual({ half_width: null, coverage: null, caveat: null });
    expect(p.model.cv_spearman).toBeNull();
    expect(p.model.cv_ci95).toBeNull();
    expect(p.model.promotion).toBeNull();
    expect(p.model.reliability.label).toBe("Not enough data");
    expect(p.data.validation).toBeNull();
    expect(p.data.observed_design_space.ranges).toBeNull();
    expect(p.provenance).toMatchObject({ engine_version: null, seed: null, input_sha256: null, provenance_sha256: null, config_sha256: null, build_sha: null, run_record: null });
    expect(p.proposals[0].predicted.band_half_width).toBeNull();
    expect(p.runs[0]).toMatchObject({ round: null, predicted: { value: null, sd: null }, proposed_by: null });
  });

  it("works before any analysis and for the no-campaign summary", () => {
    const p = buildPackage(meta, { has_campaign: false }, null, AT);
    expect(p.objective.target).toBeNull();
    expect(p.evidence).toEqual({ best_measured: null, n_base_rows: null, n_measured_runs: null, n_awaiting_runs: null });
    expect(p.runs).toEqual([]);
    expect(p.proposals).toEqual([]);
    expect(p.campaign.analysis_in_sync).toBeNull();
  });

  it("merges library versions and prefers the proposal provenance build sha", () => {
    expect(pkg.provenance.library_versions).toEqual({ numpy: "2.5.1", torch: "2.13.0" });
    expect(pkg.provenance.build_sha).toBe("abc123");
    expect(pkg.provenance.config_sha256).toBe("c".repeat(64));
    expect(pkg.provenance.run_record?.filename).toBe("runs.csv");
  });

  it("lists every not-included item with a reason, and no longer claims the engine lacks the report routes", () => {
    expect(pkg.not_included.map((n) => n.item)).toEqual(NOT_INCLUDED.map((n) => n.item));
    for (const n of pkg.not_included) expect(n.reason.length).toBeGreaterThan(10);
    expect(pkg.not_included[0].reason).toMatch(/input_sha256/);
    const text = packageJson(pkg);
    expect(text).not.toMatch(/not exported by the engine|not computed by the engine|does not expose them|keeps no stage registry/i);
  });

  it("says plainly which report sections were not read rather than leaving them empty", () => {
    expect(pkg.result_history).toMatchObject({ status: "unavailable", code: "not_read" });
    expect(pkg.gates).toMatchObject({ status: "unavailable", code: "not_read" });
    expect(pkg.raw_rows).toMatchObject({ status: "unavailable", code: "not_read" });
    expect(pkg.operating_ranges).toMatchObject({ status: "not_requested" });
  });

  it("serializes to JSON without NaN or 95%", () => {
    const text = packageJson(pkg);
    expect(JSON.parse(text).kind).toBe("kalos.data-package");
    expect(text).not.toMatch(/NaN|95% band/);
  });
});

describe("csvCell", () => {
  it("escapes quotes, commas and newlines per RFC 4180", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("cr\rhere")).toBe('"cr\rhere"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("missing and non-finite are empty, never 0", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(0)).toBe("0");
  });
  it("guards text against formula injection but leaves numbers alone", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("=a,b")).toBe("\"'=a,b\"");
    expect(csvCell(-0.5)).toBe("-0.5");
    expect(csvCell(1.23456789)).toBe("1.23456789");
  });
  it("toCsv joins with CRLF and ends with one", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});

describe("runsCsv", () => {
  const measuredRun = run({ id: "r2", awaiting: false, result: -0.25, result_version: 2, previous_result: 1.6, result_reason: 'fixed "units", again', result_recorded_at: 1795060000 });
  const csv = runsCsv(buildPackage(meta, summary([run(), measuredRun]), analysis(), AT));
  const lines = csv.trimEnd().split("\r\n");
  const header = lines[0].split(",");

  it("has separate predicted_* and measured_* columns, then the recipe", () => {
    expect(header.slice(0, RUNS_FIXED_COLUMNS.length)).toEqual([...RUNS_FIXED_COLUMNS]);
    expect(header).toContain("predicted_value");
    expect(header).toContain("measured_value");
    expect(header.slice(RUNS_FIXED_COLUMNS.length)).toEqual(["pH", "medium_base"]);
  });

  it("leaves measured cells empty for an awaiting run", () => {
    const cells = lines[1].split(",");
    const col = (name: string) => cells[header.indexOf(name)];
    expect(col("run_status")).toBe("awaiting");
    expect(col("predicted_value")).toBe("1.75");
    expect(col("measured_value")).toBe("");
    expect(col("measured_version")).toBe("");
    expect(col("started_at")).toBe("2026-11-19T03:25:03.000Z");
  });

  it("writes a measured run with escaping and a numeric negative unguarded", () => {
    expect(lines[2]).toContain(',-0.25,2,1.6,"fixed ""units"", again",');
    expect(lines[2]).toContain("2026-11-19T03:46:40.000Z");
    expect(lines[2]).toContain(",7,ProCHO");
  });
});

describe("proposalsCsv", () => {
  it("lists predictions only, with the band and its coverage", () => {
    const csv = proposalsCsv(buildPackage(meta, summary(), analysis(), AT));
    const [head, first, second] = csv.trimEnd().split("\r\n");
    expect(head).toBe([...PROPOSALS_FIXED_COLUMNS, "pH", "temperature_C"].join(","));
    expect(head).not.toMatch(/measured/);
    expect(first).toBe(`1,exploit,predicted high,1.75,0.069,0.2036,0.9,${CAVEAT},,7,36`);
    expect(second).toBe(`2,explore,uncertain region,0.9,0.3,0.2036,0.9,${CAVEAT},,6.5,31`);
  });
  it("an empty batch is a header only", () => {
    expect(proposalsCsv({ proposals: [] })).toBe(`${PROPOSALS_FIXED_COLUMNS.join(",")}\r\n`);
  });
});

describe("file names", () => {
  it("slugifies campaign names", () => {
    expect(slugify("Fed-batch CHO #3 (Über)")).toBe("fed-batch-cho-3-uber");
    expect(slugify("  ***  ")).toBe("campaign");
    expect(slugify("a".repeat(80))).toHaveLength(60);
  });
  it("uses the UTC date", () => {
    expect(packageFilename("Default campaign", "package", AT)).toBe("kalos-default-campaign-20261119.json");
    expect(packageFilename("Default campaign", "runs", AT)).toBe("kalos-default-campaign-runs-20261119.csv");
    expect(packageFilename("Default campaign", "batch", AT)).toBe("kalos-default-campaign-batch-20261119.csv");
    expect(packageFilename("Default campaign", "rows", AT)).toBe("kalos-default-campaign-rows-20261119.csv");
    expect(packageFilename("Default campaign", "rows-json", AT)).toBe("kalos-default-campaign-rows-20261119.json");
  });
});

describe("packageContents", () => {
  it("describes what the package holds and flags what the engine did not send", () => {
    const items = packageContents(buildPackage(meta, summary(), analysis({ validation: undefined }), AT));
    const by = Object.fromEntries(items.map((i) => [i.label, i]));
    expect(by["Proposed batch"]).toMatchObject({ detail: "2 recipes", present: true });
    expect(by["Runs"]).toMatchObject({ detail: "1 run: 0 measured, 1 awaiting", present: true });
    expect(by["Validation report"]).toMatchObject({ present: false });
    expect(by["Observed search box"].detail).toBe("2 inputs");
  });
  it("never prints a made-up count before an analysis", () => {
    const items = packageContents(buildPackage(meta, { has_campaign: false }, null, AT));
    expect(items.find((i) => i.label === "Data description")).toMatchObject({ detail: "No analysis yet", present: false });
  });
});
