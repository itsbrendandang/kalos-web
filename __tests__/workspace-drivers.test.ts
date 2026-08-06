import { describe, expect, it } from "vitest";
import type { Driver, GpMainEffects } from "@/lib/api";
import {
  driverFindings,
  rankedDrivers,
  rankedEffects,
  topDriverAgreement,
} from "@/lib/workspace/driver-logic";
import {
  beatsBest,
  columnLabel,
  formatRecipeValue,
  modeSplit,
  recipeColumns,
  recipeDecimals,
} from "@/lib/workspace/proposal-logic";
import type { Proposal, Run, RunMode } from "@/lib/workspace/types";

const DRIVERS: Driver[] = [
  { name: "glucose_gL", rho: 0.36, ci95: [0.07, 0.59], significant: true },
  { name: "feed_start_day", rho: -0.58, ci95: [-0.74, -0.31], significant: true },
  { name: "osmolality", rho: 0.02, ci95: [-0.21, 0.25], significant: false },
];

describe("rankedDrivers", () => {
  it("ranks by absolute correlation, so a strong negative lever is not buried", () => {
    expect(rankedDrivers(DRIVERS).map((d) => d.name)).toEqual([
      "feed_start_day",
      "glucose_gL",
      "osmolality",
    ]);
  });

  it("keeps the sign and both interval bounds intact", () => {
    const top = rankedDrivers(DRIVERS, 1)[0];
    expect(top.rho).toBe(-0.58);
    expect(top.ciLow).toBe(-0.74);
    expect(top.ciHigh).toBe(-0.31);
    expect(top.significant).toBe(true);
  });

  it("does not mutate the caller's array", () => {
    const input = [...DRIVERS];
    rankedDrivers(input);
    expect(input[0].name).toBe("glucose_gL");
  });
});

describe("rankedEffects", () => {
  it("normalises against the strongest effect, not against an absolute scale", () => {
    const bars = rankedEffects([
      { name: "a", importance: 0.4 },
      { name: "b", importance: 0.8 },
    ]);
    expect(bars.map((b) => b.name)).toEqual(["b", "a"]);
    expect(bars[0].relative).toBe(1);
    expect(bars[1].relative).toBeCloseTo(0.5);
  });

  it("renders flat bars rather than NaN when every importance is zero", () => {
    const bars = rankedEffects([
      { name: "a", importance: 0 },
      { name: "b", importance: 0 },
    ]);
    expect(bars.every((b) => b.relative === 0)).toBe(true);
  });
});

const GP_AVAILABLE: GpMainEffects = {
  available: true,
  effects: [
    { name: "feed_start_day", importance: 1 },
    { name: "glucose_gL", importance: 0.71 },
  ],
};

describe("topDriverAgreement", () => {
  it("reports agreement when both rankings lead with the same input", () => {
    expect(topDriverAgreement(DRIVERS, GP_AVAILABLE)).toEqual({
      agree: true,
      dataTop: "feed_start_day",
      modelTop: "feed_start_day",
    });
  });

  it("reports disagreement rather than picking a winner", () => {
    const gp: GpMainEffects = { available: true, effects: [{ name: "glucose_gL", importance: 1 }] };
    expect(topDriverAgreement(DRIVERS, gp)).toEqual({
      agree: false,
      dataTop: "feed_start_day",
      modelTop: "glucose_gL",
    });
  });

  it("says nothing at all when the model has no estimate to compare", () => {
    expect(topDriverAgreement(DRIVERS, { available: false, reason: "too few points" })).toBeNull();
    expect(topDriverAgreement(DRIVERS, null)).toBeNull();
    expect(topDriverAgreement([], GP_AVAILABLE)).toBeNull();
  });
});

describe("driverFindings", () => {
  it("leads with the strongest significant driver and quotes its real interval", () => {
    const [first] = driverFindings(DRIVERS, GP_AVAILABLE);
    expect(first.headline).toBe("feed_start_day is the strongest measured lever.");
    expect(first.support).toContain("ρ -0.58");
    expect(first.support).toContain("-0.74 to -0.31");
    expect(first.support).toContain("lowers");
  });

  it("refuses to name a lever when nothing clears the noise floor", () => {
    const noisy: Driver[] = [{ name: "osmolality", rho: 0.02, ci95: [-0.21, 0.25], significant: false }];
    const [first] = driverFindings(noisy, null);
    expect(first.headline).toBe("No single input separates from noise yet.");
  });

  it("counts significant inputs out of the full list", () => {
    const findings = driverFindings(DRIVERS, GP_AVAILABLE);
    expect(findings[1].headline).toBe("Two of 3 inputs clear the noise floor.");
    expect(findings[1].support).toContain("one have 95% intervals that cross zero");
  });

  it("surfaces the engine's own reason verbatim when the model estimate is unavailable", () => {
    const gp: GpMainEffects = { available: false, reason: "Fewer than 20 points; the GP has no stable lengthscales." };
    const findings = driverFindings(DRIVERS, gp);
    expect(findings.at(-1)?.support).toBe("Fewer than 20 points; the GP has no stable lengthscales.");
  });

  it("says nothing when the engine reported no drivers", () => {
    expect(driverFindings([], GP_AVAILABLE)).toEqual([]);
  });
});

// --- proposal table ---------------------------------------------------------

function proposal(id: string, rank: number, recipe: Record<string, number>, mode: RunMode): Proposal {
  const run: Run = {
    id,
    recipe,
    status: "proposed",
    mode,
    predicted: 7,
    predictedBand: 0.4,
    measuredValue: null,
    reason: null,
  };
  return { id, rank, run, summary: null };
}

describe("recipeColumns", () => {
  it("derives columns from the batch in first-seen order", () => {
    const cols = recipeColumns([
      proposal("a", 1, { glucose_gL: 7.2, feed_start_day: 2 }, "exploit").run,
      proposal("b", 2, { feed_start_day: 4, pH_setpoint: 7 }, "explore").run,
    ]);
    expect(cols.keys).toEqual(["glucose_gL", "feed_start_day", "pH_setpoint"]);
    expect(cols.hidden).toEqual([]);
  });

  it("reports overflow columns rather than dropping them silently", () => {
    const cols = recipeColumns([proposal("a", 1, { a: 1, b: 2, c: 3, d: 4, e: 5 }, "exploit").run]);
    expect(cols.keys).toEqual(["a", "b", "c"]);
    expect(cols.hidden).toEqual(["d", "e"]);
  });

  it("has no columns for an empty batch", () => {
    expect(recipeColumns([])).toEqual({ keys: [], hidden: [] });
  });
});

describe("modeSplit / columnLabel / beatsBest", () => {
  it("counts the batch's own composition", () => {
    const split = modeSplit([
      proposal("a", 1, {}, "exploit"),
      proposal("b", 2, {}, "exploit"),
      proposal("c", 3, {}, "explore"),
    ]);
    expect(split).toEqual({ exploit: 2, explore: 1 });
  });

  it("undoes snake_case without re-casing the token itself", () => {
    expect(columnLabel("feed_start_day")).toBe("feed start day");
    expect(columnLabel("pH_setpoint")).toBe("pH setpoint");
  });

  it("only claims an improvement when both sides of the comparison exist", () => {
    expect(beatsBest(7.3, 6.4)).toBe(true);
    expect(beatsBest(6.1, 6.4)).toBe(false);
    expect(beatsBest(null, 6.4)).toBeNull();
    expect(beatsBest(7.3, null)).toBeNull();
  });
});

describe("recipeDecimals / formatRecipeValue", () => {
  const batch = [
    proposal("a", 1, { glucose_gL: 7.2, feed_start_day: 2 }, "exploit").run,
    proposal("b", 2, { glucose_gL: 7, feed_start_day: 3 }, "exploit").run,
  ];

  it("drops decimals on a column every proposal states as a whole number", () => {
    expect(recipeDecimals(batch, "feed_start_day")).toBe(0);
    expect(formatRecipeValue(3, recipeDecimals(batch, "feed_start_day"))).toBe("3");
  });

  it("keeps the whole column at two decimals as soon as one row is fractional", () => {
    expect(recipeDecimals(batch, "glucose_gL")).toBe(2);
    // The integer row in a fractional column still pads, so the decimal
    // points line up under tabular-nums.
    expect(formatRecipeValue(7, recipeDecimals(batch, "glucose_gL"))).toBe("7.00");
    expect(formatRecipeValue(7.2, recipeDecimals(batch, "glucose_gL"))).toBe("7.20");
  });

  it("treats a column no proposal states as whole-number, not as an error", () => {
    expect(recipeDecimals(batch, "not_a_column")).toBe(0);
  });
});
