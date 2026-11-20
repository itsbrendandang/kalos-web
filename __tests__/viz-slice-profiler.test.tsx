// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SliceProfiler } from "@/components/viz/charts/slice-profiler";
import type { AnalyzeResult, ModelSlice } from "@/lib/api";
import { describeSliceProfiler, fmtBand, sliceTable, toSliceProfiler, type SliceProfilerData } from "@/lib/viz-data/slice-profiler";
import fixture from "./fixtures/predict-v2-analysis.json";

/*
 * C4b SliceProfiler (engine R2) against a real engine v2 analysis: 10 slices
 * of 41 points (latent GP mean, 90% model-based band, other inputs held at the
 * incumbent) and one categorical input skipped.
 */

const d = fixture as unknown as AnalyzeResult;
const proposals = d.proposals.map((p, i) => ({ key: `P${i + 1}`, recipe: p.recipe as Record<string, number | string> }));
const src = { label: "Analysis of synthetic.csv", field: "slices", basis: "predicted" as const, engineVersion: "0.9" };

afterEach(cleanup);

describe("toSliceProfiler", () => {
  it("keeps every engine slice, the shared y domain and the skipped inputs with plain reasons", () => {
    const m = toSliceProfiler(d, proposals);
    expect(m.state).toBe("ready");
    if (m.state !== "ready") return;
    expect(m.slices).toHaveLength(10);
    expect(m.slices[0].feature).toBe("temperature_C");
    expect(m.slices[0].x).toHaveLength(41);
    expect(m.coverage).toBe(0.9);
    expect(m.skipped).toEqual([{ feature: "medium_base", reason: "categorical", text: "categorical input, so there is no continuous sweep" }]);
    // One y domain covers every band (min lo, max hi, padded 5%).
    const all = m.slices.flatMap((s) => [...s.lo, ...s.hi]);
    expect(m.yDomain[0]).toBeLessThan(Math.min(...all));
    expect(m.yDomain[1]).toBeGreaterThan(Math.max(...all));
    // The reference is the held recipe's own value; proposals are placed at their own settings.
    expect(m.slices[0].reference).toBe(35.596);
    expect(m.slices[0].proposals.map((p) => p.key)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(m.slices[0].proposals[0].x).toBe(36.194);
  });

  it("reads slices: null as Not scored with the engine's reason, and absent as nothing", () => {
    expect(toSliceProfiler({ ...d, slices: null, visualization_reasons: { slices: "no continuous features to slice" } })).toEqual({
      state: "not-scored",
      reason: "no continuous features to slice",
      skipped: [{ feature: "medium_base", reason: "categorical", text: "categorical input, so there is no continuous sweep" }],
    });
    expect(toSliceProfiler({ ...d, slices: undefined })).toEqual({ state: "absent" });
  });

  it("lists a malformed slice instead of repairing it", () => {
    const bad = { ...d.slices![0], feature: "pH", mean: d.slices![0].mean.slice(0, 5) } as ModelSlice;
    const m = toSliceProfiler({ ...d, slices: [d.slices![0], bad] });
    expect(m.state === "ready" && m.malformed).toEqual(["pH"]);
  });

  it("describes the model-only slices with the model-based band and fills the Data table", () => {
    const m = toSliceProfiler(d, proposals);
    const text = describeSliceProfiler(m, "titer_g_L", "g/L");
    expect(text).toContain("90% model-based band, not held-out calibrated");
    expect(text).toContain("Slices are the model only: no measured runs are drawn on them.");
    expect(text).toContain("Not sliced: medium_base (categorical input, so there is no continuous sweep).");
    const t = sliceTable(m, "g/L");
    expect(t.columns).toEqual(["Input", "Setting", "Predicted mean (g/L)", "Model band (g/L)", "Model σ (g/L)"]);
    expect(t.rows).toHaveLength(410);
    if (m.state === "ready") expect(fmtBand(m.slices[0], 0)).toMatch(/^\[.+\] 90%$/);
  });
});

describe("<SliceProfiler>", () => {
  const draw = (data: SliceProfilerData) => render(<SliceProfiler data={data} target="titer_g_L" unit="g/L" source={src} width={960} />);

  it("draws one panel per slice with the dashed model mean, the labelled band and proposal ticks", () => {
    const { container } = draw(toSliceProfiler(d, proposals));
    expect(screen.getAllByRole("application")).toHaveLength(10);
    expect(screen.getByText("90% model-based band, not held-out calibrated")).toBeTruthy();
    expect(screen.getByText("Model mean (predicted)")).toBeTruthy();
    expect(container.querySelectorAll('path[stroke-dasharray="4 3"]').length).toBe(10);
    // No measured marks anywhere on the slices.
    expect(container.querySelectorAll('circle[fill="var(--chart-measured)"]').length).toBe(0);
    expect(screen.getByText(/not sliced, categorical input/)).toBeTruthy();
  });

  it("reads the engine sample under the keyboard cursor, with no interpolation", () => {
    draw(toSliceProfiler(d, proposals));
    const first = screen.getAllByRole("application")[0];
    fireEvent.focus(first);
    fireEvent.keyDown(first, { key: "Home" });
    expect(screen.getByText(/^temperature_C 30\.04: predicted .* model band \[.*\] 90%/)).toBeTruthy();
  });

  it("shows Not scored with the engine's reason when slices is null, and nothing when absent", () => {
    draw(toSliceProfiler({ ...d, slices: null, visualization_reasons: { slices: "no continuous features to slice" } }));
    expect(screen.getByText("no continuous features to slice")).toBeTruthy();
    cleanup();
    const { container } = draw({ state: "absent" });
    expect(container.textContent).toBe("");
  });
});
