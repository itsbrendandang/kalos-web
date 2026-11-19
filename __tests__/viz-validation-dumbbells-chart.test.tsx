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
const runs = [run("60ad5599d4", 1.75, 1.64), run("ba5d212105", 1.736, null), run("f7a48e5666", 1.715, 1.5)];
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
    expect(screen.getByText(/Hit rate: 1 of 2 inside the 90% band \(50%\)/)).toBeTruthy();
    expect(screen.getByText(/the engine does not record the band a run was started with/)).toBeTruthy();
    expect(screen.getByText(/From: Analysis of synthetic_bioprocess.csv · n = 3 started · held-out conformal band \(90%\) · engine 0.1.0/)).toBeTruthy();
    expect(screen.getByText("Predicted (90% band)")).toBeTruthy();
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
    renderChart([run("a1", 1.7, null), run("b2", 1.8, null)]);
    expect(screen.getByText("Results appear here as you record them.")).toBeTruthy();
    expect(screen.queryByText(/Hit rate/)).toBeNull();
  });

  it("missing band: no intervals and no inside/outside column; residuals still shown", () => {
    const { container } = renderChart(runs, null);
    const svg = container.querySelector("svg[role=group]")!;
    expect(svg.textContent).not.toMatch(/\bBand\b|inside|outside/);
    expect(svg.textContent).toContain("\u22120.11");
    expect(screen.getByText("Predicted (no interval reported)")).toBeTruthy();
  });

  it("a run from another analysis reads band n/a with the reason in its tooltip", () => {
    const { container } = renderChart([run("60ad5599d4", 1.75, 1.64, { analysis_provenance: { provenance_sha256: "older" } })]);
    expect(container.querySelector("svg[role=group]")!.textContent).toContain("band n/a");
    expect(screen.getByText(/No measured run has a band from the current analysis to check against/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Run 60ad559:/ }), { key: "Enter" });
    expect(screen.getByText(/\(no interval reported\) Proposed by an earlier analysis/)).toBeTruthy();
  });

  it("no started runs: the empty state, no ghost chart", () => {
    const { container } = renderChart([]);
    expect(screen.getByText("No runs started yet. Start a batch from Predict.")).toBeTruthy();
    expect(container.querySelector("svg[role=group]")).toBeNull();
  });
});
