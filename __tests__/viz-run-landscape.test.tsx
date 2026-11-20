// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunLandscape } from "@/components/viz/charts/run-landscape";
import { dataAspect, decimalsPresent, describeLandscape, equalAspectDomains, landscapeTable, seqStep, stepEdges, targetDecimals, toLandscapeProps } from "@/lib/viz-data/run-landscape";

afterEach(cleanup);

const embedding = {
  method: "pca",
  encoding: "standardized_continuous_one_hot_categorical",
  n_features: 12,
  points: [
    [1.4036, 0.4985, 0.0],
    [-2.0491, -0.7314, 0.404],
    [-1.5755, 0.0551, 2.5],
    [0.2, 1.1, 1.25],
  ],
};

describe("toLandscapeProps", () => {
  it("keeps the engine's coordinates and measured targets in engine order, with the observed min and max", () => {
    const p = toLandscapeProps(embedding, "titer", "g/L")!;
    expect(p.points[1]).toEqual({ index: 1, pc1: -2.0491, pc2: -0.7314, target: 0.404 });
    expect(p.min).toBe(0);
    expect(p.max).toBe(2.5);
    expect(p.nFeatures).toBe(12);
    expect(p.skipped).toBe(0);
  });
  it("counts points with a non-finite value instead of plotting them", () => {
    const p = toLandscapeProps({ method: "pca", points: [[1, 2, 3], [1, null, 3], "bad"] }, "y", null)!;
    expect(p.points).toHaveLength(1);
    expect(p.skipped).toBe(2);
  });
  it("is null when the engine sent no embedding or no points", () => {
    expect(toLandscapeProps(undefined, "y", null)).toBeNull();
    expect(toLandscapeProps({ method: "pca", points: [] }, "y", null)).toBeNull();
  });
});

describe("seqStep and equal-aspect domains", () => {
  it("bins the measured target into five equal-width steps over the observed range", () => {
    expect(seqStep(0, 0, 10)).toBe(1);
    expect(seqStep(1.99, 0, 10)).toBe(1);
    expect(seqStep(2, 0, 10)).toBe(2);
    expect(seqStep(9.99, 0, 10)).toBe(5);
    expect(seqStep(10, 0, 10)).toBe(5);
    expect(seqStep(4, 4, 4)).toBe(3);
    expect(stepEdges(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it("uses the same units per pixel on both axes and contains every point", () => {
    const pts = [
      { pc1: -4, pc2: -1 },
      { pc1: 4, pc2: 1 },
    ];
    const d = equalAspectDomains(pts, 400, 200);
    expect((d.x[1] - d.x[0]) / 400).toBeCloseTo((d.y[1] - d.y[0]) / 200);
    expect(d.x[0]).toBeLessThan(-4);
    expect(d.x[1]).toBeGreaterThan(4);
    expect(d.y[0]).toBeLessThan(-1);
  });
});

describe("target precision", () => {
  it("never prints more decimals than the engine sent", () => {
    expect(decimalsPresent(0.404)).toBe(3);
    expect(decimalsPresent(2)).toBe(0);
    expect(decimalsPresent(0.0012)).toBe(4);
    // 3 sf of 0.0012 would need 5 decimals; the engine sent 4, so the column stops at 4.
    const p = toLandscapeProps({ method: "pca", points: [[0, 0, 0.0012], [1, 1, 1.61]] }, "y", null)!;
    expect(targetDecimals(p)).toBe(4);
    expect(landscapeTable(p).rows.map((r) => r[3])).toEqual(["0.0012", "1.6100"]);
  });
  it("sizes the plot to the projection's aspect", () => {
    expect(dataAspect({ points: [{ index: 0, pc1: 0, pc2: 0, target: 1 }, { index: 1, pc1: 4, pc2: 2, target: 1 }] })).toBe(2);
    expect(dataAspect({ points: [] })).toBe(1);
  });
});

describe("describeLandscape and the Data table", () => {
  const p = toLandscapeProps(embedding, "titer", "g/L")!;
  it("states the count, the method, that it is unitless, and the measured range at a shared precision", () => {
    expect(targetDecimals(p)).toBe(3);
    expect(describeLandscape(p)).toBe("4 measured runs placed by recipe similarity (PCA, unitless), shaded by titer. Measured titer runs from 0.000 to 2.500 g/L.");
  });
  it("lists each run with PC1/PC2 at 2 dp (U+2212 minus) and the target column aligned", () => {
    const t = landscapeTable(p);
    expect(t.columns).toEqual(["Run (fit order)", "PC1", "PC2", "titer (g/L), measured"]);
    expect(t.rows[1]).toEqual(["2", "\u22122.05", "\u22120.73", "0.404"]);
    expect(t.rows[0][3]).toBe("0.000");
  });
});

describe("RunLandscape", () => {
  it("draws every run as a filled, ink-outlined dot on the seq ramp, with labelled unitless axes", () => {
    const p = toLandscapeProps(embedding, "titer", "g/L")!;
    render(<RunLandscape data={p} source={{ label: "Analysis of runs.csv", field: "embedding", basis: "measured", engineVersion: "0.1.0" }} width={640} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toBe(describeLandscape(p));
    const dots = [...svg.querySelectorAll("circle")];
    expect(dots).toHaveLength(4);
    for (const c of dots) {
      expect(c.getAttribute("fill")).toMatch(/^var\(--chart-seq-[1-5]\)$/);
      expect(c.getAttribute("stroke")).toBe("var(--chart-measured)");
    }
    expect(svg.textContent).toMatch(/PC1 \(similarity, unitless\)/);
    expect(svg.textContent).toMatch(/PC2 \(similarity, unitless\)/);
    expect(screen.getByText("From: Analysis of runs.csv · n = 4 runs · PCA of the standardized numeric and one-hot categorical inputs (12 dimensions) · engine 0.1.0")).toBeTruthy();
  });

  it("shows the run's measured value, PC1 and PC2 in the tooltip, with the source field", () => {
    const p = toLandscapeProps(embedding, "titer", "g/L")!;
    render(<RunLandscape data={p} source={{ label: "Analysis of runs.csv", field: "embedding", basis: "measured" }} width={640} />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^Run 3: measured 2\.500 g\/L/ }));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toMatch(/Run 3 \(fit order\)/);
    expect(tip.textContent).toMatch(/2\.500/);
    expect(tip.textContent).toMatch(/\u22121\.58/);
    expect(tip.textContent).toMatch(/embedding\.points\[2\]/);
  });
});
