// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Driver } from "@/lib/api";
import { DriverForest } from "@/components/viz/charts/driver-forest";
import { toDriverForest } from "@/lib/viz-data/driver-forest";

afterEach(cleanup);

const drv = (name: string, rho: number, ci: [number, number], significant: boolean, extra: Partial<Driver> = {}): Driver => ({ name, rho, ci95: ci, significant, ...extra });
const drivers = [
  drv("temperature_C", 0.333, [0.199, 0.465], true, { ci_excludes_zero: true, survives_fdr: true }),
  drv("pH", 0.172, [0.011, 0.345], false, { ci_excludes_zero: true, survives_fdr: false }),
  drv("feed_rate_mLh", 0.112, [-0.049, 0.286], false, { ci_excludes_zero: false, survives_fdr: false }),
];
const selection = { n_tested: 10, n_reported: 3, top_k: 8, fdr_method: "benjamini_hochberg", fdr_q: 0.05, n_bootstrap: 200, ranked_by: "abs_rho", unit: "recipe", n_units: 165, n_rows: 165 };
const source = { label: "Analysis of a.csv", field: "drivers", basis: "derived" as const, engineVersion: "0.1.0" };

describe("DriverForest", () => {
  it("draws significant drivers filled and the rest hollow, with the failed test in words", () => {
    const data = toDriverForest({ drivers, driver_selection: selection });
    const { container } = render(<DriverForest {...data} target="titer" source={source} width={900} />);
    const plot = container.querySelector('svg[role="group"]') as SVGSVGElement;
    expect(plot.querySelectorAll('circle[fill="var(--fg)"]')).toHaveLength(1);
    expect(plot.querySelectorAll('circle[fill="var(--surface)"][stroke="var(--fg-muted)"]')).toHaveLength(2);
    expect(screen.getByText("significant (BH)")).toBeTruthy();
    expect(screen.getByText("fails FDR")).toBeTruthy();
    expect(screen.getByText("CI spans 0")).toBeTruthy();
  });

  it("keeps the full −1..1 axis even for small correlations", () => {
    const data = toDriverForest({ drivers: [drv("x", 0.05, [0.01, 0.09], false)] });
    const { container } = render(<DriverForest {...data} target="titer" source={source} width={900} />);
    const ticks = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(ticks).toContain("\u22121.00");
    expect(ticks).toContain("1.00");
  });

  it("reads the GP shape column as Not scored with the engine's reason", () => {
    const data = toDriverForest({ drivers, gp_shapes: { available: false, reason: "posterior sweep failed: RuntimeError", features: [] } });
    const { container } = render(<DriverForest {...data} target="titer" source={source} width={900} />);
    expect(container.textContent).toContain("Not scored: posterior sweep failed: RuntimeError");
  });

  it("carries the selection note and the source line in its footer, and a Data table", () => {
    const data = toDriverForest({ drivers, driver_selection: selection });
    render(<DriverForest {...data} target="titer" source={source} width={900} />);
    expect(screen.getByText("10 inputs tested, 3 shown, ranked by |ρ| (BH FDR, q = 0.05), per recipe (165 recipes, 165 rows).")).toBeTruthy();
    expect(screen.getByText(/From: Analysis of a.csv · n = 165 recipes/)).toBeTruthy();
    expect(screen.getByText("Data")).toBeTruthy();
  });

  it("says how many were tested when no driver came back (no ghost axis)", () => {
    const data = toDriverForest({ drivers: [], driver_selection: { ...selection, n_reported: 0 } });
    const { container } = render(<DriverForest {...data} target="titer" source={source} width={900} />);
    expect(screen.getByText("No input showed a rank association with the target (10 tested).")).toBeTruthy();
    expect(container.querySelector("svg[role]")).toBeNull();
  });

  it("makes each row a keyboard-reachable mark with its numbers in the label", () => {
    const data = toDriverForest({ drivers });
    const { container } = render(<DriverForest {...data} target="titer" source={source} width={900} />);
    const marks = container.querySelectorAll('rect[role="button"][tabindex="0"]');
    expect(marks).toHaveLength(3);
    expect(marks[0].getAttribute("aria-label")).toContain("temperature_C");
  });
});
