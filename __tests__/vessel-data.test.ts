import { describe, expect, it } from "vitest";
import { linearRegression } from "@/lib/vessel-data";

describe("linearRegression degenerate guard", () => {
  it("returns degenerate:true and r2:null for zero-variance input", () => {
    const xs = [5, 5, 5, 5, 5];
    const ys = [1, 2, 3, 4, 5];
    const fit = linearRegression(xs, ys);
    expect(fit.degenerate).toBe(true);
    expect(fit.r2).toBeNull();
  });

  it("returns a finite slope and r2 in [0, 1] for a normal input", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1];
    const fit = linearRegression(xs, ys);
    expect(fit.degenerate).toBe(false);
    expect(Number.isFinite(fit.slope)).toBe(true);
    expect(fit.r2).not.toBeNull();
    expect(fit.r2 as number).toBeGreaterThanOrEqual(0);
    expect(fit.r2 as number).toBeLessThanOrEqual(1);
  });
});
