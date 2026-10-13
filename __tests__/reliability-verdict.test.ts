import { describe, expect, it } from "vitest";
import { isReliable, reliabilityVerdict, type Reliability } from "@/lib/api";

const rel = (over: Partial<Reliability>): Reliability => ({
  spearman: 0.5,
  ci95: [0.3, 0.7],
  spearman_floor: 0.2,
  clears_floor: true,
  ci_excludes_zero: true,
  unmodeled: [],
  ...over,
});

describe("reliabilityVerdict", () => {
  it("agrees with isReliable() on the reliable case", () => {
    const d = { reliability: rel({}), cv_spearman: 0.5, cv_ci95: [0.3, 0.7] as [number, number] };
    const v = reliabilityVerdict(d);
    expect(isReliable(d)).toBe(true);
    expect(v).toMatchObject({ state: "reliable", label: "Reliable", rho: 0.5, ci: [0.3, 0.7], floor: 0.2 });
    expect(v.reason).toContain("stays above");
  });

  it("never says the interval clears when its lower bound sits below the floor", () => {
    const v = reliabilityVerdict({ reliability: rel({ ci95: [0.1, 0.7] }), cv_spearman: 0.5 });
    expect(v.state).toBe("reliable");
    expect(v.reason).toContain("still reaches below it");
    expect(v.reason).not.toMatch(/clears/i);
  });

  it("is not yet reliable below the floor", () => {
    const v = reliabilityVerdict({ reliability: rel({ spearman: 0.1, clears_floor: false }), cv_spearman: 0.1 });
    expect(v).toMatchObject({ state: "not-yet", label: "Not yet reliable" });
    expect(v.reason).toContain("below the trust floor (0.20)");
  });

  it("says a legacy interval that includes zero includes zero, not that it is below a floor", () => {
    const v = reliabilityVerdict({ cv_spearman: 0.4, cv_ci95: [-0.1, 0.6] });
    expect(v.state).toBe("not-yet");
    expect(v.reason).toContain("interval that includes zero");
    expect(v.reason).not.toContain("below the trust floor");
  });

  it("is not yet reliable above the floor when the interval includes zero", () => {
    const v = reliabilityVerdict({
      reliability: rel({ ci95: [-0.1, 0.7], ci_excludes_zero: false }),
      cv_spearman: 0.5,
    });
    expect(v.state).toBe("not-yet");
    expect(v.reason).toContain("includes zero");
  });

  it("says there is not enough data when rank agreement was never measured", () => {
    const v = reliabilityVerdict({ reliability: rel({ spearman: null, ci95: null }), cv_spearman: null });
    expect(v).toMatchObject({ state: "insufficient", label: "Not enough data", rho: null });
  });

  it("falls back to the top-level CV fields on older engines", () => {
    expect(reliabilityVerdict({ cv_spearman: 0.4, cv_ci95: [0.1, 0.6] }).state).toBe("reliable");
    expect(reliabilityVerdict({ cv_spearman: 0.4, cv_ci95: [-0.1, 0.6] }).state).toBe("not-yet");
  });
});
