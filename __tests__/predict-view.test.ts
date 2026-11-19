import { describe, expect, it } from "vitest";
import {
  alternativeScaleNote,
  calibrationHeadline,
  evidenceFact,
  noiseFacts,
  predictHeadline,
  promotionView,
  rankAgreementFact,
  shapeText,
  splitDrivers,
  trustTone,
} from "@/components/predict/predict-view";
import { reliabilityVerdict, type Driver } from "@/lib/api";

const driver = (name: string, rho: number, significant: boolean): Driver => ({ name, rho, ci95: [rho - 0.1, rho + 0.1], significant });

describe("splitDrivers", () => {
  it("uses only the engine's significant flag, never the CI alone", () => {
    const { findings, noise } = splitDrivers([
      driver("a", 0.2, true),
      { ...driver("b", -0.4, false), ci_excludes_zero: true, survives_fdr: false },
      driver("c", -0.5, true),
    ]);
    expect(findings.map((d) => d.name)).toEqual(["c", "a"]);
    expect(noise.map((d) => d.name)).toEqual(["b"]);
  });

  it("handles a missing list", () => {
    expect(splitDrivers(undefined)).toEqual({ findings: [], noise: [] });
  });
});

describe("predictHeadline", () => {
  it("never claims reliability the verdict does not give", () => {
    expect(predictHeadline({ state: "reliable", proposals: 5, round: 1 })).toMatch(/above its trust floor\. 5 proposals ready/);
    expect(predictHeadline({ state: "not-yet", proposals: 5, round: 1 })).toMatch(/not yet reliable.*exploration/);
    expect(predictHeadline({ state: "insufficient", proposals: 1, round: 1 })).toMatch(/too few held-out runs.*1 proposal as exploration/);
  });

  it("points to Validate once runs are in flight", () => {
    expect(predictHeadline({ state: "reliable", proposals: null, inFlight: 3, round: 2 })).toBe("3 runs from round 2 are in flight. Record the results on Validate.");
    expect(predictHeadline({ state: "reliable", proposals: null, inFlight: 0, round: 2 })).toMatch(/have results\. Learn from them on Validate/);
  });

  it("says when the engine proposed nothing", () => {
    expect(predictHeadline({ state: "not-yet", proposals: 0, round: 1 })).toBe("The engine proposed no experiments this round.");
  });
});

describe("trust facts", () => {
  it("reads the engine's floor and CI, n/a when missing", () => {
    const v = reliabilityVerdict({ cv_spearman: 0.66, cv_ci95: [0.54, 0.77], reliability: { spearman: 0.66, ci95: [0.54, 0.77], spearman_floor: 0.25, clears_floor: true, ci_excludes_zero: true, unmodeled: [] } });
    const f = rankAgreementFact(v, "2 repeats: 0.66 to 0.67");
    expect(f.value).toBe("ρ 0.66");
    expect(f.caption).toBe("95% CI 0.54 to 0.77, trust floor 0.25, 2 repeats: 0.66 to 0.67");
    const none = rankAgreementFact(reliabilityVerdict({ cv_spearman: null }), null);
    expect(none.value).toBe("n/a");
    expect(none.caption).toMatch(/95% CI not reported, no trust floor reported/);
  });

  it("counts evidence and reads n/a for absent counts, never 0", () => {
    expect(evidenceFact({ n: 160, cv_n_groups: 40, cv_n_repeats: 1 })).toEqual({ label: "Evidence", value: "160 rows", caption: "40 CV groups, 1 repeat" });
    expect(evidenceFact({ n: 12 }).caption).toBe("CV groups n/a, repeats n/a");
  });

  it("words calibration without inventing a score", () => {
    expect(calibrationHeadline(undefined)).toBe("Not reported");
    expect(calibrationHeadline({ available: false, reason: "few points", n: 3, ece: null, z_std: null, levels: [] })).toBe("Not scored");
    expect(calibrationHeadline({ available: true, reason: null, n: 30, ece: 0.1, z_std: 1.4, levels: [] })).toBe("Bands read too narrow");
    expect(calibrationHeadline({ available: true, reason: null, n: 30, ece: 0.1, z_std: 0.7, levels: [] })).toBe("Bands read too wide");
    // Within the tolerance the honest reading is "close", not a direction (live kaggle sheet: z_std 1.03).
    expect(calibrationHeadline({ available: true, reason: null, n: 715, ece: 0.01, z_std: 1.03, levels: [] })).toBe("Close to calibrated");
    expect(calibrationHeadline({ available: true, reason: null, n: 715, ece: 0.01, z_std: 0.95, levels: [] })).toBe("Close to calibrated");
  });

  it("maps reliability states to tones", () => {
    expect(trustTone("reliable")).toBe("good");
    expect(trustTone("not-yet")).toBe("warn");
    expect(trustTone("insufficient")).toBe("neutral");
  });
});

describe("promotionView", () => {
  it("is null when the engine sent no verdict", () => {
    expect(promotionView(undefined)).toBeNull();
  });

  it("splits measured misses from unmeasured gates and keeps not-judged ones", () => {
    const v = promotionView({
      passed: false,
      failures: ["feasibility_auc=missing/NaN (unmeasured)", "ece=0.21 > max 0.15"],
      metrics: { surrogate_spearman: 0.655, ece: 0.1022, custom: 2 },
      summary: "GATES FAILED",
      meaning: "not yet shown fit",
      not_judged: ["group-mean floor"],
    })!;
    expect(v.headline).toBe("Not passed");
    expect(v.missed).toEqual(["ece=0.21 > max 0.15"]);
    expect(v.unmeasured).toEqual(["feasibility_auc=missing/NaN (unmeasured)"]);
    expect(v.notJudged).toEqual(["group-mean floor"]);
    expect(v.metrics).toEqual([
      { key: "surrogate_spearman", label: "Held-out rank agreement", value: "0.66" },
      { key: "ece", label: "Interval calibration error (ECE)", value: "0.102" },
      { key: "custom", label: "custom", value: "2.00" },
    ]);
  });
});

describe("diagnostics text", () => {
  it("words gp shapes, with the optimum only when the engine gave one", () => {
    const base = { name: "pH", relevance: 1, lengthscale: 1, optimum_at: null, peak_gain: null, peak_separation_sd: null, spearman_rho: 0, missed_by_spearman: false };
    expect(shapeText({ ...base, shape: "interior_optimum", optimum_at: 6.9 })).toBe("peaks inside the range, near 6.90");
    expect(shapeText({ ...base, shape: "interior_optimum" })).toBe("peaks inside the range");
    expect(shapeText({ ...base, shape: "monotonic_down" })).toBe("falls across the range");
  });

  it("reads n/a for noise values the engine sent as null", () => {
    const facts = noiseFacts({ n_recipes: 160, n_replicated: 0, replicate_aware: false, icc: null, noise_sd: null, signal_sd: 0.2288, best_single: 1.422, best_reproducible: null, scale: null });
    expect(facts.find((f) => f.label === "Noise SD")?.value).toBe("n/a");
    expect(facts.find((f) => f.label === "Signal SD")?.value).toBe("0.23");
    expect(facts.find((f) => f.label === "Replicated recipes")?.value).toBe("0 of 160");
    expect(noiseFacts(undefined)).toEqual([]);
  });

  it("gives the engine's reason when no alternative scale was scored", () => {
    expect(alternativeScaleNote(undefined)).toBeNull();
    expect(alternativeScaleNote({ scale: null, offset: null, cv_spearman: null, cv_ci95: null, calibration: null, icc: null, interpretation: null, reason: "too few replicates" })).toBe("too few replicates");
    expect(alternativeScaleNote({ scale: "log1p", offset: 1, cv_spearman: 0.7, cv_ci95: [0.5, 0.8], calibration: null, icc: null, interpretation: "ranks better on log scale", reason: null })).toBe(
      "On a log1p scale: ρ 0.70, 95% CI 0.50 to 0.80. ranks better on log scale",
    );
  });
});
