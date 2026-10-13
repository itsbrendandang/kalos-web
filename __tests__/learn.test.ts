import { describe, expect, it } from "vitest";
import type { CampaignRun, Promotion } from "@/lib/api";
import { bandCalibration, calibrationSentence, canPlanNext, promotionLine } from "@/components/campaign/learn";
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
    expect(calibrationSentence({ inside: 3, total: 5 }, 0.9)).toBe("3 of 5 measured runs landed inside their predicted band (90%).");
  });
  it("omits the coverage rather than guessing it", () => {
    expect(calibrationSentence({ inside: 3, total: 5 })).toBe("3 of 5 measured runs landed inside their predicted band.");
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
    const line = promotionLine(promo(false, ["feasibility_auc=0.625 < min 0.65", "ece=0.2 > max 0.15"]));
    expect(line).toBe("Not cleared to promote: it cannot yet tell feasible recipes from infeasible ones (1 more check also fell short). Add runs that include some that failed or produced nothing.");
    expect(line).not.toMatch(/auc|ece|0\.65/);
  });
  it("explains an unmeasurable gate as unmeasured", () => {
    expect(promotionLine(promo(false, ["feasibility_auc missing/NaN (unmeasured)"]))).toContain("could not be measured on this data");
  });
});
