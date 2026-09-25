import { describe, expect, it } from "vitest";
import { isReliable, trustVerdict, type Promotion, type Reliability } from "@/lib/api";

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

describe("isReliable", () => {
  it("is false when clears_floor is false", () => {
    const rel = reliability({ clears_floor: false, ci_excludes_zero: true });
    expect(isReliable({ reliability: rel, cv_ci95: rel.ci95, cv_spearman: rel.spearman })).toBe(false);
  });

  it("is true when clears_floor && ci_excludes_zero", () => {
    const rel = reliability({ clears_floor: true, ci_excludes_zero: true });
    expect(isReliable({ reliability: rel, cv_ci95: rel.ci95, cv_spearman: rel.spearman })).toBe(true);
  });

  it("is false when reliability is undefined and there are too few groups", () => {
    // No `reliability` object and no cv_ci95 (e.g. too few recipe groups to fold) -
    // the fallback path must not fabricate a "reliable" verdict from a bare rho.
    expect(isReliable({ reliability: undefined, cv_ci95: null, cv_spearman: 0.6 })).toBe(false);
    expect(isReliable({ reliability: undefined, cv_ci95: undefined, cv_spearman: null })).toBe(false);
  });
});

function promotion(overrides: Partial<Promotion>): Promotion {
  return {
    passed: true,
    failures: [],
    metrics: {},
    summary: "ALL GATES PASSED",
    meaning: "passed=false means not yet shown fit to promote.",
    ...overrides,
  };
}

describe("trustVerdict", () => {
  const rel = reliability({ clears_floor: true, ci_excludes_zero: true });
  const base = { reliability: rel, cv_ci95: rel.ci95, cv_spearman: rel.spearman };

  it("is trusted only when the ranking is reliable AND the promotion gate passed", () => {
    expect(trustVerdict({ ...base, promotion: promotion({}) })).toEqual({ trusted: true, reason: null });
  });

  it("is not trusted when the gate fails, and names the FIRST failure", () => {
    const v = trustVerdict({
      ...base,
      promotion: promotion({
        passed: false,
        failures: ["feasibility_auc missing/NaN (unmeasured)", "ece missing/NaN (unmeasured)"],
        summary: "GATES FAILED: ...",
      }),
    });
    expect(v.trusted).toBe(false);
    expect(v.reason).toBe("Promotion gate: feasibility_auc missing/NaN (unmeasured)");
  });

  it("never trusts an engine that did not report the gate (fail closed)", () => {
    const v = trustVerdict({ ...base, promotion: undefined });
    expect(v.trusted).toBe(false);
    expect(v.reason).toMatch(/not reported/);
  });

  it("gives the ranking reason when the ranking itself is not reliable, even if the gate passed", () => {
    const weak = reliability({ clears_floor: false, spearman_floor: 0.2 });
    const v = trustVerdict({ reliability: weak, cv_ci95: weak.ci95, cv_spearman: weak.spearman, promotion: promotion({}) });
    expect(v.trusted).toBe(false);
    expect(v.reason).toBe("Below the 0.20 floor");
  });
});
