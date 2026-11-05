import { describe, expect, it } from "vitest";
import engine from "./fixtures/engine-model-synthetic.json";
import { calibrationLine, driverRows, surfaceSlice } from "@/components/campaign/data/model-math";
import type { AnalyzeResult } from "@/lib/api";

const d = engine as unknown as AnalyzeResult;

describe("driverRows", () => {
  it("lists every input with its share, most relevant first, and reads the shape in words", () => {
    const rows = driverRows(d.gp_shapes, "Titer");
    expect(rows.length).toBe(d.gp_shapes!.features.length);
    expect(rows.map((r) => r.share)).toEqual([...rows.map((r) => r.share)].sort((a, b) => b - a));
    const sp = rows.find((r) => r.name === "SP")!;
    expect(sp.sentence).toBe("Higher values went with higher Titer across the range tested.");
    expect(rows.find((r) => r.name === "OD_OG")!.shape).toBe("flat");
  });

  it("carries the engine's missed-by-rank flag through unchanged", () => {
    const rows = driverRows(d.gp_shapes, "Titer");
    expect(rows.find((r) => r.name === "OD_Prod")!.missedBySpearman).toBe(true);
    expect(rows.find((r) => r.name === "SP")!.missedBySpearman).toBe(false);
  });

  it("returns nothing when the engine gave no shape reading, rather than inventing one", () => {
    expect(driverRows(undefined, "Titer")).toEqual([]);
    expect(driverRows({ available: false, reason: "no", swept_at: "", n_features: 0, features: [], unmodeled: [] }, "Titer")).toEqual([]);
  });

  it("names an interior optimum with its position, and an unknown shape plainly", () => {
    const rows = driverRows(
      {
        available: true,
        reason: null,
        swept_at: "incumbent",
        n_features: 2,
        unmodeled: [],
        features: [
          { name: "pH", relevance: 0.7, lengthscale: 1, shape: "interior_optimum", optimum_at: 7.04, peak_gain: 1, peak_separation_sd: 2, spearman_rho: 0, missed_by_spearman: true },
          { name: "temp", relevance: 0.3, lengthscale: 2, shape: "wobbly", optimum_at: null, peak_gain: null, peak_separation_sd: null, spearman_rho: 0.1, missed_by_spearman: false },
        ],
      } as unknown as AnalyzeResult["gp_shapes"],
      "titer",
    );
    expect(rows[0].sentence).toBe("Peaks inside the range, near 7.04; too much or too little is lower.");
    expect(rows[1].sentence).toBe("Shape not classified by the engine.");
  });
});

describe("surfaceSlice", () => {
  it("cuts the engine surface along its first input at the held value of the second", () => {
    const s = surfaceSlice(d.response_surface)!;
    expect(s.xName).toBe("SP");
    expect(s.yName).toBe("OD_OG");
    expect(s.xs.length).toBe(21);
    expect(s.yHeld).toBe(2.82);
    const ys = d.response_surface!.y_vals;
    expect(Math.abs(ys[s.yGrid] - 2.82)).toBeLessThanOrEqual((ys[1] - ys[0]) / 2 + 1e-9);
    expect(s.mean).toEqual(d.response_surface!.z[s.yGrid]);
  });

  it("builds the band from the engine's posterior sd grid, one sd either side of the mean", () => {
    const s = surfaceSlice(d.response_surface)!;
    const std = d.response_surface!.std!;
    expect(s.lo).not.toBeNull();
    expect(s.hi![3]).toBeCloseTo(s.mean[3] + std[s.yGrid][3], 4);
    expect(s.bandHalf).toBeCloseTo(Math.max(...std[s.yGrid]), 4);
    expect(s.lo![3]).toBeCloseTo(s.mean[3] - std[s.yGrid][3], 4);
  });

  it("keeps only measured runs near the held row, as [input, target] pairs", () => {
    const s = surfaceSlice(d.response_surface)!;
    expect(s.runsNear.length).toBeGreaterThan(0);
    expect(s.runsNear.length).toBeLessThan(d.response_surface!.runs.length);
    const pts = s.runsNear.map(([x]) => x);
    expect(pts.every((x) => x >= s.xs[0] - 1 && x <= s.xs[s.xs.length - 1] + 1)).toBe(true);
  });

  it("drops the band with no sd grid, and returns null for a malformed surface", () => {
    const { std: _std, ...noStd } = d.response_surface!;
    void _std;
    const s = surfaceSlice(noStd)!;
    expect(s.lo).toBeNull();
    expect(s.hi).toBeNull();
    expect(s.bandHalf).toBeNull();
    expect(surfaceSlice(undefined)).toBeNull();
    expect(surfaceSlice({ ...d.response_surface, z: [[1]] })).toBeNull();
    expect(surfaceSlice({ ...d.response_surface, std: [[1, 2]] })!.lo).toBeNull();
  });
});

describe("calibrationLine", () => {
  it("states the nearest-to-90% level in plain words and whether the bands were wide or narrow", () => {
    expect(calibrationLine(d.reliability!.calibration)).toBe(
      "Of held-out runs, 97% fell inside the model's 90% band, against the 90% it aims for. The bands look wider than the held-out errors need.",
    );
  });

  it("says why when the engine could not check, and when it sent nothing", () => {
    expect(calibrationLine({ available: false, reason: "too few held-out points", n: 3, ece: null, z_std: null, levels: [] })).toBe("too few held-out points");
    expect(calibrationLine(undefined)).toBe("The engine did not report whether its uncertainty bands held on held-out runs.");
  });
});
