// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ValidationDumbbells } from "@/components/viz/charts/validation-dumbbells";
import type { CampaignRun } from "@/lib/api";
import { toDumbbellData, type DumbbellAnalysis } from "@/lib/viz-data/validation-dumbbells";

const HASH = "9836c009efd80007";
const analysis: DumbbellAnalysis = { conformal_q: 0.2036, conformal_coverage: 0.9, timestamp: 1000, proposal_provenance: { provenance_sha256: HASH } };
const run = (id: string, pred: number, result: number | null, over: Partial<CampaignRun> = {}): CampaignRun => ({
  id, recipe: {}, pred, std: 0.07, mode: "exploit", reason: "", result, awaiting: result == null, round: 0,
  analysis_provenance: { provenance_sha256: HASH, timestamp: 1000, engine_version: "0.1.0" }, ...over,
});
/** A run started since R5: the engine recorded its prediction and band (pred ± 0.2036 at 90%) at start. */
const rec = (id: string, pred: number, result: number | null): CampaignRun =>
  run(id, pred, result, {
    pred_source: "engine",
    prediction_at_start: {
      available: true, basis: "predicted", pred, std: 0.07,
      interval: { lo: pred - 0.2036, hi: pred + 0.2036, half_width: 0.2036, coverage: 0.9, method: "conformal_global" }, interval_unavailable_reason: null,
    },
    residual: result == null ? null : result - pred,
    inside_band: result == null ? null : Math.abs(result - pred) <= 0.2036,
  });
const runs = [rec("60ad5599d4", 1.75, 1.64), rec("ba5d212105", 1.736, null), rec("f7a48e5666", 1.715, 1.5)];
const source = { label: "Analysis of synthetic_bioprocess.csv", field: "conformal_q", basis: "predicted" as const, engineVersion: "0.1.0" };

afterEach(cleanup);

const renderChart = (rs: CampaignRun[], a: DumbbellAnalysis | null = analysis) =>
  render(<ValidationDumbbells data={toDumbbellData(rs, a)} target="titer_g_L" unit={null} source={source} width={800} />);

describe("ValidationDumbbells", () => {
  it("draws the measured dot last and larger than the hollow predicted dot on each measured row", () => {
    const { container } = renderChart(runs);
    const row = screen.getByRole("button", { name: /^Run 60ad559:/ }).parentElement!;
    const circles = [...row.querySelectorAll("circle")];
    const measured = circles.filter((c) => c.getAttribute("fill") === "var(--chart-measured)");
    const predicted = circles.filter((c) => c.getAttribute("stroke") === "var(--chart-predicted)");
    expect(measured).toHaveLength(1);
    expect(predicted).toHaveLength(1);
    expect(measured[0].getAttribute("r")).toBe("5");
    expect(predicted[0].getAttribute("r")).toBe("4");
    expect(circles.indexOf(measured[0])).toBeGreaterThan(circles.indexOf(predicted[0]));
    // No hex colors, no 95%.
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}\b|95%/i);
  });

  it("labels residuals measured − predicted, chips inside/outside, and awaiting runs with a pending glyph", () => {
    const { container } = renderChart(runs);
    const svg = container.querySelector("svg[role=group]")!;
    expect(svg.textContent).toContain("measured − predicted");
    expect(svg.textContent).toContain("\u22120.11");
    expect(svg.textContent).toContain("\u22120.22");
    expect(svg.textContent).toMatch(/inside/);
    expect(svg.textContent).toMatch(/outside/);
    expect(svg.textContent).toContain("Awaiting result");
    expect(svg.querySelectorAll('circle[stroke-dasharray="2 2"]')).toHaveLength(1);
    expect(svg.textContent).toContain("Round 1");
  });

  it("states the hit rate with exact counts and the engine's coverage, and where the band comes from", () => {
    renderChart(runs);
    expect(screen.getByText(/Hit rate: 1 of 2 inside the 90% band recorded when they started \(50%\)\. Counts only runs with a band recorded when they started\./)).toBeTruthy();
    expect(screen.getByText(/Each band was recorded by the engine when the run started/)).toBeTruthy();
    expect(screen.getByText(/From: Analysis of synthetic_bioprocess.csv · n = 3 started · held-out conformal band \(90%\), recorded per run at start · engine 0.1.0/)).toBeTruthy();
    expect(screen.getByText("Predicted (90% band recorded at start)")).toBeTruthy();
  });

  it("pins a tooltip from the keyboard: measured first, then predicted with its band and coverage, then the source", () => {
    renderChart(runs);
    const mark = screen.getByRole("button", { name: /^Run f7a48e5:/ });
    expect(mark.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(mark, { key: "Enter" });
    const tip = within(screen.getByRole("dialog", { name: "Mark details" }));
    expect(tip.getByText("Measured")).toBeTruthy();
    expect(tip.getByText("90% held-out band")).toBeTruthy();
    expect(tip.getByText("[1.51, 1.92]")).toBeTruthy();
    expect(tip.getByText("Measured − predicted")).toBeTruthy();
    expect(tip.getByText("outside")).toBeTruthy();
    expect(tip.getByText("campaign.pending[id=f7a48e5666].result")).toBeTruthy();
  });

  it("all awaiting: intervals only and the caption that results appear as recorded", () => {
    renderChart([rec("a1", 1.7, null), rec("b2", 1.8, null)]);
    expect(screen.getByText(/^Results appear here as you record them\./)).toBeTruthy();
    expect(screen.queryByText(/Hit rate/)).toBeNull();
  });

  it("legacy runs without a band: no intervals and no inside/outside column; residuals still shown", () => {
    const { container } = renderChart([run("60ad5599d4", 1.75, 1.64), run("f7a48e5666", 1.715, 1.5)], null);
    const svg = container.querySelector("svg[role=group]")!;
    expect(svg.textContent).not.toMatch(/\bBand\b|inside|outside/);
    expect(svg.textContent).toContain("\u22120.11");
    expect(screen.getByText("Predicted (no interval reported)")).toBeTruthy();
  });

  it("a legacy run from another analysis reads band n/a with the reason in its tooltip, and is not scored", () => {
    const { container } = renderChart([run("60ad5599d4", 1.75, 1.64, { analysis_provenance: { provenance_sha256: "older" } }), rec("f7a48e5666", 1.715, 1.5)]);
    expect(container.querySelector("svg[role=group]")!.textContent).toContain("band n/a");
    expect(screen.getByText(/1 measured run without a band recorded at start is left out\./)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Run 60ad559:/ }), { key: "Enter" });
    expect(screen.getByText(/\(no interval reported\) Started before the engine recorded each run's band, and proposed by an earlier analysis/)).toBeTruthy();
  });

  it("a legacy run from the current analysis keeps its band, marked * and named in the footer", () => {
    const { container } = renderChart([run("60ad5599d4", 1.75, 1.64), rec("f7a48e5666", 1.715, 1.5)]);
    expect(container.querySelector("svg[role=group]")!.textContent).toContain("60ad559*");
    expect(screen.getByText(/\* Band from the current analysis/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Run 60ad559:/ }), { key: "Enter" });
    expect(screen.getByText("band from the current analysis (not recorded at start)")).toBeTruthy();
  });

  it("a run without an engine prediction draws the measured dot only, with the engine's reason and the caller's number labelled", () => {
    const reason = "recipe is not one of the published proposals; the engine has no prediction recorded for it";
    const { container } = renderChart([run("c0ffee1234", 1.9, 1.7, { pred_source: "caller", prediction_at_start: { available: false, reason } }), rec("f7a48e5666", 1.715, 1.5)]);
    const row = screen.getByRole("button", { name: /^Run c0ffee1: no engine prediction, measured 1\.70/ }).parentElement!;
    expect(row.querySelectorAll('circle[stroke="var(--chart-predicted)"]')).toHaveLength(0);
    expect(row.querySelectorAll('circle[fill="var(--chart-measured)"]')).toHaveLength(1);
    expect(container.querySelector("svg[role=group]")!.textContent).toContain("not proposed");
    expect(screen.getByText(/1 run has no engine prediction: the recipe was not one of its proposals/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Run c0ffee1:/ }), { key: "Enter" });
    const tip = within(screen.getByRole("dialog", { name: "Mark details" }));
    expect(tip.getByText("No engine prediction")).toBeTruthy();
    expect(tip.getByText(new RegExp(reason))).toBeTruthy();
    expect(tip.getByText("Your prediction, not the engine's")).toBeTruthy();
  });

  it("no started runs: the empty state, no ghost chart", () => {
    const { container } = renderChart([]);
    expect(screen.getByText("No runs started yet. Start a batch from Predict.")).toBeTruthy();
    expect(container.querySelector("svg[role=group]")).toBeNull();
  });
});
