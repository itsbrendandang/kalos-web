import { describe, expect, it } from "vitest";
import type { Campaign, CampaignDetail, GatesView, OperatingRanges, ResultHistory, RowsExport, SetupView } from "@/lib/api";
import { buildPackage, goalOf, packageContents, packageJson, proposalsCsv, runsCsv, type PackageAnalysis, type PackageExtras } from "@/lib/report-package";
import analysisFixture from "./fixtures/report-v2-analysis.json";
import detailFixture from "./fixtures/report-v2-detail.json";
import gatesFixture from "./fixtures/report-v2-gates.json";
import historyFixture from "./fixtures/report-v2-history.json";
import computedFixture from "./fixtures/report-v2-operating-ranges-computed.json";
import notComputedFixture from "./fixtures/report-v2-operating-ranges-not-computed.json";
import rowsFixture from "./fixtures/report-v2-export-rows.json";
import setupFixture from "./fixtures/report-v2-setup.json";

/*
 * The data package against real engine v2 responses (captured from the live
 * engine on the E2E fixture campaign: one corrected result, one awaiting run,
 * a fresh analysis with per-proposal intervals and target_unit).
 */

const detail = detailFixture as unknown as CampaignDetail;
const summary = detail.summary as Campaign;
const analysis = analysisFixture as unknown as PackageAnalysis;
const history = historyFixture as unknown as ResultHistory;
const AT = new Date("2026-11-19T20:00:00Z");

const extras = (over: Partial<PackageExtras> = {}): PackageExtras => ({
  history: { status: "loaded", results: history.results!.items, audit: history.audit!.items, notes: history.notes ?? {}, complete: true, pages: 1 },
  gates: { status: "loaded", data: gatesFixture as unknown as GatesView },
  rows: { status: "loaded", data: rowsFixture as unknown as RowsExport },
  setup: { status: "loaded", data: setupFixture as unknown as SetupView },
  operatingRanges: null,
  ...over,
});

const pkg = buildPackage(detail.campaign, summary, analysis, AT, extras());

describe("data package v2 (real engine responses)", () => {
  it("carries the engine's target unit and the goal with its source", () => {
    // The summary says maximize, but the stored setup is the engine default: nobody set a goal.
    expect(pkg.objective).toMatchObject({ target: "titer_g_L", unit: "g/L", direction: "maximize", direction_source: "engine_default" });
    expect(pkg.objective.target_unit).toEqual({ unit: "g/L", source: "header", header: "titer_g_L", note: "parsed from the target column header" });
    expect(pkg.objective.setup.applied).toBeNull();
    expect(pkg.objective.setup.stored).toMatchObject({ source: "default", settings_in_sync: true });
  });

  it("a stored setup makes the summary's goal a campaign choice; an applied analysis goal wins", () => {
    const stored = { status: "loaded" as const, data: { ...(setupFixture as unknown as SetupView), source: "stored" as const, setup: { ...(setupFixture as unknown as SetupView).setup, goal: "minimize" as const } } };
    const p = buildPackage(detail.campaign, { ...summary, goal: "minimize" } as Campaign, analysis, AT, extras({ setup: stored }));
    expect(p.objective).toMatchObject({ direction: "minimize", direction_source: "campaign" });
    const q = buildPackage(detail.campaign, summary, { ...analysis, goal: "minimize" }, AT, extras());
    expect(q.objective).toMatchObject({ direction: "minimize", direction_source: "analysis" });
  });

  it("goalOf prefers the analysis, then the campaign, then the engine default", () => {
    expect(goalOf({ goal: "minimize" }, { goal: "maximize" })).toEqual({ direction: "minimize", source: "analysis" });
    expect(goalOf({}, { goal: "minimize" })).toEqual({ direction: "minimize", source: "campaign" });
    expect(goalOf(null, null)).toEqual({ direction: "maximize", source: "engine_default" });
  });

  it("keeps every engine interval level per proposal, verbatim, with the model-based GP bands apart", () => {
    expect(pkg.model.interval_levels).toEqual([0.9, 0.95]);
    expect(pkg.model.interval_method?.method).toBe("conformal_normalized");
    const p = pkg.proposals[0].predicted;
    expect(p.intervals.map((i) => i.coverage)).toEqual([0.9, 0.95]);
    expect(p.intervals[0]).toMatchObject({ available: true, lo: 1.5951, hi: 1.9051, method: "conformal_normalized" });
    expect(p.gp_intervals[0]).toMatchObject({ method: "gp_posterior", note: "model-based, not held-out calibrated" });
    expect(p.predictive_std).toBe(0.0717);
  });

  it("records each run's prediction at start, residual and inside-band check as the engine computed them", () => {
    const measured = pkg.runs.find((r) => r.status === "measured")!;
    expect(measured).toMatchObject({ pred_source: "engine", residual: -0.07, residual_basis: "derived", inside_band: true });
    expect(measured.prediction_at_start).toMatchObject({ available: true, interval: { lo: 1.5464, hi: 1.9536, coverage: 0.9 } });
    const awaiting = pkg.runs.find((r) => r.status === "awaiting")!;
    expect(awaiting).toMatchObject({ residual: null, inside_band: null });
  });

  it("includes the result history with the correction and the audit log, detail kept raw", () => {
    expect(pkg.result_history.status).toBe("included");
    if (pkg.result_history.status !== "included") return;
    expect(pkg.result_history.complete).toBe(true);
    const correction = pkg.result_history.results.find((r) => r.is_correction)!;
    expect(correction).toMatchObject({ version: 2, value: 1.68, previous_value: 1.6, reason: "E2E fixture: re-read plate", basis: "measured" });
    expect(pkg.result_history.audit.find((a) => a.action === "campaign.result")?.detail).toMatch(/^\{"actor"/);
    expect(pkg.result_history.notes.results).toMatch(/append-only/);
  });

  it("keeps recorded gate decisions and computed evidence in separate fields", () => {
    expect(pkg.gates.status).toBe("included");
    if (pkg.gates.status !== "included") return;
    expect(pkg.gates.current_stage).toBeNull();
    expect(pkg.gates.decisions.map((d) => d.gate)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    for (const d of pkg.gates.decisions) {
      expect(d.decision).toBeNull();
      expect(d).not.toHaveProperty("computed_evidence");
    }
    expect(pkg.gates.computed_evidence.S1).toMatchObject({ available: true, basis: "computed" });
  });

  it("keeps raw-rows metadata (counts, attribution, anonymization) but never the rows", () => {
    expect(pkg.raw_rows).toMatchObject({
      status: "included",
      n_original_rows: 160,
      n_folded_rows: 0,
      n_unattributed_rows: null,
      original_rows_identifiable: true,
      original_rows_reason: null,
      anonymization: { applied: false },
    });
    expect(packageJson(pkg)).not.toContain('"R001"');
  });

  it("an unidentifiable upload is reported with the engine's reason, every row unattributed", () => {
    const rows = {
      ...(rowsFixture as unknown as RowsExport),
      original_rows_identifiable: false,
      original_rows_reason: "the fold history does not check out",
      original_rows: null,
      folded_rows: null,
      unattributed_rows: { origin: "unknown", n: 161, rows: [] },
    };
    const p = buildPackage(detail.campaign, summary, analysis, AT, extras({ rows: { status: "loaded", data: rows } }));
    expect(p.raw_rows).toMatchObject({ original_rows_identifiable: false, original_rows_reason: "the fold history does not check out", n_unattributed_rows: 161, n_original_rows: null });
    expect(packageContents(p).find((i) => i.label.startsWith("Raw data"))?.detail).toBe("161 unattributed rows, original rows not identifiable");
  });

  it("a refused export is carried as its code and reason, not as zero rows", () => {
    const p = buildPackage(detail.campaign, summary, analysis, AT, extras({ rows: { status: "unavailable", code: "anonymized_export_unavailable", reason: "refused" } }));
    expect(p.raw_rows).toEqual({ status: "unavailable", code: "anonymized_export_unavailable", reason: "refused" });
  });

  it("carries an operating-ranges answer from this session: computed or the engine's not_computed reason", () => {
    const req = { threshold: 0.2, probability: 0.5, basis: "target" as const };
    const computed = buildPackage(detail.campaign, summary, analysis, AT, extras({ operatingRanges: { status: "answered", request: req, requested_at: AT.toISOString(), outcome: computedFixture as unknown as OperatingRanges } }));
    expect(computed.operating_ranges).toMatchObject({ status: "answered", outcome: { status: "computed", model_based: true, must_verify_experimentally: true } });
    const refused = buildPackage(detail.campaign, summary, analysis, AT, extras({ operatingRanges: { status: "answered", request: req, requested_at: AT.toISOString(), outcome: notComputedFixture as unknown as OperatingRanges } }));
    expect(refused.operating_ranges).toMatchObject({ outcome: { status: "not_computed", reason_code: "no_region_found" } });
    expect(packageContents(refused).find((i) => i.label === "Operating ranges")?.detail).toMatch(/^Not computed by the engine: /);
  });

  it("the runs CSV adds the prediction at start, residual and inside-band columns", () => {
    const [head, ...lines] = runsCsv(pkg).trimEnd().split("\r\n");
    const h = head.split(",");
    const measured = lines.map((l) => l.split(",")).find((c) => c[h.indexOf("run_status")] === "measured")!;
    expect(measured[h.indexOf("predicted_source")]).toBe("engine");
    expect(measured[h.indexOf("predicted_at_start_band_lo")]).toBe("1.5464");
    expect(measured[h.indexOf("predicted_at_start_band_coverage")]).toBe("0.9");
    expect(measured[h.indexOf("residual_measured_minus_predicted")]).toBe("-0.07");
    expect(measured[h.indexOf("inside_band_at_start")]).toBe("true");
  });

  it("the batch CSV adds one lo/hi pair per engine interval level", () => {
    const [head, first] = proposalsCsv(pkg).trimEnd().split("\r\n");
    const h = head.split(",");
    expect(h).toEqual(expect.arrayContaining(["interval_90_lo", "interval_90_hi", "interval_95_lo", "interval_95_hi"]));
    expect(first.split(",")[h.indexOf("interval_95_hi")]).toBe("1.976");
  });

  it("lists the new sections in the contents", () => {
    const by = Object.fromEntries(packageContents(pkg).map((i) => [i.label, i]));
    expect(by["Result history and audit log"]).toMatchObject({ present: true });
    expect(by["Result history and audit log"].detail).toMatch(/1 correction/);
    expect(by["Scale-up gate decisions"].detail).toMatch(/^0 gates of 6 with a recorded decision/);
    expect(by["Operating ranges"]).toMatchObject({ present: false, detail: "Not requested on this page in this session" });
    expect(by["Raw data export (counts and attribution)"].detail).toBe("160 uploaded rows, 0 folded-in rows");
    expect(by["Campaign and objective"].detail).toBe("E2E fixture capture, maximize titer_g_L (g/L)");
  });

  it("keeps provenance hashes", () => {
    expect(pkg.provenance.provenance_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.provenance.input_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
