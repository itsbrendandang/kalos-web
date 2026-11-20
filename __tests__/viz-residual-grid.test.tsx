// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "./fixtures/clones-v7-campaign.json";
import { ResidualGridChart } from "@/components/viz/charts/residual-grid";
import type { Campaign, CampaignRun } from "@/lib/api";
import { describeResidualGrid, NEEDS_HISTORY, ratioClass, residualTable, toResidualGrid } from "@/lib/viz-data/residual-grid";

afterEach(cleanup);

type Active = Extract<Campaign, { has_campaign: true }>;
const campaign = fixture as unknown as Active;
const copy = (): Active => JSON.parse(JSON.stringify(campaign));

describe("toResidualGrid (H6)", () => {
  const g = toResidualGrid(campaign, "g/L")!;
  it("has the current round from the runs and a 'needs prediction history' row for each folded round", () => {
    expect(g.rounds.map((r) => [r.label, r.needsHistory])).toEqual([
      ["Round 2", false],
      ["Round 1", true],
    ]);
    expect(g.rounds[1].cells).toEqual([]);
  });
  it("places each run at its proposal slot and takes residual and inside_band verbatim from the engine", () => {
    const r2 = g.rounds[0];
    expect(r2.cells.map((c) => c.slot)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    const run = campaign.pending.find((p) => p.prediction_at_start && p.prediction_at_start.available && p.prediction_at_start.proposal_index === 0)!;
    expect(r2.cells[0].residual).toBe(run.residual);
    expect(r2.cells[0].inside).toBe(run.inside_band);
    expect(r2.inside).toBe(r2.cells.filter((c) => c.inside === true).length);
    expect(r2.awaiting).toBe(2);
  });
  it("never re-derives inside/outside from the band: the engine's flag wins", () => {
    const c = copy();
    const run = c.pending.find((p) => p.result != null)!;
    run.inside_band = !run.inside_band;
    const cell = toResidualGrid(c)!.rounds[0].cells.find((x) => x.runId === run.id)!;
    expect(cell.inside).toBe(run.inside_band);
  });
  it("a run without an engine prediction is not given a residual band, and says why", () => {
    const c = copy();
    const run = c.pending[0] as CampaignRun;
    run.prediction_at_start = { available: false, reason: "recipe is not one of the published proposals; the engine has no prediction recorded for it" };
    run.pred_source = "caller";
    const cell = toResidualGrid(c)!.rounds[0].cells.find((x) => x.runId === run.id)!;
    expect(cell.state).toBe("no-prediction");
    expect(cell.slot).toBe("not proposed");
    expect(cell.reason).toMatch(/not one of the published proposals/);
  });
  it("diverging classes are symmetric around zero, with the band edge at one half-width", () => {
    expect(ratioClass(0.2)).toBe(0);
    expect(ratioClass(-0.2)).toBe(0);
    expect(ratioClass(0.9)).toBe(1);
    expect(ratioClass(-0.9)).toBe(-1);
    expect(ratioClass(1.4)).toBe(2);
    expect(ratioClass(-1.4)).toBe(-2);
    expect(ratioClass(null)).toBeNull();
  });
  it("describes each round and lists every run in the Data table", () => {
    expect(describeResidualGrid(g)).toMatch(/Round 2: \d of \d inside the 90% band recorded at start, 2 awaiting\. Round 1: needs prediction history/);
    expect(residualTable(g).rows).toHaveLength(6);
  });
  it("a campaign with no recorded predictions at all gets no grid rows to draw", () => {
    const c = copy();
    c.pending = [];
    c.round = 0;
    expect(toResidualGrid(c)!.rounds).toEqual([]);
  });
});

describe("ResidualGridChart", () => {
  it("renders the current round's runs and the documented empty row for folded rounds", () => {
    render(<ResidualGridChart grid={toResidualGrid(campaign, "g/L")!} sourceLabel="Campaign runs" width={900} />);
    expect(screen.getAllByRole("gridcell").length).toBe(6);
    expect(screen.getByRole("gridcell", { name: /^Round 1: needs prediction history/ })).toBeTruthy();
    expect(screen.getAllByRole("gridcell", { name: /awaiting a measured result/ })).toHaveLength(2);
    expect(screen.getByText(/^From: Campaign runs · campaign\.pending/)).toBeTruthy();
  });
  it("shows the 'needs prediction history' state when only folded rounds exist", () => {
    const c = copy();
    c.pending = [];
    render(<ResidualGridChart grid={toResidualGrid(c)!} sourceLabel="Campaign runs" width={900} />);
    expect(screen.getByText(NEEDS_HISTORY)).toBeTruthy();
  });
});
