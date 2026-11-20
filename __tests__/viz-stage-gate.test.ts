import { describe, expect, it } from "vitest";
import type { GateRecord, GatesView, StagesView } from "@/lib/api";
import { stagesBody } from "@/components/scale/current-stage-control";
import {
  analysisEvidence,
  decisionWord,
  describeStageTrack,
  gateErrorText,
  gateStateText,
  noteProblem,
  positionWord,
  readoutEvidence,
  runEvidence,
  stageVolumeText,
  toStageTrack,
} from "@/lib/viz-data/stage-gate";
import gatesJson from "./fixtures/scale-v2-gates.json";
import stagesJson from "./fixtures/scale-v2-stages.json";

/* C11 StageGateTrack adapter, against GET /stages and GET /gates captured from the live engine. */
const stages = stagesJson as unknown as StagesView;
const gates = gatesJson as unknown as GatesView;
const nb = (s: string | null) => (s ?? "").replace(/\u00A0/g, " ");

const record = (gate: string, decision: GateRecord["decision"], id = 1): GateRecord => ({
  id,
  gate,
  decision,
  note: "titer collapsed at 10 L",
  evidence_linked: [],
  decided_by: "bob@acme",
  auth_method: "jwt",
  decided_at: 1795116328,
  basis: "recorded",
});

function withDecision(view: GatesView, key: string, decision: GateRecord["decision"]): GatesView {
  return {
    ...view,
    gates: view.gates.map((g) =>
      g.key === key ? { ...g, decision, state: "recorded", current: record(key, decision), history_count: 1, history: [record(key, decision)] } : g,
    ),
  };
}

describe("toStageTrack (defaults, nothing recorded)", () => {
  const t = toStageTrack(stages, gates);

  it("lists the six stages with their volumes", () => {
    expect(t.stages.map((s) => s.key)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    expect(nb(t.stages[1].volume)).toBe("100 µL to 3 mL");
    expect(nb(t.stages[3].volume)).toBe("500 mL to 1 L");
    expect(t.stages[0].volume).toBeNull();
    expect(nb(t.stages[4].nominal)).toBe("2 L, 10 L, 50 L");
  });

  it("no current stage: nothing is done, current or paused, every gate is open", () => {
    expect(t.currentStage).toBeNull();
    expect(t.stages.every((s) => s.position === "unset" && !s.paused)).toBe(true);
    expect(t.stages.every((s) => s.gate.state === "open" && s.gate.current === null)).toBe(true);
    expect(gateStateText(t.stages[0].gate)).toBe("gate open: no decision recorded");
  });

  it("passes the computed evidence through untouched", () => {
    expect(t.stages[2].gate.evidence).toEqual(gates.gates[2].computed_evidence);
  });

  it("describes the track", () => {
    const text = nb(describeStageTrack(t));
    expect(text).toMatch(/^6 stages, each closed by a go\/no-go gate your team records\. No current stage recorded\./);
    expect(text).toMatch(/S2 HT microbioreactor \(100 µL to 3 mL\): gate open, no decision recorded\./);
  });
});

describe("toStageTrack (recorded by people)", () => {
  it("positions follow the recorded current stage, never a computed one", () => {
    const t = toStageTrack({ ...stages, current_stage: "S3" }, gates);
    expect(t.stages.map((s) => s.position)).toEqual(["done", "done", "current", "upcoming", "upcoming", "upcoming"]);
    // Worded by order only: an earlier stage is not claimed "done" (its gate may still be open).
    expect(positionWord(t.stages[0])).toBe("earlier");
  });

  it("a go does not advance the current stage", () => {
    const t = toStageTrack({ ...stages, current_stage: "S3" }, withDecision(gates, "S3", "go"));
    expect(t.currentStage).toBe("S3");
    expect(t.stages[2].position).toBe("current");
    expect(t.stages[2].gate.decision).toBe("go");
    expect(t.stages.some((s) => s.paused)).toBe(false);
  });

  it("a no-go pauses every later stage and nothing else", () => {
    const t = toStageTrack({ ...stages, current_stage: "S4" }, withDecision(gates, "S4", "no_go"));
    expect(t.noGoGate).toBe("S4");
    expect(t.stages.map((s) => s.paused)).toEqual([false, false, false, false, true, true]);
    expect(t.stages[4].pausedBy).toBe("S4");
    expect(positionWord(t.stages[4])).toBe("upcoming, paused");
    expect(t.stages[3].position).toBe("current");
    expect(describeStageTrack(t)).toMatch(/A no-go at gate S4 pauses every later stage\. Nothing advances on its own\./);
  });

  it("who and when come from the server's recorded row", () => {
    const t = toStageTrack(stages, withDecision(gates, "S2", "pending"));
    const g = t.stages[1].gate;
    expect(g.current?.decided_by).toBe("bob@acme");
    expect(gateStateText(g)).toBe("Pending");
    expect(describeStageTrack(t)).toMatch(/S2 HT microbioreactor .*gate Pending, recorded by bob@acme on 2026-11-19 \d\d:\d\d UTC\./);
  });

  it("falls back to the stage's own gate summary when /gates is missing", () => {
    const t = toStageTrack(stages, null);
    expect(t.stages).toHaveLength(6);
    expect(t.stages[0].gate.evidence).toBeNull();
  });

  it("decision words", () => {
    expect(decisionWord("go")).toBe("Go");
    expect(decisionWord("no_go")).toBe("No-go");
    expect(decisionWord("pending")).toBe("Pending");
  });
});

describe("recording a decision: the client mirrors the engine's note rules", () => {
  it("a note is required (400 note_required)", () => {
    expect(noteProblem("")).toMatch(/note is required/);
    expect(noteProblem("   \n\t ")).toMatch(/note is required/);
    expect(noteProblem("titer held at 10 L")).toBeNull();
  });
  it("at most 2000 characters", () => {
    expect(noteProblem("x".repeat(2000))).toBeNull();
    expect(noteProblem("x".repeat(2001))).toMatch(/2,001 characters; the limit is 2,000/);
  });
  it("control and format characters are refused (400 invalid_note); newline and tab are fine", () => {
    expect(noteProblem("line one\nline\ttwo")).toBeNull();
    expect(noteProblem("bad \u0007 bell")).toMatch(/hidden control/);
    expect(noteProblem("bidi \u202E override")).toMatch(/hidden control/);
    expect(noteProblem("zero\u200Bwidth")).toMatch(/hidden control/);
  });
  it("engine error codes read in plain words", () => {
    expect(gateErrorText("invalid_note")).toMatch(/hidden control/);
    expect(gateErrorText("gate_decision_limit")).toMatch(/limit of 1,000/);
    expect(gateErrorText("campaign_archived")).toMatch(/archived/);
    expect(gateErrorText("note_required")).toMatch(/note is required/);
    expect(gateErrorText("unknown_code")).toBeNull();
    expect(gateErrorText(null)).toBeNull();
  });
});

describe("evidence references a person may link", () => {
  it("the current analysis: provenance hash, else input hash", () => {
    expect(analysisEvidence({ proposal_provenance: { provenance_sha256: "abc" }, run: { input_sha256: "def" }, timestamp: 1795116328 })).toMatchObject({ kind: "analysis", id: "abc" });
    expect(analysisEvidence({ proposal_provenance: null, run: { input_sha256: "def" } })).toMatchObject({ kind: "analysis", id: "def" });
    expect(analysisEvidence({})).toBeNull();
  });
  it("a readout by its stable readout id", () => {
    const ref = readoutEvidence({ readout_id: "r".repeat(64), decision: "REFUSAL", target_inputs: { scale_L: 90000 } });
    expect(ref.kind).toBe("scale_readout");
    expect(ref.id).toBe("r".repeat(64));
    expect(nb(ref.label ?? "")).toBe("90,000 L readout (refused)");
  });
  it("a run by its id", () => {
    expect(runEvidence({ id: "run_1234567890", awaiting: true })).toEqual({ kind: "run", id: "run_1234567890", label: "Run run_123 (awaiting result)" });
  });
});

describe("current stage PUT body", () => {
  it("sends the same stage list and the chosen current stage, without inventing volumes", () => {
    const body = stagesBody(stages, "S3");
    expect(body.current_stage).toBe("S3");
    expect(body.stages.map((s) => s.key)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    expect(body.stages[0]).toEqual({ key: "S1", label: "HT media screen" });
    expect(body.stages[4]).toEqual({ key: "S5", label: "Bioreactor", min_L: 2, max_L: 50, nominal_L: [2, 10, 50] });
    expect(stagesBody(stages, null).current_stage).toBeNull();
  });
  it("stage volume text", () => {
    expect(stageVolumeText(null, null)).toBeNull();
    expect(nb(stageVolumeText(2, 2))).toBe("2 L");
  });
});
