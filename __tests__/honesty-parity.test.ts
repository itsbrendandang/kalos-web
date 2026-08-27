import { describe, expect, it } from "vitest";
import {
  calibrationNote,
  constraintNote,
  cvLogoNote,
  cvTopKNote,
  designBoxExclusionsNote,
  driverSelectionNote,
  groupMeanBaselineVerdict,
  isUnmeasuredFailure,
  proposalAuditNote,
  proposalGatingNote,
  repeatSpreadNote,
  type AnalyzeResult,
  type Calibration,
  type ConstraintReport,
  type CvGroupMeanBaseline,
  type CvLogo,
  type CvTopK,
  type DesignBoxExclusion,
  type DriverSelection,
} from "@/lib/api";

// Every helper here follows the same contract the rest of lib/api.ts already
// established (coveragePct, driverSelectionNote, reliabilityReason): absent
// field -> null, render nothing; present-but-unmeasured -> the engine's own
// stated reason, never a fabricated number.

function calibration(overrides: Partial<Calibration> = {}): Calibration {
  return { available: true, reason: null, n: 24, ece: 0.05, z_std: 1.3, levels: [{ nominal: 0.9, empirical: 0.83 }], ...overrides };
}

describe("calibrationNote", () => {
  it("renders nothing when the field is absent (older engine build)", () => {
    expect(calibrationNote(undefined)).toBeNull();
    expect(calibrationNote(null)).toBeNull();
  });

  it("explains itself when the engine could not measure it", () => {
    const note = calibrationNote(calibration({ available: false, reason: "only 3 held-out points", ece: null, z_std: null, levels: [] }));
    expect(note).toContain("only 3 held-out points");
    expect(note).not.toMatch(/ECE/);
  });

  it("names overconfidence when z_std is above 1", () => {
    expect(calibrationNote(calibration({ z_std: 1.3 }))).toContain("overconfident");
  });

  it("names a too-wide band when z_std is below 1", () => {
    expect(calibrationNote(calibration({ z_std: 0.6 }))).toContain("wide");
  });

  it("reports the ECE even when available", () => {
    expect(calibrationNote(calibration({ ece: 0.09 }))).toContain("0.09");
  });
});

describe("repeatSpreadNote", () => {
  it("renders nothing with fewer than 2 finite repeats", () => {
    expect(repeatSpreadNote(1, [0.5])).toBeNull();
    expect(repeatSpreadNote(2, [0.5, null])).toBeNull();
  });

  it("renders nothing when the fields are absent (older engine build)", () => {
    expect(repeatSpreadNote(undefined, undefined)).toBeNull();
  });

  it("shows the min-to-max spread across repeats", () => {
    const note = repeatSpreadNote(3, [0.42, 0.58, 0.31]);
    expect(note).toContain("0.31");
    expect(note).toContain("0.58");
    expect(note).toContain("3 repeats");
  });
});

describe("cvLogoNote", () => {
  it("renders nothing when the field is absent (older engine build)", () => {
    expect(cvLogoNote(undefined)).toBeNull();
  });

  it("explains why leave-one-group-out was not run", () => {
    const logo: CvLogo = { spearman: null, n_groups: null, n_oof: null, reason: "no declared/detected group column" };
    expect(cvLogoNote(logo)).toBe("no declared/detected group column");
  });

  it("reports the held-out generalization score when computed", () => {
    const logo: CvLogo = { spearman: 0.42, n_groups: 6, n_oof: 30, reason: null };
    const note = cvLogoNote(logo);
    expect(note).toContain("0.42");
    expect(note).toContain("6");
    expect(note).toContain("30");
  });
});

describe("cvTopKNote", () => {
  it("renders nothing when the field is absent (older engine build)", () => {
    expect(cvTopKNote(undefined)).toBeNull();
  });

  it("explains why top-k overlap was not evaluable", () => {
    const topk: CvTopK = { overlap: null, k: 5, n: 3, evaluable: false, reason: "only 3 evaluable held-out rows; need at least k=5" };
    expect(cvTopKNote(topk)).toContain("need at least k=5");
  });

  it("reports how many of the true top-k the model caught", () => {
    const topk: CvTopK = { overlap: 0.6, k: 5, n: 20, evaluable: true, reason: null };
    expect(cvTopKNote(topk)).toBe("3 of the true top 5 caught (n=20).");
  });
});

describe("groupMeanBaselineVerdict", () => {
  it("renders nothing when the field is absent (older engine build)", () => {
    expect(groupMeanBaselineVerdict(0.5, undefined)).toBeNull();
  });

  it("explains why the baseline was not evaluable, and is never prominent", () => {
    const baseline: CvGroupMeanBaseline = { spearman: null, n_evaluable: 0, n_groups_used: 0, interpretation: null, reason: "only 2 recipes have 2+ rows" };
    const v = groupMeanBaselineVerdict(0.5, baseline);
    expect(v?.text).toContain("only 2 recipes");
    expect(v?.prominent).toBe(false);
  });

  it("is prominent when the model does not clearly beat the floor - the honest moment", () => {
    const baseline: CvGroupMeanBaseline = {
      spearman: 0.6,
      n_evaluable: 40,
      n_groups_used: 12,
      interpretation: "A model whose CV Spearman does not clearly beat this floor may be recognizing recipes, not modeling the process.",
      reason: null,
    };
    // model's own cv_spearman (0.55) does not exceed the baseline (0.6)
    const v = groupMeanBaselineVerdict(0.55, baseline);
    expect(v?.prominent).toBe(true);
    expect(v?.text).toContain("not modeling the process");
  });

  it("is quiet when the model clearly beats the floor", () => {
    const baseline: CvGroupMeanBaseline = { spearman: 0.4, n_evaluable: 40, n_groups_used: 12, interpretation: "floor text", reason: null };
    const v = groupMeanBaselineVerdict(0.7, baseline);
    expect(v?.prominent).toBe(false);
  });

  it("is prominent (fails closed) when the model's own cv_spearman is unscored", () => {
    const baseline: CvGroupMeanBaseline = { spearman: 0.4, n_evaluable: 40, n_groups_used: 12, interpretation: "floor text", reason: null };
    expect(groupMeanBaselineVerdict(null, baseline)?.prominent).toBe(true);
  });
});

describe("designBoxExclusionsNote", () => {
  it("renders nothing when nothing was excluded", () => {
    expect(designBoxExclusionsNote([])).toBeNull();
  });

  it("renders nothing when the field is absent (older engine build)", () => {
    expect(designBoxExclusionsNote(undefined)).toBeNull();
  });

  it("discloses which columns were narrowed and by how much", () => {
    const exclusions: DesignBoxExclusion[] = [{ column: "pH", n_excluded: 3, lower: 5.5, upper: 8.2 }];
    const note = designBoxExclusionsNote(exclusions);
    expect(note).toContain("pH");
    expect(note).toContain("3 rows excluded");
  });
});

describe("proposalAuditNote", () => {
  it("renders nothing when both fields are absent (older engine build)", () => {
    expect(proposalAuditNote(undefined, undefined)).toBeNull();
  });

  it("reports the optimizer and in-flight count together", () => {
    const note = proposalAuditNote("mixed_exact", 2);
    expect(note).toContain("mixed_exact optimizer");
    expect(note).toContain("2 in-flight recipes considered");
  });

  it("still reports zero in-flight recipes rather than omitting it", () => {
    // 0 is meaningful (a one-shot upload with nothing running) - must not be
    // treated the same as "field absent".
    expect(proposalAuditNote("continuous", 0)).toContain("0 in-flight recipe");
  });
});

describe("proposalGatingNote", () => {
  it("renders nothing when the field is absent (older engine build, or before this NEW field shipped)", () => {
    expect(proposalGatingNote(undefined)).toBeNull();
  });

  it("passes through the engine's stated reason either way", () => {
    expect(proposalGatingNote({ gated: false, reason: "not zero-inflated enough", n_infeasible: 1, feasibility_auc: null, threshold: 0 })).toBe(
      "not zero-inflated enough",
    );
  });
});

describe("constraintNote", () => {
  it("renders nothing when the field is absent", () => {
    expect(constraintNote(undefined)).toBeNull();
  });

  it("renders nothing for the common inert case even though the field is present", () => {
    const c: ConstraintReport = { column: null, floor: null, n_rows_with_value: 0, applied: false, reason: "no constraint requested" };
    expect(constraintNote(c)).toBeNull();
  });

  it("discloses an applied constraint", () => {
    const c: ConstraintReport = { column: "purity", floor: 0.9, n_rows_with_value: 12, applied: true, reason: null };
    const note = constraintNote(c);
    expect(note).toContain("purity");
    expect(note).toContain("0.9");
  });

  it("explains why a requested constraint was not applied", () => {
    const c: ConstraintReport = { column: "purity", floor: 0.9, n_rows_with_value: 2, applied: false, reason: "only 2 rows have a numeric value" };
    expect(constraintNote(c)).toContain("only 2 rows have a numeric value");
  });
});

describe("isUnmeasuredFailure", () => {
  it("flags a failure line naming an unmeasured metric", () => {
    expect(isUnmeasuredFailure("feasibility_auc missing/NaN (unmeasured)")).toBe(true);
  });

  it("does not flag a failure line for a metric that was measured and fell short", () => {
    expect(isUnmeasuredFailure("surrogate_spearman=0.15 < min 0.20")).toBe(false);
  });
});

describe("driverSelectionNote unit disclosure", () => {
  function selection(overrides: Partial<DriverSelection> = {}): DriverSelection {
    return { n_tested: 30, n_reported: 5, top_k: 5, fdr_method: "benjamini_hochberg", fdr_q: 0.05, n_bootstrap: 200, ranked_by: "abs_rho", ...overrides };
  }

  it("keeps the existing disclosure unchanged when unit/n_units/n_rows are absent (older engine build)", () => {
    const note = driverSelectionNote(selection());
    expect(note).not.toContain("Tested per");
  });

  it("appends the per-recipe unit disclosure when present", () => {
    const note = driverSelectionNote(selection({ unit: "recipe", n_units: 20, n_rows: 60 }));
    expect(note).toContain("Tested per recipe (20 recipes, 60 rows).");
  });
});

describe("older-response-shape regression: a response missing every new field group renders without error", () => {
  // Mirrors result-sections.test.ts's baseResult() pattern: a persisted
  // record from before these fields existed. The *type* claims they're
  // optional; this proves every new helper agrees and degrades to null
  // rather than throwing when they're simply not there.
  function olderResult(): AnalyzeResult {
    return {
      n: 12,
      d: 3,
      target: "titer",
      group_col: null,
      targets: ["titer"],
      features: ["temp", "ph", "feed"],
      cv_spearman: 0.6,
      best: 4.2,
      drivers: [{ name: "temp", rho: 0.5, ci95: [0.1, 0.8], significant: true }],
      proposal_features: ["temp", "ph", "feed"],
      proposals: [{ vals: [1, 2, 3], pred: 4.1, std: 0.2, mode: "exploit", reason: "near optimum" }],
      oof: [[3.9, 4.0]],
    };
  }

  it("every new helper returns null against an older-shape result, without throwing", () => {
    const d = olderResult();
    expect(() => {
      expect(calibrationNote(d.reliability?.calibration)).toBeNull();
      expect(repeatSpreadNote(d.cv_n_repeats, d.cv_spearman_per_repeat)).toBeNull();
      expect(cvLogoNote(d.cv_logo)).toBeNull();
      expect(cvTopKNote(d.cv_topk)).toBeNull();
      expect(groupMeanBaselineVerdict(d.cv_spearman, d.cv_group_mean_baseline)).toBeNull();
      expect(designBoxExclusionsNote(d.design_box_exclusions)).toBeNull();
      expect(proposalAuditNote(d.proposal_optimizer, d.n_pending_considered)).toBeNull();
      expect(proposalGatingNote(d.proposal_gating)).toBeNull();
      expect(constraintNote(d.constraint)).toBeNull();
      expect(d.promotion).toBeUndefined();
      expect(d.proposals[0].p_feasible).toBeUndefined();
    }).not.toThrow();
  });
});
