// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import analysis from "./fixtures/harmonize-analysis.json";
import { CorrelationHeatmap } from "@/components/viz/charts/correlation-heatmap";
import { sourceFromAnalysis } from "@/lib/source";
import { cellOpacity, corrText, correlationTable, describeCorrelation, targetPairs, toCorrelationProps } from "@/lib/viz-data/correlation-heatmap";

afterEach(cleanup);

const grid = {
  labels: ["pH", "temp", "target_mean"],
  matrix: [
    [1, -0.4249, 0.618],
    [-0.4249, 1, null],
    [0.618, null, 1],
  ],
};

describe("toCorrelationProps", () => {
  it("renames the engine's target_mean to the target and keeps null cells null (never 0)", () => {
    const p = toCorrelationProps(grid, "titer_g_L", 48)!;
    expect(p.labels).toEqual(["pH", "temp", "titer_g_L"]);
    expect(p.targetIndex).toBe(2);
    expect(p.matrix[1][2]).toBeNull();
    expect(p.matrix[2][1]).toBeNull();
    expect(p.n).toBe(48);
  });
  it("is null when the engine sent no correlation block or an empty one", () => {
    expect(toCorrelationProps(undefined, "y")).toBeNull();
    expect(toCorrelationProps({ labels: [], matrix: [] }, "y")).toBeNull();
  });
  it("has no target index when the engine sent no target row, and n is null when not reported", () => {
    const p = toCorrelationProps({ labels: ["a", "b"], matrix: [[1, 0.2], [0.2, 1]] }, "y")!;
    expect(p.targetIndex).toBeNull();
    expect(p.n).toBeNull();
  });
});

describe("cell text and fill", () => {
  it("prints rho at 2 dp with a U+2212 minus, and n/a for a missing pair", () => {
    expect(corrText(-0.4249)).toBe("\u22120.42");
    expect(corrText(0.618)).toBe("0.62");
    expect(corrText(-0.004)).toBe("0.00");
    expect(corrText(null)).toBe("n/a");
  });
  it("scales fill strength with |rho| and caps it so the printed number stays legible", () => {
    expect(cellOpacity(null)).toBe(0);
    expect(cellOpacity(0)).toBe(0);
    expect(cellOpacity(-0.5)).toBeCloseTo(0.3);
    expect(cellOpacity(1)).toBeCloseTo(0.6);
  });
});

describe("describeCorrelation and the Data table", () => {
  const p = toCorrelationProps(grid, "titer_g_L", 1204)!;
  it("orders the target's pairs by |rho| and skips the diagonal and missing pairs", () => {
    expect(targetPairs(p)).toEqual([{ label: "pH", rho: 0.618 }]);
  });
  it("names the method, the run count, the strongest target pairs and the n/a pairs", () => {
    expect(describeCorrelation(p)).toBe(
      "Spearman rank correlation among 2 inputs and titer_g_L, over 1,204 runs. Strongest with the target: pH 0.62. 1 pair has no value from the engine (n/a).",
    );
  });
  it("lists every cell as printed", () => {
    const t = correlationTable(p);
    expect(t.columns).toEqual(["", "pH", "temp", "titer_g_L"]);
    expect(t.rows[1]).toEqual(["temp", "\u22120.42", "1.00", "n/a"]);
  });
});

describe("CorrelationHeatmap", () => {
  it("renders one SVG cell per pair with the rho printed, the description as its label and a source footer", () => {
    const a = analysis as unknown as Parameters<typeof sourceFromAnalysis>[0] & { correlation: typeof grid; n: number; target: string };
    const p = toCorrelationProps(a.correlation, a.target, a.n)!;
    render(<CorrelationHeatmap data={p} source={sourceFromAnalysis(a, "correlation", "derived")} width={800} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toBe(describeCorrelation(p));
    const k = p.labels.length;
    expect(svg.querySelectorAll("g[role=button]").length).toBe(k * k);
    // Diagonal reads 1.00; at least one negative prints with U+2212.
    expect(within(svg as unknown as HTMLElement).getAllByText("1.00").length).toBe(k);
    expect(svg.textContent).toMatch(/\u2212\d\.\d\d/);
    expect(svg.textContent).not.toMatch(/-\d\.\d\d/);
    expect(screen.getByText(/^From: Analysis of .* · n = \d+ runs · Spearman rank correlation/)).toBeTruthy();
    expect(screen.getByText("Data")).toBeTruthy();
  });

  it("shows a tooltip with the pair, rho and its source field on hover", () => {
    render(<CorrelationHeatmap data={toCorrelationProps(grid, "titer_g_L", 12)!} source={{ label: "Analysis of runs.csv", field: "correlation", basis: "derived" }} width={600} />);
    const cell = screen.getByRole("button", { name: /^pH and temp/ });
    fireEvent.mouseEnter(cell);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toMatch(/pH and temp/);
    expect(tip.textContent).toMatch(/\u22120\.42/);
    expect(tip.textContent).toMatch(/correlation\.matrix\[0\]\[1\]/);
    // A pair the engine did not compute says so.
    fireEvent.mouseLeave(cell);
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^temp and titer_g_L: n\/a/ }));
    expect(screen.getByRole("tooltip").textContent).toMatch(/sent no value for this pair/);
  });
});
