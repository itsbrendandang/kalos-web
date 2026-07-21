import { describe, expect, it } from "vitest";
import { SCALE_STAGES, pathSummary, projectScaleUp, type ScaleStage } from "@/lib/scaleup-projection";

const RECIPE = { pH: 6.5, Methanol: 2.0 };
const OBJECTIVES = { yield: 10, purity: 96 };

describe("projectScaleUp (lib/scaleup-projection.ts)", () => {
  it("is deterministic - identical input produces identical output", () => {
    const a = projectScaleUp(RECIPE, OBJECTIVES);
    const b = projectScaleUp(RECIPE, OBJECTIVES);
    expect(a).toEqual(b);
  });

  it("is a pure function of its arguments, not of call order/timing", () => {
    const first = projectScaleUp(RECIPE, OBJECTIVES);
    // call a few times with different inputs in between, then repeat the original call
    projectScaleUp(RECIPE, { yield: 1 });
    projectScaleUp({ Other: 1 }, { yield: 99, purity: 10 });
    const again = projectScaleUp(RECIPE, OBJECTIVES);
    expect(again).toEqual(first);
  });

  it("returns all 5 stages, in SCALE_STAGES order, for every path", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    expect(paths).toHaveLength(3);
    const expectedStageOrder = SCALE_STAGES.map((s) => s.stage);
    for (const path of paths) {
      expect(path.stages.map((s) => s.stage)).toEqual(expectedStageOrder);
      expect(path.stages).toHaveLength(5);
    }
  });

  it("returns exactly the three named paths", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    expect(paths.map((p) => p.id).sort()).toEqual(["fastest", "max_yield", "min_cost"]);
  });

  it("widens every metric's band monotonically stage over stage, for every path", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    for (const path of paths) {
      (["yield", "purity", "costPerL", "timeDays"] as const).forEach((metric) => {
        const bands = path.stages.map((s) => s[metric].band);
        for (let i = 1; i < bands.length; i++) {
          expect(bands[i]).toBeGreaterThan(bands[i - 1]);
        }
      });
    }
  });

  it("seeds the plate_96w stage's yield from the real measured bestObjectives.yield", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    for (const path of paths) {
      const plate = path.stages.find((s) => s.stage === "plate_96w" as ScaleStage);
      expect(plate?.yield.value).toBe(OBJECTIVES.yield);
      expect(plate?.yield.band).toBe(0);
    }
  });

  it("projects purity from a prior when bestObjectives.purity is undefined", () => {
    const paths = projectScaleUp(RECIPE, { yield: 10 });
    for (const path of paths) {
      const plate = path.stages.find((s) => s.stage === "plate_96w" as ScaleStage);
      expect(plate?.purity.value).toBeGreaterThan(0);
    }
  });

  it("orders max_yield's final-stage yield at or above the other two paths", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    const finalYield = (id: string) => paths.find((p) => p.id === id)!.stages.at(-1)!.yield.value;
    expect(finalYield("max_yield")).toBeGreaterThanOrEqual(finalYield("min_cost"));
    expect(finalYield("max_yield")).toBeGreaterThanOrEqual(finalYield("fastest"));
  });

  it("orders min_cost's final-stage cost/L at or below the other two paths", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    const finalCost = (id: string) => paths.find((p) => p.id === id)!.stages.at(-1)!.costPerL.value;
    expect(finalCost("min_cost")).toBeLessThanOrEqual(finalCost("max_yield"));
    expect(finalCost("min_cost")).toBeLessThanOrEqual(finalCost("fastest"));
  });

  it("orders fastest's total cycle time at or below the other two paths", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    const totalTime = (id: string) => paths.find((p) => p.id === id)!.stages.at(-1)!.timeDays.value;
    expect(totalTime("fastest")).toBeLessThanOrEqual(totalTime("max_yield"));
    expect(totalTime("fastest")).toBeLessThanOrEqual(totalTime("min_cost"));
  });

  it("accepts a custom priors table and still produces monotonic bands", () => {
    type StagePrior = { yieldRetention: number; purityRetention: number; costMultiplier: number; cycleTimeDays: number; bandWidening: number };
    const flatStage = (bandWidening: number, cycleTimeDays: number): StagePrior => ({
      yieldRetention: 0.9,
      purityRetention: 0.95,
      costMultiplier: 0.8,
      cycleTimeDays,
      bandWidening,
    });
    const table: Record<ScaleStage, StagePrior> = {
      plate_96w: flatStage(0, 3),
      shake_flask: flatStage(0.05, 4),
      benchtop_bioreactor: flatStage(0.05, 5),
      pilot: flatStage(0.05, 6),
      production: flatStage(0.05, 7),
    };
    const custom = projectScaleUp(RECIPE, OBJECTIVES, { max_yield: table, min_cost: table, fastest: table });
    for (const path of custom) {
      const bands = path.stages.map((s) => s.yield.band);
      for (let i = 1; i < bands.length; i++) expect(bands[i]).toBeGreaterThan(bands[i - 1]);
    }
  });
});

describe("pathSummary (lib/scaleup-projection.ts)", () => {
  it("produces a one-line string citing cost delta, total time, and purity retained", () => {
    const paths = projectScaleUp(RECIPE, OBJECTIVES);
    for (const path of paths) {
      const summary = pathSummary(path);
      expect(summary).toMatch(/% cost\/L · \d+ d total · \d+% purity retained/);
    }
  });

  it("is deterministic for the same path", () => {
    const [path] = projectScaleUp(RECIPE, OBJECTIVES);
    expect(pathSummary(path)).toBe(pathSummary(path));
  });
});
