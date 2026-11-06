import { describe, expect, it } from "vitest";
import mock from "./fixtures/plan-response-surface.json";
import { fractionalIndex, parseSurface, peakCell, placeable, rampColor, surfaceSummary, valueT } from "@/components/campaign/plan/surface-model";

const good = mock.response_surface;
const fmt = (n: number) => n.toFixed(2);

/** A 21 x 21 grid, as the engine's viz_utils builds it, to prove nothing assumes that size. */
function grid(n: number) {
  const vals = Array.from({ length: n }, (_, i) => i * 0.5);
  return { x_feature: "A", y_feature: "B", x_vals: vals, y_vals: vals, z: vals.map((y) => vals.map((x) => x + y)), runs: [] };
}

describe("parseSurface", () => {
  it("reads the grid size from the arrays, not from a fixed 21", () => {
    const m = parseSurface(good);
    expect(m).not.toBeNull();
    expect(m!.x.vals).toHaveLength(5);
    expect(m!.y.vals).toHaveLength(4);
    expect(m!.z).toHaveLength(4);
    expect(m!.z[0]).toHaveLength(5);
    expect(parseSurface(grid(21))!.z).toHaveLength(21);
  });

  it("returns null when the field is absent or not an object", () => {
    for (const raw of [undefined, null, 0, "surface", [], [good]]) expect(parseSurface(raw)).toBeNull();
  });

  it.each([
    ["missing x_feature", { ...good, x_feature: undefined }],
    ["same feature on both axes", { ...good, y_feature: good.x_feature }],
    ["empty axis name", { ...good, y_feature: "" }],
    ["x_vals not numbers", { ...good, x_vals: [30, "35", 40, 45, 50] }],
    ["x_vals not increasing", { ...good, x_vals: [30, 40, 35, 45, 50] }],
    ["a single x value", { ...good, x_vals: [30] }],
    ["z has the wrong number of rows", { ...good, z: good.z.slice(1) }],
    ["a z row has the wrong length", { ...good, z: good.z.map((r, i) => (i === 2 ? r.slice(1) : r)) }],
    ["a non-finite cell", { ...good, z: good.z.map((r, i) => (i === 0 ? [NaN, ...r.slice(1)] : r)) }],
    ["a null cell", { ...good, z: good.z.map((r, i) => (i === 0 ? [null, ...r.slice(1)] : r)) }],
    ["z is not an array", { ...good, z: "grid" }],
  ])("returns null for a malformed surface: %s", (_name, raw) => {
    expect(() => parseSurface(raw)).not.toThrow();
    expect(parseSurface(raw)).toBeNull();
  });

  it("drops measured runs that are not finite triplets and keeps the rest", () => {
    const m = parseSurface({ ...good, runs: [[30, 6.5, 33.1], [NaN, 7, 1], ["40", 7, 2], [40], [45, 7, 47.5]] });
    expect(m!.runs).toEqual([
      [30, 6.5, 33.1],
      [45, 7, 47.5],
    ]);
  });

  it("keeps the engine's fixed inputs and the sweep label", () => {
    const m = parseSurface(good)!;
    expect(m.fixed).toEqual([
      { name: "Feed rate (mL/h)", value: "1.25" },
      { name: "Strain", value: "K12" },
    ]);
    expect(m.sweptAt).toBe("incumbent");
  });

  it("does not depend on std, which the engine does not return on main", () => {
    expect(parseSurface({ ...good, std: undefined })).not.toBeNull();
  });
});

describe("fractionalIndex", () => {
  const vals = [30, 35, 40];
  it("maps endpoints and interior values", () => {
    expect(fractionalIndex(vals, 30)).toBe(0);
    expect(fractionalIndex(vals, 40)).toBe(2);
    expect(fractionalIndex(vals, 37.5)).toBeCloseTo(1.5);
  });
  it("is null outside the axis and for non-finite input", () => {
    expect(fractionalIndex(vals, 29.9)).toBeNull();
    expect(fractionalIndex(vals, 40.1)).toBeNull();
    expect(fractionalIndex(vals, NaN)).toBeNull();
  });
  it("works on a descending axis", () => {
    expect(fractionalIndex([40, 35, 30], 37.5)).toBeCloseTo(0.5);
  });
});

describe("rampColor and valueT", () => {
  it("uses the sequential tokens in order, with the endpoints at the first and last step", () => {
    expect(rampColor(0)).toBe("color-mix(in oklch, var(--chart-seq-1) 100%, var(--chart-seq-2) 0%)");
    expect(rampColor(1)).toBe("color-mix(in oklch, var(--chart-seq-4) 0%, var(--chart-seq-5) 100%)");
  });
  it("never emits a hard-coded colour", () => {
    for (let t = 0; t <= 1; t += 0.05) expect(rampColor(t)).not.toMatch(/#|oklch\(|rgb\(/);
  });
  it("clamps out-of-range input and maps NaN to mid-ramp", () => {
    expect(rampColor(-3)).toBe(rampColor(0));
    expect(rampColor(9)).toBe(rampColor(1));
    expect(rampColor(NaN)).toBe(rampColor(0.5));
  });
  it("places a flat surface mid-ramp and the range ends at 0 and 1", () => {
    expect(valueT({ zMin: 2, zMax: 2 }, 2)).toBe(0.5);
    expect(valueT({ zMin: 2, zMax: 4 }, 2)).toBe(0);
    expect(valueT({ zMin: 2, zMax: 4 }, 4)).toBe(1);
  });
});

describe("peakCell and placeable", () => {
  it("finds the highest cell, first in reading order on a tie", () => {
    expect(peakCell([[1, 5, 5], [2, 3, 4]])).toEqual({ row: 0, col: 1 });
  });
  it("splits proposals into those inside the axes and those outside", () => {
    const m = parseSurface(good)!;
    const { inside, outside } = placeable(m, mock.proposals);
    expect(inside.map((p) => p.id)).toEqual(["P1", "P2"]);
    expect(outside.map((p) => p.id)).toEqual(["P3"]);
  });
});

describe("surfaceSummary", () => {
  it("states the range, the peak, the held inputs, the uncertainty limit and what is drawn", () => {
    const m = parseSurface(good)!;
    const peak = peakCell(m.z);
    const s = surfaceSummary(m, "titer (g/L)", fmt, { runs: 6, proposals: 2, outside: 1 });
    expect(s).toContain("Predicted titer (g/L) across Temperature (C) from 30.00 to 50.00");
    expect(s).toContain(`the highest is at Temperature (C) ${fmt(m.x.vals[peak.col])}, pH ${fmt(m.y.vals[peak.row])}`);
    expect(s).toContain("Feed rate (mL/h) 1.25, Strain K12");
    expect(s).toContain("The model's best guess only: how sure it is is not shown.");
    expect(s).toContain("6 measured runs and 2 proposed recipes are plotted");
    expect(s).toContain("1 proposed recipe lies outside the plotted range and is not drawn");
  });
});
