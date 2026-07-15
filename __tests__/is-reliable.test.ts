import { describe, expect, it } from "vitest";
import { isReliable, type Reliability } from "@/lib/api";

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
