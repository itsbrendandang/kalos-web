import { describe, expect, it } from "vitest";
import type { Driver } from "@/lib/api";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { bestSoFarSeries, topDrivers } from "@/lib/overview";

const d = (name: string, rho: number, ci95: [number, number], significant: boolean): Driver => ({ name, rho, ci95, significant });

describe("topDrivers", () => {
  it("ranks by absolute correlation and keeps the engine's significance verdict", () => {
    const bars = topDrivers([d("pH", 0.2, [0.05, 0.35], true), d("Temp_C", -0.6, [-0.8, -0.3], true), d("Feed", 0.4, [-0.1, 0.7], false)], 2);
    expect(bars.map((b) => b.name)).toEqual(["Temp_C", "Feed"]);
    expect(bars[1].significant).toBe(false);
  });

  it("turns the CI into distances below and above rho", () => {
    const [bar] = topDrivers([d("pH", 0.4, [0.1, 0.6], true)]);
    expect(bar.ci[0]).toBeCloseTo(0.3);
    expect(bar.ci[1]).toBeCloseTo(0.2);
    expect([bar.lo, bar.hi]).toEqual([0.1, 0.6]);
  });
});

describe("bestSoFarSeries", () => {
  it("is the measured history, one point per round, gaps kept", () => {
    const s = bestSoFarSeries({ ...DEMO_CAMPAIGN, history: [{ round: 0, best: 4.6, n_base: 24 }, { round: 1, best: null, n_base: 26 }] });
    expect(s).toEqual([
      { round: 0, best: 4.6, runs: 24 },
      { round: 1, best: null, runs: 26 },
    ]);
  });
});
