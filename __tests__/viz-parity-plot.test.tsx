// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ParityPlot } from "@/components/viz/charts/parity-plot";
import { bandText, describeParity, insideText, parityTable, toParity, type ParityInput } from "@/lib/viz-data/parity-plot";
import { DENSE_PARITY_POINTS, MIN_PARITY_POINTS } from "@/lib/viz-thresholds";
import latest from "./fixtures/plan-latest.json";

afterEach(cleanup);

const src = { label: "Analysis of good.csv", field: "oof", basis: "derived" as const, engineVersion: "0.1.0" };

// Captured from the live engine (E2E campaign): the first column has the
// sheet's exact zeros, the second the model's negative outputs.
const live: ParityInput = {
  oof: [
    [0.0, 0.0281],
    [0.12, 0.1445],
    [0.0, -0.1425],
    [0.942, 0.4468],
    [1.61, 1.4521],
    [0.5, 0.71],
  ],
  conformal_q: 0.2264,
  conformal_coverage: 0.9,
  cv_spearman: 0.706,
  cv_ci95: [0.585, 0.794],
};

describe("toParity", () => {
  it("reads oof pairs as [measured, predicted] (engine: zip(oof_a, oof_p))", () => {
    const p = toParity(live);
    expect(p.points[2]).toMatchObject({ index: 2, measured: 0, predicted: -0.1425 });
    expect(p.points[3]).toMatchObject({ measured: 0.942, predicted: 0.4468 });
    // The measured column holds the sheet's maximum (the analysis `best`), never a model output.
    expect(Math.max(...p.points.map((x) => x.measured))).toBe(1.61);
  });

  it("counts pairs inside y = x ± q exactly", () => {
    const p = toParity(live);
    // |resid|: 0.0281, 0.0245, 0.1425, 0.4952, 0.1579, 0.21 -> one outside 0.2264
    expect(p.inside).toEqual({ count: 5, total: 6 });
    expect(p.points[3].inside).toBe(false);
    expect(insideText(p)).toBe("5 of 6 held-out runs inside the band (83%, target 90%)");
    expect(bandText(p, "g/L")).toBe("90% held-out band (y = x ± 0.226\u00A0g/L)");
  });

  it("uses identical, padded x and y domains", () => {
    const p = toParity(live);
    const lo = -0.1425;
    const hi = 1.61;
    const pad = (hi - lo) * 0.05;
    expect(p.domain[0]).toBeCloseTo(lo - pad, 10);
    expect(p.domain[1]).toBeCloseTo(hi + pad, 10);
  });

  it("draws no band and no hit count without conformal_q, and never invents coverage", () => {
    const p = toParity({ ...live, conformal_q: null, conformal_coverage: undefined });
    expect(p.band).toBeNull();
    expect(p.inside).toBeNull();
    expect(insideText(p)).toBeNull();
    expect(bandText(p)).toBe("No held-out band reported");
    expect(p.points.every((x) => x.inside === null)).toBe(true);
    const noCov = toParity({ ...live, conformal_coverage: undefined });
    expect(bandText(noCov)).toBe("held-out band (y = x ± 0.226)");
    expect(insideText(noCov)).toBe("5 of 6 held-out runs inside the band (83%)");
  });

  it("is insufficient below the presentation threshold and not scored with no oof and no rho", () => {
    const few = toParity({ ...live, oof: live.oof.slice(0, MIN_PARITY_POINTS - 1) });
    expect(few.state).toEqual({ kind: "insufficient", text: `Needs at least ${MIN_PARITY_POINTS} held-out predictions; the engine produced ${MIN_PARITY_POINTS - 1}.` });
    const none = toParity({ ...live, oof: [], cv_spearman: null, cv_ci95: null });
    expect(none.state.kind).toBe("not-scored");
    expect(none.state.kind === "not-scored" && none.state.reason).toMatch(/not enough held-out runs/);
  });

  it("notes a flat prediction range and goes dense above the threshold", () => {
    const flat = toParity({ ...live, oof: [[0, 2], [5, 2.1], [10, 2.2], [3, 2.05], [7, 2.15]] });
    expect(flat.flat?.ratio).toBeCloseTo(0.02, 10);
    expect(describeParity(flat, "titer")).toMatch(/Predictions cluster near the mean/);
    expect(toParity(live).flat).toBeNull();
    const many = Array.from({ length: DENSE_PARITY_POINTS + 1 }, (_, i) => [i, i] as [number, number]);
    expect(toParity({ ...live, oof: many }).dense).toBe(true);
  });

  it("tables measured first, then predicted at the band's precision", () => {
    const t = parityTable(toParity(live), "g/L");
    expect(t.columns).toEqual(["Held-out run", "Measured (g/L)", "Predicted (g/L)", "Error (g/L)", "Inside 90% band"]);
    expect(t.rows[2]).toEqual(["oof[2]", "0.000", "\u22120.14", "\u22120.14", "inside"]);
    expect(t.rows[3][4]).toBe("outside");
  });

  it("describes the plot with the engine's rho and band", () => {
    expect(describeParity(toParity(live), "titer", "g/L")).toBe(
      "Held-out predicted versus measured titer for 6 runs the model did not see when it predicted them. Rank agreement ρ 0.71 [0.59, 0.79] 95% CI. 90% held-out band (y = x ± 0.226\u00A0g/L). 5 of 6 held-out runs inside the band (83%, target 90%).",
    );
  });

  it("reads the plan fixture's six pairs", () => {
    const p = toParity(latest as unknown as ParityInput);
    expect(p.points).toHaveLength(6);
    expect(p.points[0]).toMatchObject({ measured: 42.72, predicted: 41.2358 });
  });
});

describe("ParityPlot", () => {
  it("renders filled measured marks, an outside glyph and a keyboard tooltip with measured first", () => {
    render(<ParityPlot data={toParity(live)} target="titer" unit="g/L" source={src} width={480} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toMatch(/^Held-out predicted versus measured titer/);
    expect(svg.querySelectorAll('circle[fill="var(--chart-measured)"]').length).toBe(5);
    expect(svg.querySelector('polygon[fill="var(--chart-band)"]')).toBeTruthy();
    const marks = screen.getAllByRole("button", { name: /^Held-out run/ });
    expect(marks).toHaveLength(6);
    fireEvent.focus(marks.find((m) => /outside the band/.test(m.getAttribute("aria-label") ?? ""))!);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toMatch(/Measured0\.942.*Predicted \(held-out\)/);
    expect(tip.textContent).toMatch(/outside the 90% held-out band/);
    expect(screen.getAllByText(/5 of 6 held-out runs inside the band/).length).toBeGreaterThan(0);
  });

  it("shows the engine's reason instead of a chart when not scored", () => {
    render(<ParityPlot data={toParity({ ...live, oof: [], cv_spearman: null, cv_ci95: null })} target="titer" source={src} width={480} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/not enough held-out runs/)).toBeTruthy();
  });
});
