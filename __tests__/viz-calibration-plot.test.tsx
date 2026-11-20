// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalibrationPlot } from "@/components/viz/charts/calibration-plot";
import { Z_STD_TOLERANCE, type Calibration } from "@/lib/api";
import { calibrationHeadlineOf, calibrationTable, describeCalibration, levelText, toCalibration, zStdReading } from "@/lib/viz-data/calibration-plot";

afterEach(cleanup);

const src = { label: "Analysis of good.csv", field: "reliability.calibration", basis: "derived" as const, engineVersion: "0.1.0" };

// Live E2E analysis.
const cal: Calibration = {
  available: true,
  reason: null,
  n: 165,
  ece: 0.0951,
  z_std: 1.3494,
  levels: [
    { nominal: 0.8, empirical: 0.8242 },
    { nominal: 0.5, empirical: 0.7394 },
    { nominal: 0.9, empirical: 0.8485 },
    { nominal: 0.95, empirical: 0.8848 },
  ],
};

describe("toCalibration", () => {
  it("keeps the engine's levels (sorted by nominal), recovers exact inside counts and reads z_std with the shared tolerance", () => {
    const c = toCalibration({ reliability: { calibration: cal } });
    if (c.state !== "ready") throw new Error(c.state);
    expect(c.levels.map((l) => [l.nominal, l.empirical, l.inside])).toEqual([
      [0.5, 0.7394, 122],
      [0.8, 0.8242, 136],
      [0.9, 0.8485, 140],
      [0.95, 0.8848, 146],
    ]);
    expect(c.headline).toBe("Bands read too narrow");
    expect(c.reading).toBe("z-spread 1.35: bands too narrow (overconfident)");
    expect(c.coarse).toBe(false);
    expect(c.domain).toEqual([0.4, 1]);
    expect(levelText(c.levels[0])).toBe("74% inside (122 of 165)");
  });

  it("calls a z_std within the tolerance close to calibrated (live kaggle sheet: 1.03)", () => {
    expect(zStdReading(1.0305)).toBe("z-spread 1.03: close to calibrated");
    expect(zStdReading(1 - Z_STD_TOLERANCE)).toBe("z-spread 0.90: close to calibrated");
    expect(zStdReading(0.7)).toBe("z-spread 0.70: bands too wide (conservative)");
    expect(zStdReading(null)).toBeNull();
    expect(calibrationHeadlineOf({ ...cal, z_std: 1.0305 })).toBe("Close to calibrated");
  });

  it("omits a count that is not an exact integer of n", () => {
    const c = toCalibration({ reliability: { calibration: { ...cal, n: 7, levels: [{ nominal: 0.5, empirical: 0.33 }] } } });
    if (c.state !== "table") throw new Error(c.state);
    expect(c.levels[0].inside).toBeNull();
    expect(levelText(c.levels[0])).toBe("33% inside");
  });

  it("has distinct absent, not-scored, table and coarse states", () => {
    expect(toCalibration({}).state).toBe("absent");
    expect(toCalibration({ reliability: { calibration: { ...cal, available: false, reason: "only 3 held-out points", ece: null, z_std: null, levels: [] } } })).toEqual({
      state: "not-scored",
      reason: "only 3 held-out points",
    });
    expect(toCalibration({ reliability: { calibration: { ...cal, levels: cal.levels.slice(0, 2) } } }).state).toBe("table");
    const coarse = toCalibration({ reliability: { calibration: { ...cal, n: 12 } } });
    expect(coarse.state === "ready" && coarse.coarse).toBe(true);
  });

  it("adds the alternative-scale series only when the engine scored it", () => {
    const alt = { scale: "log1p" as const, offset: 1, cv_spearman: 0.7, cv_ci95: null, icc: null, interpretation: null, reason: null, calibration: { ...cal, n: 165, levels: [{ nominal: 0.5, empirical: 0.5 }] } };
    const c = toCalibration({ reliability: { calibration: cal }, alternative_scale: alt });
    expect(c.state === "ready" && c.alt?.label).toBe("log1p scale");
    const none = toCalibration({ reliability: { calibration: cal }, alternative_scale: { ...alt, calibration: null } });
    expect(none.state === "ready" && none.alt).toBeNull();
  });

  it("describes and tables the levels", () => {
    const c = toCalibration({ reliability: { calibration: cal } });
    expect(describeCalibration(c)).toBe(
      "Interval calibration on 165 held-out runs: Bands read too narrow. 50% nominal band: 74% inside (122 of 165). 80% nominal band: 82% inside (136 of 165). 90% nominal band: 85% inside (140 of 165). 95% nominal band: 88% inside (146 of 165). ECE 0.10. z-spread 1.35: bands too narrow (overconfident).",
    );
    expect(calibrationTable(c)?.rows[0]).toEqual(["Model", "50%", "74%", "122 of 165"]);
  });
});

describe("CalibrationPlot", () => {
  it("draws measured coverage as filled ink joined by a solid line, with a dotted diagonal and tooltips", () => {
    render(<CalibrationPlot data={toCalibration({ reliability: { calibration: cal } })} source={src} width={480} />);
    const svg = screen.getByRole("img");
    expect(svg.querySelectorAll('circle[fill="var(--chart-measured)"]').length).toBe(4);
    expect(svg.querySelector('line[stroke-dasharray="1 3"]')).toBeTruthy();
    expect(svg.querySelector('path[stroke="var(--chart-measured)"]')?.getAttribute("stroke-dasharray")).toBeNull();
    const marks = screen.getAllByRole("button", { name: /nominal band/ });
    fireEvent.focus(marks[0]);
    expect(screen.getByRole("tooltip").textContent).toMatch(/74% inside \(122 of 165\)/);
    expect(screen.getByText(/Bands read too narrow · ECE 0\.10 · z-spread 1\.35/)).toBeTruthy();
  });

  it("renders nothing when absent and the engine's reason when not scored", () => {
    const { container } = render(<CalibrationPlot data={{ state: "absent" }} source={src} width={480} />);
    expect(container.innerHTML).toBe("");
    render(<CalibrationPlot data={{ state: "not-scored", reason: "only 3 held-out points" }} source={src} width={480} />);
    expect(screen.getByText("only 3 held-out points")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
