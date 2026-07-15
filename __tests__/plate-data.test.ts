import { describe, expect, it } from "vitest";
import { generatePlate } from "@/lib/plate-data";

// Regression guard for commit c24ee2c: the high-outlier growth flag must gate
// behind the pass threshold, so a well can never simultaneously read as
// "low/very-low growth" and "high outlier growth". Checked across several
// seeds since the bug only reproduced under weak control separation.
describe("generatePlate growth-flag mutual exclusivity", () => {
  const seeds = [107107, 1, 2, 42, 999999];

  it.each(seeds)("seed %i: no well has both a low and a high-outlier growth flag", (seed) => {
    const plate = generatePlate(seed);
    for (const id of plate.expIds) {
      const growthLabels = plate.wells[id].flags.filter((f) => f.cat === "Growth").map((f) => f.label);
      const hasLow = growthLabels.some((l) => l === "Very low ΔOD" || l === "Low ΔOD");
      const hasHighOutlier = growthLabels.includes("High ΔOD (outlier growth)");
      expect(hasLow && hasHighOutlier).toBe(false);
    }
  });
});
