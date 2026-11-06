import { describe, expect, it } from "vitest";
import { modelVerdict, reliabilityVerdict, type Promotion, type Reliability } from "@/lib/api";

/*
 * First-time study, F3 (owner's decision): Kalos owns the verdict. The badge, the sentence and the
 * why-line on every page come from the engine's promotion verdict, never from the Spearman-vs-floor
 * rule; the rank score is carried only for the disclosure.
 */

const rel = (over: Partial<Reliability>): Reliability => ({
  spearman: 0.5,
  ci95: [0.3, 0.7],
  spearman_floor: 0.2,
  clears_floor: true,
  ci_excludes_zero: true,
  unmodeled: [],
  ...over,
});
const promo = (over: Partial<Promotion>): Promotion => ({ passed: true, failures: [], metrics: {}, summary: "", meaning: "", ...over });

describe("modelVerdict", () => {
  it("is Reliable only when Kalos says the model passed its checks, whatever the rank score", () => {
    const v = modelVerdict({ promotion: promo({ status: "passed" }), reliability: rel({}), cv_spearman: 0.5, cv_ci95: [0.3, 0.7] });
    expect(v).toMatchObject({ state: "reliable", label: "Reliable", why: "reliable", source: "kalos", rho: 0.5, ci: [0.3, 0.7], floor: 0.2, failed: [] });
    expect(v.reason).toMatch(/^The model passed every one of Kalos's checks/);
    expect(v.reason).not.toMatch(/held-out|spearman|interval|floor|\d/i);
    // A high rank score does not make it reliable on its own (the 13-row sheet that read "Reliable").
    const high = modelVerdict({ promotion: promo({ passed: false, status: "failed", failures: ["ece=0.31 > max 0.20"] }), reliability: rel({ spearman: 0.89 }), cv_spearman: 0.89 });
    expect(high.state).toBe("not-yet");
  });

  it("is Not yet reliable when a measured check missed, naming the check in the lab's words", () => {
    const v = modelVerdict({ promotion: promo({ passed: false, status: "failed", failures: ["surrogate_spearman=0.12 < min 0.20", "ece=0.31 > max 0.20"] }), reliability: rel({ spearman: 0.12, clears_floor: false }), cv_spearman: 0.12 });
    expect(v).toMatchObject({ state: "not-yet", label: "Not yet reliable", why: "not-yet", source: "kalos" });
    expect(v.reason).toBe("The model did not pass every one of Kalos's checks: it does not yet put the runs it was tested on in the right order (1 more check also fell short). Its suggestions are closer to guesses.");
    expect(v.failed).toEqual(["it does not yet put the runs it was tested on in the right order", "its likely range is wrong about how often it is right"]);
  });

  it("is Not enough runs to tell when every blocking check could not be measured, with the unmeasured why-line", () => {
    const v = modelVerdict({ promotion: promo({ passed: false, status: "not_measurable", failures: ["feasibility_auc unmeasured (no non-producers)"] }), reliability: rel({}), cv_spearman: 0.5 });
    expect(v).toMatchObject({ state: "insufficient", label: "Not enough runs to tell", why: "unmeasured", source: "kalos" });
    expect(v.reason).toMatch(/^Kalos could not finish checking the model: a check it needs \(feasibility auc\) could not be run on this sheet\./);
  });

  it("reads an older engine's passed flag and failure lines into the same states and marks them derived", () => {
    expect(modelVerdict({ promotion: promo({ passed: true }) })).toMatchObject({ state: "reliable", source: "derived" });
    expect(modelVerdict({ promotion: promo({ passed: false, failures: ["brier=0.4 > max 0.25"] }) })).toMatchObject({ state: "not-yet", source: "derived" });
    expect(modelVerdict({ promotion: promo({ passed: false, failures: ["feasibility_auc unmeasured", "brier missing"] }) })).toMatchObject({ state: "insufficient", why: "unmeasured", source: "derived" });
    expect(modelVerdict({ promotion: promo({ passed: false, failures: [] }) })).toMatchObject({ state: "not-yet", source: "derived" });
  });

  it("confirms nothing when Kalos sent no checks at all", () => {
    const v = modelVerdict({ reliability: rel({}), cv_spearman: 0.5, cv_ci95: [0.3, 0.7] });
    expect(v).toMatchObject({ state: "insufficient", label: "Not enough runs to tell", source: "none", rho: 0.5 });
    expect(v.reason).toContain("Kalos did not report its checks of the model");
  });

  it("carries the cv_ci_unavailable caveat only when a score was reported without an interval", () => {
    expect(modelVerdict({ promotion: promo({}), reliability: rel({}), cv_spearman: 0.5 }).caveat).toBeNull();
    expect(modelVerdict({ promotion: promo({}), reliability: rel({ ci95: null, ci_excludes_zero: false }), cv_spearman: 0.5 }).caveat).toBe("cv_ci_unavailable");
    expect(modelVerdict({ promotion: promo({}), reliability: rel({ spearman: null, ci95: null }), cv_spearman: null }).caveat).toBeNull();
  });

  it("keeps the old name as an alias of the same verdict for one release", () => {
    expect(reliabilityVerdict).toBe(modelVerdict);
  });
});
