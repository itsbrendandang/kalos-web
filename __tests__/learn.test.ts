import { describe, expect, it } from "vitest";
import type { CampaignRun, Promotion } from "@/lib/api";
import { bandCalibration, calibrationSentence, canPlanNext, promotionLine, verdictImpact } from "@/components/campaign/learn";
import type { ActiveCampaign } from "@/lib/workbench";

const run = (pred: number, result: number | null): CampaignRun => ({
  id: `r${pred}-${result}`, recipe: {}, pred, std: 0.1, mode: "exploit", reason: "", result, awaiting: result == null,
});

describe("bandCalibration", () => {
  it("counts runs whose result is within the band of the prediction, edge inclusive", () => {
    expect(bandCalibration([run(5, 5.2), run(5, 5.5), run(5, 4.4), run(5, 6)], 0.5)).toEqual({ inside: 2, total: 4 });
  });
  it("leaves out awaiting runs", () => {
    expect(bandCalibration([run(5, 5.1), run(5, null)], 0.5)).toEqual({ inside: 1, total: 1 });
  });
  it("is null when the engine sent no band", () => {
    expect(bandCalibration([run(5, 5)], null)).toBeNull();
    expect(bandCalibration([run(5, 5)], undefined)).toBeNull();
    expect(bandCalibration([run(5, 5)], Number.NaN)).toBeNull();
  });
  it("is zero of zero with no measured runs", () => {
    expect(bandCalibration([], 0.5)).toEqual({ inside: 0, total: 0 });
    expect(bandCalibration([run(5, null)], 0.5)).toEqual({ inside: 0, total: 0 });
  });
});

describe("calibrationSentence", () => {
  it("states k of n with the engine's coverage", () => {
    expect(calibrationSentence({ inside: 3, total: 5 }, 0.9)).toBe("3 of 5 measured results landed inside their likely range. The range is meant to hold 90% of results.");
  });
  it("omits the coverage rather than guessing it", () => {
    expect(calibrationSentence({ inside: 3, total: 5 })).toBe("3 of 5 measured results landed inside their likely range.");
  });
});

describe("canPlanNext", () => {
  const campaign = (pending: CampaignRun[]) => ({ has_campaign: true, pending }) as unknown as ActiveCampaign;
  it("is off without a campaign or with nothing measured", () => {
    expect(canPlanNext(null)).toBe(false);
    expect(canPlanNext(campaign([]))).toBe(false);
    expect(canPlanNext(campaign([run(5, null)]))).toBe(false);
  });
  it("is on with at least one measured result, even if others still await", () => {
    expect(canPlanNext(campaign([run(5, null), run(5, 4)]))).toBe(true);
  });
});

describe("promotionLine", () => {
  const promo = (passed: boolean, failures: string[]): Promotion => ({ passed, failures, metrics: {}, summary: "", meaning: "" });
  it("is null when cleared or not reported", () => {
    expect(promotionLine(undefined)).toBeNull();
    expect(promotionLine(promo(true, []))).toBeNull();
  });
  it("says the first failing check in plain words with one fix, never the raw gate text", () => {
    const line = promotionLine(promo(false, ["feasibility_auc=0.625 < min 0.65", "ece=0.2 > max 0.15"]))!;
    expect(line.sentence).toBe("The model has not passed every check yet: it cannot yet tell which recipes will fail outright (1 more check also fell short).");
    expect(line.fix).toBe("If some runs produce nothing, record them too: the model needs failed runs to learn what fails.");
    expect(line.why).toBe("feasibility_auc");
    expect(`${line.sentence} ${line.fix}`).not.toMatch(/auc|ece|0\.65|feasib/);
  });
  it("explains an unmeasurable gate as a check that could not be run", () => {
    const line = promotionLine(promo(false, ["feasibility_auc missing/NaN (unmeasured)"]))!;
    expect(line.sentence).toContain("could not be run on this sheet");
    expect(line.why).toBe("unmeasured");
  });
  it("has no why code for a gate this app has no words for", () => {
    expect(promotionLine(promo(false, ["something_new=1 < 2"]))!.why).toBeNull();
  });
});

describe("verdictImpact", () => {
  it("says what the next round does for each verdict", () => {
    expect(verdictImpact("reliable", true, 3)).toBe("Plan round 3 uses it to suggest the next round of recipes.");
    expect(verdictImpact("reliable", false, 3)).toContain("has not passed every check yet");
    expect(verdictImpact("not-yet", true, 2)).toContain("ideas to try");
    expect(verdictImpact("insufficient", true, 2)).toContain("Too few past runs could be tested");
  });
});
