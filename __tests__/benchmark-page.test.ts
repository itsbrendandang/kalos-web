import { describe, expect, it } from "vitest";
import { dimensionNames, multiVerdict, recipeDistance, singleVerdict } from "@/app/library/simulator/benchmark";

describe("benchmark page sentences", () => {
  it("measures the distance to the known optimum in the unit cube", () => {
    expect(recipeDistance([0.7, 0.3, 0.5], [0.7, 0.3, 0.5])).toBe(0);
    expect(recipeDistance([0, 0], [3, 4])).toBe(5);
  });

  it("states the single-objective result in one sentence", () => {
    const run = { best_recipe: [0.685, 0.289, 0.533], optimum: [0.7, 0.3, 0.5], trajectory: [{ round: 0, best: 1, n: 6 }, { round: 1, best: 2, n: 18 }] };
    expect(singleVerdict(run)).toBe("Found a recipe within 0.04 of the known optimum after 18 experiments.");
  });

  it("states the multi-objective result without naming a winner", () => {
    expect(multiVerdict({ pareto: [{ titer: 1, purity: 2 }, { titer: 2, purity: 1 }] })).toBe("Found 2 trade-off recipes; no single winner.");
    expect(multiVerdict({ pareto: [{ titer: 1, purity: 2 }] })).toBe("Found 1 trade-off recipe; no single winner.");
  });

  it("names the unlabeled dimensions x1..xn", () => {
    expect(dimensionNames(3)).toEqual(["x1", "x2", "x3"]);
  });
});
