import { describe, expect, it } from "vitest";
import type { ScaleReadout } from "@/lib/scale-readout";
import type { StagesView } from "@/lib/api";
import {
  DEFAULT_STAGE_VOLUMES,
  NO_BAND,
  backtestMethodLabel,
  decisionChip,
  describeScaleLadder,
  divergenceWord,
  predictionText,
  rungFlags,
  scaleLadderTable,
  sourceFromReadout,
  stageBandsFromStages,
  toScaleLadderData,
  visibleStageBands,
} from "@/lib/viz-data/scale-ladder";
import numberJson from "./fixtures/scale-v2-readout.json";
import refusedJson from "./fixtures/scale-v2-readout-refused.json";
import stagesJson from "./fixtures/scale-v2-stages.json";

/*
 * C9 ScaleLadderChart adapter against readouts captured from the live engine
 * (POST /api/scale/readout.json with ~/kalos/datasets/synthetic_scaleup.csv):
 * 7,500 L gives a NUMBER, 90,000 L a REFUSAL.
 */
const number = numberJson as unknown as ScaleReadout;
const refused = refusedJson as unknown as ScaleReadout;
const stages = stagesJson as unknown as StagesView;
const nb = (s: string) => s.replace(/\u00A0/g, " ");

describe("default stage volume ranges", () => {
  it("are identical to the engine's default stage definitions (GET /stages, source default)", () => {
    expect(stages.source).toBe("default");
    expect(stageBandsFromStages(stages.stages)).toEqual(DEFAULT_STAGE_VOLUMES);
  });
  it("skip stages without a volume (S1 media screen, S6 handoff)", () => {
    expect(stageBandsFromStages(stages.stages).map((b) => b.key)).toEqual(["S2", "S3", "S4", "S5"]);
  });
});

describe("toScaleLadderData (NUMBER at 7,500 L)", () => {
  const d = toScaleLadderData(number);

  it("plots every measured point and only the engine's backtest predictions", () => {
    expect(d.points).toHaveLength(number.scale_points!.length);
    // The two smallest scales were never held out: no backtest prediction, never a made-up one.
    expect(d.points.filter((p) => p.scaleL === 1).every((p) => p.oofPred === null)).toBe(true);
    expect(d.points.filter((p) => p.scaleL === 3).every((p) => p.oofPred === null)).toBe(true);
    expect(d.points.filter((p) => p.scaleL === 10).every((p) => p.oofPred != null)).toBe(true);
  });

  it("names the backtest nested leave-last-scale-out, never leave-one-scale-out", () => {
    expect(d.backtest?.label).toBe("nested leave-last-scale-out");
    expect(backtestMethodLabel("nested_leave_last_scale_out")).not.toMatch(/one/);
    expect(describeScaleLadder(d)).toMatch(/nested leave-last-scale-out/);
    expect(describeScaleLadder(d)).not.toMatch(/leave-one/);
  });

  it("carries the target prediction with the interval and coverage the engine reported", () => {
    expect(d.prediction.decision).toBe("NUMBER");
    expect(d.prediction.scaleL).toBe(7500);
    expect(d.prediction.prediction).toBe(number.prediction);
    expect(d.prediction.interval).toEqual({ lo: number.interval![0], hi: number.interval![1], coverage: 0.9, method: "scale-ladder" });
    expect(d.prediction.intervalLabel).toBe(number.interval_label);
    // Coverage text comes from interval_coverage (0.9), formatted, never typed.
    expect(nb(predictionText(d))).toBe("6.1 [5.6, 6.7] 90%");
  });

  it("zones come only from the engine's zones, starting at the largest trained scale", () => {
    expect(d.zones).toEqual({
      fromL: 5000,
      licensedMaxL: number.zones!.licensed_max_L,
      warnMaxL: number.zones!.warn_max_L,
      hardCapL: number.zones!.hard_cap_L,
      rule: number.zones!.rule,
    });
    expect(toScaleLadderData({ ...number, zones: null }).zones).toBeNull();
  });

  it("rungs read backtest.per_scale with the divergence detail", () => {
    expect(d.rungs.map((r) => r.scaleL)).toEqual([10, 30, 100, 300, 1000, 3000, 5000]);
    const r10 = d.rungs[0];
    expect(r10.mae).toBe(number.backtest!.per_scale[0].mae);
    expect(r10.measuredMean).toBe(number.backtest!.per_scale[0].measured_mean);
    expect(r10.bandHalfWidth).toBeNull();
    expect(r10.bandUnavailableReason).toMatch(/need at least 10/);
    expect(rungFlags(r10, d.minRungN)).toContain(NO_BAND);
    expect(d.rungs[1].bandHalfWidth).toBeCloseTo(0.2988, 3);
    expect(d.minRungN).toBe(3);
  });

  it("keeps skipped rungs with the engine's reason", () => {
    expect(d.skipped).toEqual([{ scaleL: 3, reason: number.skipped_rungs[0].reason }]);
  });

  it("the x domain spans the data, the target and the hard cap on a log axis", () => {
    expect(d.xDomain[0]).toBeLessThan(1);
    expect(d.xDomain[1]).toBeGreaterThan(100000);
  });

  it("the y domain includes every point and the full interval, so nothing is clipped", () => {
    const [lo, hi] = d.yDomain!;
    for (const p of d.points) {
      expect(p.actual).toBeGreaterThanOrEqual(lo);
      expect(p.actual).toBeLessThanOrEqual(hi);
    }
    expect(number.interval![1]).toBeLessThanOrEqual(hi);
    expect(d.maeDomain![0]).toBe(0);
  });

  it("clips stage bands to the axis and reports the ones outside it", () => {
    const { shown, outside } = visibleStageBands(d);
    expect(shown.map((b) => b.key)).toEqual(["S4", "S5"]);
    expect(outside.map((b) => b.key)).toEqual(["S2", "S3"]);
    expect(shown[0].minL).toBe(0.5);
    expect(shown[1]).toEqual({ key: "S5", label: "Bioreactor", minL: 2, maxL: 50 });
  });

  it("uses a campaign's own stage bands when given", () => {
    const custom = toScaleLadderData(number, { bands: [{ key: "P1", label: "Pilot", minL: 100, maxL: 2000 }], source: "campaign" });
    expect(custom.stages.source).toBe("campaign");
    expect(visibleStageBands(custom).shown.map((b) => b.key)).toEqual(["P1"]);
  });

  it("the Data table has one row per scale, then the target with its coverage", () => {
    const t = scaleLadderTable(d);
    expect(t.columns[0]).toBe("Scale");
    const scales = t.rows.map((r) => nb(r[0]));
    expect(scales).toEqual(["1 L", "3 L", "10 L", "30 L", "100 L", "300 L", "1,000 L", "3,000 L", "5,000 L", "7,500 L (target)"]);
    expect(t.rows[0][7]).toBe("training only (never held out)");
    expect(t.rows[1][7]).toMatch(/^skipped: training set has 1 distinct/);
    expect(t.rows[1][2]).toBe("n/a");
    expect(nb(t.rows[t.rows.length - 1][7])).toBe("predicted 6.1 [5.6, 6.7] 90%");
    // n/a, never 0, for a value the engine did not send.
    expect(t.rows.flat().some((c) => c === "0")).toBe(false);
  });

  it("describes the chart in plain words", () => {
    const text = nb(describeScaleLadder(d));
    expect(text).toMatch(/^Measured titer_g_per_L at 9 scales from 1 L to 5,000 L \(90 runs\)\./);
    expect(text).toMatch(/7 scales were held out/);
    expect(text).toMatch(/beat both naive baselines at 7 of 7/);
    expect(text).toMatch(/At the target 7,500 L the engine predicts 6\.1 \[5\.6, 6\.7\], 90% approximate coverage\./);
    expect(text).toMatch(/licensed to 33,333 L, warning to 83,333 L, refused beyond/);
  });

  it("a source points at the readout id, engine build and upload hash", () => {
    const s = sourceFromReadout(number, "prediction", "predicted", "synthetic_scaleup.csv");
    expect(s.label).toBe("Scale-up readout of synthetic_scaleup.csv");
    expect(s.method).toBe(`readout ${number.readout_id}`);
    expect(s.inputSha256).toBe(number.provenance!.raw_upload_sha256);
    expect(s.engineVersion).toBe("0.1.0");
    expect(s.timestamp).toBe(Date.parse(number.generated_at_utc!));
  });
});

describe("toScaleLadderData (REFUSAL at 90,000 L)", () => {
  const d = toScaleLadderData(refused);

  it("has no prediction and no interval, but keeps the evidence", () => {
    expect(d.prediction.decision).toBe("REFUSAL");
    expect(d.prediction.prediction).toBeNull();
    expect(d.prediction.interval).toBeNull();
    expect(d.points.length).toBeGreaterThan(0);
    expect(d.rungs.length).toBeGreaterThan(0);
  });

  it("labels the refusal slot with the engine's first reason", () => {
    expect(predictionText(d)).toBe("Refused: target ratio 18.00x exceeds 5x the reference step ratio 3.33x");
    expect(d.prediction.dataPlan).toEqual(refused.data_plan);
    expect(nb(describeScaleLadder(d))).toMatch(/At the target 90,000 L the engine refused: target ratio 18\.00x/);
  });

  it("the decision chip is a neutral hatch, never red", () => {
    expect(decisionChip("REFUSAL")).toEqual({ word: "Refused", tone: "refused" });
    expect(decisionChip("NUMBER")).toEqual({ word: "Prediction", tone: "neutral" });
    expect(decisionChip("NUMBER_WITH_WARNING")).toEqual({ word: "Prediction with warning", tone: "warn" });
  });

  it("ignores a stray prediction on a refusal (the engine nulls it; the chart never invents one)", () => {
    const odd = toScaleLadderData({ ...refused, prediction: 5, interval: [4, 6] });
    expect(odd.prediction.prediction).toBeNull();
    expect(odd.prediction.interval).toBeNull();
  });
});

describe("flags and divergence", () => {
  it("divergence codes read as words", () => {
    expect(divergenceWord("did_not_beat_baselines")).toBe("did not beat baselines");
    expect(divergenceWord("outside_backtest_band")).toBe("outside backtest band");
    expect(divergenceWord("brand_new_code")).toBe("brand new code");
  });

  it("maps divergence flags and per_scale codes onto the rungs", () => {
    const flagged: ScaleReadout = {
      ...number,
      divergence: {
        computed: true,
        rule: "r",
        flags: [{ scale_L: 30, codes: ["outside_backtest_band"] }],
        per_scale: (number.divergence as { per_scale: NonNullable<Extract<ScaleReadout["divergence"], { computed: true }>>["per_scale"] }).per_scale.map((p) =>
          p.scale_L === 100 ? { ...p, codes: ["did_not_beat_baselines"], beats_both: false } : p,
        ),
      },
    };
    const d = toScaleLadderData(flagged);
    expect(d.rungs.find((r) => r.scaleL === 30)!.codes).toEqual(["outside_backtest_band"]);
    expect(d.rungs.find((r) => r.scaleL === 100)!.codes).toEqual(["did_not_beat_baselines"]);
    expect(rungFlags(d.rungs.find((r) => r.scaleL === 100)!, 3)).toContain("did not beat baselines");
    expect(nb(describeScaleLadder(d))).toMatch(/30 L: outside backtest band\./);
  });

  it("too few to judge reads with the engine's minimum", () => {
    const d = toScaleLadderData(number);
    expect(rungFlags({ ...d.rungs[3], tooFew: true }, 3)).toContain("n < 3");
    expect(rungFlags({ ...d.rungs[3], tooFew: true }, null)).toContain("too few to judge");
  });

  it("an uncomputed divergence keeps the engine's reason", () => {
    const d = toScaleLadderData({ ...number, divergence: { computed: false, reason: "no rungs", rule: "r" } });
    expect(d.divergence).toEqual({ computed: false, reason: "no rungs", rule: "r" });
    expect(d.rungs.every((r) => r.codes.length === 0)).toBe(true);
  });
});
