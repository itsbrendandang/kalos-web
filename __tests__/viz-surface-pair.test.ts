import { describe, expect, it } from "vitest";
import mock from "./fixtures/plan-response-surface.json";
import { parseSurface } from "@/components/campaign/plan/surface-model";
import {
  NO_SD_NOTE,
  bandLabels,
  bandStep,
  bandThresholds,
  contourBands,
  describeSurfacePair,
  gridToValue,
  heldText,
  isFlat,
  nearestIndex,
  surfaceTable,
  toSurfacePair,
} from "@/lib/viz-data/surface-pair";

const raw = { ...mock.response_surface, fixed_recipe: { ...mock.response_surface.fixed_recipe, "Temperature (C)": 41, pH: 6.9 } };
const model = parseSurface(raw)!;

describe("toSurfacePair", () => {
  it("keeps proposals inside the swept range with their batch ids and counts the rest", () => {
    const d = toSurfacePair(model, mock.proposals);
    expect(d.proposals.map((p) => p.key)).toEqual(["P1", "P2"]);
    expect(d.outside).toEqual(["P3"]);
  });
  it("places the incumbent at the held recipe's own axis settings", () => {
    expect(toSurfacePair(model).incumbent).toEqual({ x: 41, y: 6.9 });
    expect(toSurfacePair(parseSurface(mock.response_surface)!).incumbent).toBeNull();
  });
  it("has no sigma grid when the engine sent none (never synthesized)", () => {
    expect(toSurfacePair(model).sd).toBeNull();
  });
});

describe("bands", () => {
  it("uses round d3 ticks strictly inside the grid range, at most five bands", () => {
    const t = bandThresholds(0.0055, 1.577);
    expect(t.length + 1).toBeLessThanOrEqual(5);
    expect(t.every((v) => v > 0.0055 && v < 1.577)).toBe(true);
    expect(t).toEqual([0.5, 1, 1.5]);
  });
  it("is a single band for a flat grid", () => {
    expect(isFlat(4.2, 4.2004)).toBe(true);
    expect(bandThresholds(4.2, 4.2004)).toEqual([]);
    expect(isFlat(3.6, 5.2)).toBe(false);
  });
  it("spreads band colours across the whole ramp", () => {
    expect([0, 1, 2, 3].map((k) => bandStep(k, 4))).toEqual([1, 2, 4, 5]);
    expect([0, 1, 2, 3, 4].map((k) => bandStep(k, 5))).toEqual([1, 2, 3, 4, 5]);
    expect(bandStep(0, 1)).toBe(3);
  });
  it("labels each band by its bounds", () => {
    expect(bandLabels([0.5, 1], String, 0, 2)).toEqual(["< 0.5", "0.5 – 1", "≥ 1"]);
  });
  it("contours the engine grid with d3-contour, one region per threshold", () => {
    const b = contourBands(model.z, [40, 43]);
    expect(b.map((x) => x.threshold)).toEqual([40, 43]);
    expect(b[0].polygons.length).toBeGreaterThan(0);
  });
  it("maps grid coordinates to axis values (grid point k at k + 0.5)", () => {
    expect(gridToValue([30, 35, 40], 0.5)).toBe(30);
    expect(gridToValue([30, 35, 40], 2.5)).toBe(40);
    expect(gridToValue([30, 35, 40], 0)).toBe(27.5);
    expect(nearestIndex([30, 35, 40], 36)).toBe(1);
  });
});

describe("text", () => {
  it("states what the other inputs are held at, from fixed_recipe", () => {
    expect(heldText(toSurfacePair(model))).toBe("Other inputs held at the incumbent recipe (best single run): Feed rate (mL/h) 1.25, Strain K12.");
  });
  it("describes the pair and says the uncertainty map is not returned", () => {
    const s = describeSurfacePair(toSurfacePair(model, mock.proposals), "titer", "g/L");
    expect(s).toMatch(/^Model-predicted titer across Temperature \(C\) 30\.0 to 50\.0 and pH 6\.500 to 7\.250\./);
    expect(s).toContain("the highest is at Temperature (C) 50.0, pH 7.000");
    expect(s).toContain(NO_SD_NOTE);
    expect(s).toContain("6 measured runs projected: other inputs differ; 2 proposed experiments plotted (P1, P2); P3 outside the plotted range, not drawn.");
  });
  it("describes sigma when the engine sent it", () => {
    const sd = model.z.map((r) => r.map((_, j) => 0.1 + j * 0.05));
    const s = describeSurfacePair(toSurfacePair({ ...model, std: sd }), "titer");
    expect(s).toContain("not an interval) runs from 0.10 to 0.30.");
  });
  it("tabulates the grid in long form, sigma column only when sent", () => {
    const t = surfaceTable(toSurfacePair(model));
    expect(t.columns).toEqual(["Temperature (C)", "pH", "Predicted mean"]);
    expect(t.rows).toHaveLength(20);
    const sd = model.z.map((r) => r.map(() => 0.31));
    const t2 = surfaceTable(toSurfacePair({ ...model, std: sd }), "g/L");
    expect(t2.columns).toEqual(["Temperature (C)", "pH", "Predicted mean (g/L)", "Model σ (g/L)"]);
    // Precision of the mean follows the engine's sigma (PDG): sigma 0.31 -> 2 decimals.
    expect(t2.rows[0][2]).toBe("36.40");
    expect(t2.rows[0][3]).toBe("0.31");
  });
});
