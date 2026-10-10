import { describe, expect, it } from "vitest";
import { coveragePct, driverSelectionNote, isReliable, type DriverSelection, type Reliability, reliabilityReason } from "@/lib/api";
import { verdict } from "@/components/projects/phase2-live";

function reliability(overrides: Partial<Reliability>): Reliability {
  return {
    spearman: 0.4,
    ci95: [0.1, 0.7],
    spearman_floor: 0.2,
    clears_floor: true,
    ci_excludes_zero: true,
    unmodeled: [],
    ...overrides,
  };
}

function selection(overrides: Partial<DriverSelection> = {}): DriverSelection {
  return {
    n_tested: 30,
    n_reported: 5,
    top_k: 5,
    fdr_method: "Benjamini-Hochberg",
    fdr_q: 0.1,
    n_bootstrap: 1000,
    ranked_by: "|rho|",
    ...overrides,
  };
}

describe("coveragePct", () => {
  it("formats a fraction as a whole-number percentage", () => {
    expect(coveragePct(0.9)).toBe("90%");
    expect(coveragePct(0.95)).toBe("95%");
  });

  it("never guesses a number - returns null when the field is absent", () => {
    expect(coveragePct(undefined)).toBeNull();
    expect(coveragePct(null)).toBeNull();
  });

  it("returns null for a non-finite value rather than rendering garbage", () => {
    expect(coveragePct(NaN)).toBeNull();
  });
});

describe("driverSelectionNote", () => {
  it("discloses how many features were tested and how many are shown", () => {
    const note = driverSelectionNote(selection({ n_tested: 42, n_reported: 5 }));
    expect(note).toContain("42");
    expect(note).toContain("5");
  });

  it("renders nothing when the engine did not report a selection process", () => {
    expect(driverSelectionNote(undefined)).toBeNull();
    expect(driverSelectionNote(null)).toBeNull();
  });
});

describe("verdict (phase2-live)", () => {
  // The verdict must never disagree with isReliable() - that's the whole point
  // of routing through it instead of re-deriving the 0.20-floor check locally.
  it("agrees with isReliable() when reliable", () => {
    const rel = reliability({ clears_floor: true, ci_excludes_zero: true });
    const d = { reliability: rel, cv_ci95: rel.ci95, cv_spearman: rel.spearman };
    expect(verdict(d).tone).toBe("ok");
    expect(isReliable(d)).toBe(true);
  });

  it("agrees with isReliable() when clears_floor is false (not reliable)", () => {
    const rel = reliability({ clears_floor: false, ci_excludes_zero: true });
    const d = { reliability: rel, cv_ci95: rel.ci95, cv_spearman: rel.spearman };
    expect(verdict(d).tone).not.toBe("ok");
    expect(isReliable(d)).toBe(false);
  });

  it("agrees with isReliable() when ci_excludes_zero is false (not reliable)", () => {
    const rel = reliability({ clears_floor: true, ci_excludes_zero: false });
    const d = { reliability: rel, cv_ci95: rel.ci95, cv_spearman: rel.spearman };
    expect(verdict(d).tone).not.toBe("ok");
    expect(isReliable(d)).toBe(false);
  });

  it("reads the floor from the engine's spearman_floor, not a hardcoded value", () => {
    const rel = reliability({ clears_floor: true, ci_excludes_zero: true, spearman_floor: 0.35 });
    const d = { reliability: rel, cv_ci95: rel.ci95, cv_spearman: rel.spearman };
    expect(verdict(d).text).toContain("0.35");
    expect(verdict(d).text).not.toContain("0.20");
  });

  it("is bad when there is no reliability block", () => {
    expect(verdict({ reliability: undefined, cv_ci95: null, cv_spearman: null }).tone).toBe("bad");
  });
});

describe("reliabilityReason", () => {
  const base = { cv_spearman: 0.5, cv_ci95: [0.1, 0.8] as [number, number] };

  it("names the real reason when the floor is cleared but the CI spans zero", () => {
    // The regression this exists for. `isReliable` is
    // clears_floor AND ci_excludes_zero, so this dataset is not reliable - but
    // the old copy said "Below the 0.20 floor", which is false: it cleared it.
    // A scientist debugging the verdict would have chased the wrong number.
    expect(
      reliabilityReason({
        ...base,
        reliability: {
          spearman: 0.42,
          spearman_floor: 0.2,
          clears_floor: true,
          ci_excludes_zero: false,
          ci95: [-0.05, 0.7],
          unmodeled: [],
        },
      }),
    ).toBe("Clears the 0.20 floor, but its 95% CI includes zero");
  });

  it("says below the floor only when the score is actually below it", () => {
    expect(
      reliabilityReason({
        ...base,
        reliability: {
          spearman: 0.11,
          spearman_floor: 0.2,
          clears_floor: false,
          ci_excludes_zero: false,
          ci95: [-0.2, 0.4],
          unmodeled: [],
        },
      }),
    ).toBe("Below the 0.20 floor");
  });

  it("uses the engine's floor rather than a hardcoded 0.20", () => {
    const out = reliabilityReason({
      ...base,
      reliability: {
        spearman: 0.05,
        spearman_floor: 0.35,
        clears_floor: false,
        ci_excludes_zero: false,
        ci95: [-0.3, 0.3],
        unmodeled: [],
      },
    });
    expect(out).toBe("Below the 0.35 floor");
    expect(out).not.toContain("0.20");
  });
});
