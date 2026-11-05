import { describe, expect, it } from "vitest";
import { aimLine, directionWarning, lowerIsBetterWord } from "@/lib/objective";

describe("lowerIsBetterWord", () => {
  it("flags the names users usually want lower", () => {
    expect(lowerIsBetterWord("impurity_pct")).toBe("impurity");
    expect(lowerIsBetterWord("Impurities")).toBe("impurities");
    expect(lowerIsBetterWord("cost_per_g")).toBe("cost");
    expect(lowerIsBetterWord("time_to_peak_h")).toBe("time");
    expect(lowerIsBetterWord("byproduct_acetate_gL")).toBe("byproduct");
    expect(lowerIsBetterWord("contaminantCount")).toBe("contaminant");
    expect(lowerIsBetterWord("HostCellProtein-contaminant")).toBe("contaminant");
  });

  it("does not flag names that only contain the word inside another word", () => {
    expect(lowerIsBetterWord("runtime_index")).toBeNull();
    expect(lowerIsBetterWord("costume")).toBeNull();
    expect(lowerIsBetterWord("timepoint_label")).toBeNull();
  });

  it("leaves ordinary targets alone", () => {
    for (const t of ["titer_g_L", "biomass_gL", "yield", "purity_pct", "lipase_titer"]) expect(lowerIsBetterWord(t), t).toBeNull();
  });
});

describe("directionWarning", () => {
  it("is null for an ordinary target, an empty target, or no target", () => {
    expect(directionWarning("titer_g_L")).toBeNull();
    expect(directionWarning("")).toBeNull();
    expect(directionWarning(null)).toBeNull();
    expect(directionWarning(undefined)).toBeNull();
  });

  it("says plainly that Kalos raises the target and how to aim lower, naming the column", () => {
    const w = directionWarning("impurity_pct")!;
    expect(w).toContain("impurity_pct");
    expect(w).toMatch(/only aims to raise/);
    expect(w).toMatch(/negated values/);
    expect(w).not.toMatch(/engine|surrogate|maximi[sz]/i);
  });
});

describe("aimLine", () => {
  it("states the aim as raising the target, never as a best or a maximum", () => {
    expect(aimLine("titer_g_L")).toBe("Kalos aims to raise titer_g_L");
  });
});
