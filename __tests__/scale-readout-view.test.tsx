// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GateRefusalView, ReadoutReport } from "@/components/scale/readout-result";
import { GatePanel } from "@/components/scale/gate-panel";
import { ScaleLadderChart } from "@/components/viz/charts/scale-ladder-chart";
import { StageGateTrack } from "@/components/viz/charts/stage-gate-track";
import type { GateView, GatesView, StagesView } from "@/lib/api";
import type { ScaleReadout } from "@/lib/scale-readout";
import { sourceFromReadout, toScaleLadderData } from "@/lib/viz-data/scale-ladder";
import { toStageTrack } from "@/lib/viz-data/stage-gate";
import numberJson from "./fixtures/scale-v2-readout.json";
import refusedJson from "./fixtures/scale-v2-readout-refused.json";
import gatesJson from "./fixtures/scale-v2-gates.json";
import stagesJson from "./fixtures/scale-v2-stages.json";

const number = numberJson as unknown as ScaleReadout;
const refused = refusedJson as unknown as ScaleReadout;
const gates = gatesJson as unknown as GatesView;
const stages = stagesJson as unknown as StagesView;
const text = (el: Element) => (el.textContent ?? "").replace(/\u00A0/g, " ");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("JSON readout view", () => {
  it("prints the prediction at the band's precision with the coverage the engine reported and its own label", () => {
    const { container } = render(<ReadoutReport readout={number} fileName="synthetic_scaleup.csv" onEdit={() => {}} onReset={() => {}} />);
    const t = text(container);
    expect(t).toContain("Prediction issued.");
    expect(t).toContain("6.1");
    expect(t).toContain("[5.6, 6.7]");
    expect(t).toContain("90% approximate band");
    expect(t).toContain(number.interval_label);
    // Readout id and upload hash in the source line; nothing scraped from HTML.
    expect(t).toContain(number.readout_id.slice(0, 10));
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("a refusal shows the reasons in plain words, the engine's exact words and what would fix it, and no number", () => {
    const { container } = render(<ReadoutReport readout={refused} fileName={null} onEdit={() => {}} onReset={() => {}} />);
    const t = text(container);
    expect(t).toContain("No prediction at this scale.");
    expect(t).toMatch(/18\.00x/);
    expect(t).toContain("target ratio 18.00x exceeds 5x the reference step ratio 3.33x");
    expect(t).toContain("What it would take");
    expect(t).toContain(refused.data_plan[0].slice(1));
    expect(screen.queryByLabelText("Prediction")).toBeNull();
  });

  it("extra actions (link to a gate) render under the readout", () => {
    render(<ReadoutReport readout={number} fileName={null} onEdit={() => {}} onReset={() => {}} actions={<button type="button">Link it</button>} />);
    expect(screen.getByRole("button", { name: "Link it" })).toBeTruthy();
  });

  it("a 422 gate failure reads in plain words with the engine's check one click down", () => {
    const { container } = render(
      <GateRefusalView failedCheck="target_not_interpolation" detail="interpolation is out of scope for this readout" onEdit={() => {}} onReset={() => {}} />,
    );
    expect(text(container)).toMatch(/not larger than every scale in the sheet/);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(text(container)).toContain("target_not_interpolation");
  });
});

describe("ScaleLadderChart (C9)", () => {
  const source = sourceFromReadout(number, "readout", "predicted", "synthetic_scaleup.csv");

  it("draws measured runs filled and backtest predictions hollow, with an aria description", () => {
    const d = toScaleLadderData(number);
    const { container } = render(<ScaleLadderChart data={d} source={source} width={900} />);
    const svg = container.querySelector("svg[role='group']")!;
    expect(svg.getAttribute("aria-label")).toMatch(/nested leave-last-scale-out/);
    const filled = svg.querySelectorAll("circle[fill='var(--chart-measured)']");
    const hollow = svg.querySelectorAll("circle[stroke='var(--chart-predicted)']");
    expect(filled.length).toBeGreaterThanOrEqual(d.points.length);
    expect(hollow.length).toBe(d.points.filter((p) => p.oofPred != null).length + 1); // + the target prediction
    expect(text(container)).toContain("Prediction");
    expect(text(container)).toContain("licensed");
    expect(text(container)).toContain("refused");
    expect(text(container)).toContain("default stage volume ranges");
    expect(text(container)).toMatch(/readout 66b0733608a0/);
    // Never "leave-one-scale-out".
    expect(text(container)).not.toMatch(/leave-one/i);
  });

  it("a refusal draws a hatched slot labelled with the first reason, and no target prediction", () => {
    const d = toScaleLadderData(refused);
    const { container } = render(<ScaleLadderChart data={d} source={sourceFromReadout(refused, "readout", "derived")} width={900} />);
    expect(text(container)).toMatch(/Refused: target ratio 18\.00x/);
    const svg = container.querySelector("svg[role='group']")!;
    expect(svg.querySelectorAll("circle[stroke='var(--chart-predicted)']").length).toBe(d.points.filter((p) => p.oofPred != null).length);
    expect(container.querySelectorAll("rect[fill^='url(#']").length).toBeGreaterThan(0);
  });

  it("shows flag chips with words for the backtest band and skipped rungs", () => {
    const { container } = render(<ScaleLadderChart data={toScaleLadderData(number)} source={source} width={900} />);
    const flags = screen.getByRole("list", { name: "Flags" });
    expect(text(flags)).toMatch(/10 L: backtest band n\/a/);
    expect(text(flags)).toMatch(/3 L: skipped/);
    expect(within(flags).getAllByRole("listitem").find((li) => text(li).startsWith("10 L"))?.getAttribute("title")).toMatch(/need at least 10/);
    expect(container).toBeTruthy();
  });
});

describe("StageGateTrack (C11)", () => {
  it("open gates are hollow diamonds; a recorded decision is filled with its word", () => {
    const g2 = { ...gates.gates[1], decision: "no_go" as const, state: "recorded" as const, current: { id: 1, gate: "S2", decision: "no_go" as const, note: "n", evidence_linked: [], decided_by: "bob@acme", decided_at: 1795116328, basis: "recorded" as const }, history_count: 1 };
    const track = toStageTrack({ ...stages, current_stage: "S2" }, { ...gates, gates: gates.gates.map((g) => (g.key === "S2" ? g2 : g)) });
    const onSelect = vi.fn();
    const { container } = render(<StageGateTrack track={track} selectedGate="S2" onSelectGate={onSelect} />);
    const s2 = screen.getByRole("button", { name: /Gate S2: No-go · bob@acme/ });
    expect(s2.getAttribute("aria-pressed")).toBe("true");
    expect(text(container)).toMatch(/paused by a no-go at gate S2/);
    fireEvent.click(screen.getByRole("button", { name: /Gate S3: gate open/ }));
    expect(onSelect).toHaveBeenCalledWith("S3");
  });
});

describe("Gate panel: evidence apart from the decision", () => {
  const gate = gates.gates[2] as GateView;
  const track = toStageTrack(stages, gates);
  const base = {
    campaignId: "cmp_a28912911eee460dae2524ecd4047e7b",
    stage: track.stages[2],
    nextStage: track.stages[3],
    gate,
    readOnly: false,
    readOnlyReason: null,
    evidenceOptions: [{ ref: { kind: "scale_readout" as const, id: number.readout_id, label: "7,500 L readout (prediction)" } }],
    selected: new Set<string>(),
    onToggleEvidence: () => {},
    onRecorded: () => {},
  };

  it("shows the engine's computed evidence with its note, and a decision panel that is never pre-filled", () => {
    render(<GatePanel {...base} />);
    const evidence = screen.getByRole("region", { name: "Evidence, computed by Kalos" });
    expect(text(evidence)).toContain("no go/no-go is derived from it");
    expect(text(evidence)).toMatch(/ρ 0\.66 \[0\.54, 0\.77\] 95% CI/);
    const decision = screen.getByRole("region", { name: "Decision, recorded by your team" });
    expect(text(decision)).toContain("No decision recorded");
    for (const r of within(decision).getAllByRole("radio")) expect((r as HTMLInputElement).checked).toBe(false);
    expect((within(decision).getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("refuses to send without a decision and a note (mirrors 400 note_required)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<GatePanel {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    expect(screen.getByText("Choose go, no-go or pending.")).toBeTruthy();
    expect(screen.getByText(/A note is required/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records go/no-go/pending with the note and the evidence the person chose; who and when come from the server", async () => {
    const recorded = { id: 9, gate: "S3", decision: "no_go", note: "titer fell", evidence_linked: [base.evidenceOptions[0].ref], decided_by: "dev@kalos", decided_at: 1795120000, basis: "recorded" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ campaign_id: base.campaignId, recorded, gate: { ...gate, decision: "no_go", state: "recorded", current: recorded, history_count: 1, history: [recorded] } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const onRecorded = vi.fn();
    render(<GatePanel {...base} selected={new Set([`scale_readout:${number.readout_id}`])} onRecorded={onRecorded} />);
    fireEvent.click(screen.getByRole("radio", { name: /No-go/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "titer fell" } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/engine/api/campaigns/${base.campaignId}/gates/S3`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ decision: "no_go", note: "titer fell", evidence: [base.evidenceOptions[0].ref] });
    expect(screen.getByRole("status").textContent).toMatch(/Recorded by dev@kalos/);
  });

  it("shows the engine's refusal in plain words (invalid_note, campaign_archived)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "the campaign is archived; it can be read but not changed", code: "campaign_archived" }), { status: 409, headers: { "content-type": "application/json" } })));
    render(<GatePanel {...base} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Go/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() => expect(screen.getByText(/This campaign is archived, so it is read-only/)).toBeTruthy());
  });

  it("is read-only for an archived campaign", () => {
    render(<GatePanel {...base} readOnly readOnlyReason="This campaign is archived." />);
    expect(screen.queryByRole("button", { name: "Record decision" })).toBeNull();
    expect(screen.getByText("This campaign is archived.")).toBeTruthy();
  });

  it("an unavailable evidence block gives the engine's reason and what would fix it", () => {
    const g = { ...gate, computed_evidence: { available: false as const, basis: "computed" as const, code: "no_analysis", reason: "the campaign has no stored analysis", what_would_fix_it: "upload a run sheet" } };
    render(<GatePanel {...base} gate={g} />);
    const evidence = screen.getByRole("region", { name: "Evidence, computed by Kalos" });
    expect(text(evidence)).toContain("Not available: the campaign has no stored analysis");
    expect(text(evidence)).toContain("What would fix it: upload a run sheet");
  });
});
