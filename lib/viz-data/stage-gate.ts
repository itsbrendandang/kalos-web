/*
 * C11 StageGateTrack adapter (VIZ_SPEC 5, C11): a campaign's stage track
 * (GET /stages) and its go/no-go gates (GET /gates) into track props. Pure
 * and DOM-free (__tests__/viz-stage-gate.test.ts).
 *
 * Nothing here computes a verdict. The current stage is the one a person
 * recorded (`current_stage`); a gate's decision is the newest row a person
 * recorded. The only derived state is "paused": a recorded no-go at a gate
 * makes every later stage read paused, and nothing advances on its own.
 * Computed evidence (campaign-wide, from the latest analysis) is passed
 * through untouched and is never turned into a decision.
 */
import type { ComputedEvidence, GateDecision, GateEvidenceRef, GateRecord, GatesView, StagesView } from "@/lib/api";
import { formatValue, formatVolume } from "@/lib/num";

export type StagePosition = "done" | "current" | "upcoming" | "unset";

export type TrackGate = {
  key: string;
  decision: GateDecision | null;
  state: "open" | "recorded";
  current: GateRecord | null;
  historyCount: number;
  history: GateRecord[];
  historyTruncated: boolean;
  evidence: ComputedEvidence | null;
};

export type TrackStage = {
  key: string;
  label: string;
  /** "100 µL to 3 mL", or null for a stage with no vessel volume. */
  volume: string | null;
  /** Nominal vessel sizes ("2 L, 10 L, 50 L"), when the stage defines them. */
  nominal: string | null;
  minL: number | null;
  maxL: number | null;
  nominalL: number[] | null;
  position: StagePosition;
  /** True when a recorded no-go at an earlier gate pauses this stage. */
  paused: boolean;
  pausedBy: string | null;
  gate: TrackGate;
};

export type StageTrack = {
  campaignId: string;
  stages: TrackStage[];
  currentStage: string | null;
  source: "default" | "campaign";
  updatedAt: number | null;
  updatedBy: string | null;
  /** The first gate whose newest recorded decision is no-go, if any. */
  noGoGate: string | null;
  orphaned: TrackGate[];
};

const vol = (l: number) => formatVolume(l).text;

/** "100 µL to 3 mL" for a stage range, or null. */
export function stageVolumeText(minL: number | null, maxL: number | null): string | null {
  if (minL == null || maxL == null || !Number.isFinite(minL) || !Number.isFinite(maxL)) return null;
  return minL === maxL ? vol(minL) : `${vol(minL)} to ${vol(maxL)}`;
}

function toGate(g: GatesView["gates"][number]): TrackGate {
  return {
    key: g.key,
    decision: g.decision,
    state: g.state,
    current: g.current,
    historyCount: g.history_count,
    history: g.history ?? [],
    historyTruncated: !!g.history_truncated,
    evidence: g.computed_evidence ?? null,
  };
}

export function toStageTrack(stages: StagesView, gates: GatesView | null | undefined): StageTrack {
  const gateByKey = new Map((gates?.gates ?? []).map((g) => [g.key, g]));
  const current = stages.current_stage;
  const currentIndex = current != null ? stages.stages.findIndex((s) => s.key === current) : -1;
  const list: TrackStage[] = stages.stages.map((s, i) => {
    const gv = gateByKey.get(s.key);
    const gate: TrackGate = gv
      ? toGate(gv)
      : {
          key: s.gate.key,
          decision: s.gate.decision,
          state: s.gate.state,
          current: s.gate.current,
          historyCount: s.gate.history_count,
          history: [],
          historyTruncated: false,
          evidence: null,
        };
    const position: StagePosition = currentIndex < 0 ? "unset" : i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
    return {
      key: s.key,
      label: s.label,
      volume: stageVolumeText(s.min_L, s.max_L),
      nominal: s.nominal_L?.length ? s.nominal_L.map(vol).join(", ") : null,
      minL: s.min_L,
      maxL: s.max_L,
      nominalL: s.nominal_L,
      position,
      paused: false,
      pausedBy: null,
      gate,
    };
  });
  const stop = list.findIndex((s) => s.gate.decision === "no_go");
  if (stop >= 0) for (let j = stop + 1; j < list.length; j++) list[j] = { ...list[j], paused: true, pausedBy: list[stop].key };
  return {
    campaignId: stages.campaign_id,
    stages: list,
    currentStage: currentIndex >= 0 ? current : null,
    source: stages.source,
    updatedAt: stages.updated_at,
    updatedBy: stages.updated_by,
    noGoGate: stop >= 0 ? list[stop].key : null,
    orphaned: (gates?.orphaned_gates ?? []).map(toGate),
  };
}

const DECISION_WORD: Record<GateDecision, string> = { go: "Go", no_go: "No-go", pending: "Pending" };

/** "Go", "No-go", "Pending": the person's recorded call, as a word. */
export const decisionWord = (d: GateDecision): string => DECISION_WORD[d];

/** The gate's state in words: the recorded decision, or "gate open: no decision recorded". */
export function gateStateText(g: Pick<TrackGate, "decision" | "state">): string {
  return g.state === "recorded" && g.decision ? decisionWord(g.decision) : "gate open: no decision recorded";
}

export function positionWord(s: Pick<TrackStage, "position" | "paused">): string {
  // "Earlier" is only the order relative to the stage a person recorded as current; it claims nothing about the stage's gate.
  const base = s.position === "done" ? "earlier" : s.position === "current" ? "current" : s.position === "upcoming" ? "upcoming" : "";
  if (s.paused) return base ? `${base}, paused` : "paused";
  return base;
}

/** Engine seconds (or ms) as "2026-11-19 14:02 UTC". */
export function recordedAt(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t)) return "n/a";
  const d = new Date(t < 1e12 ? t * 1000 : t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Plain-language description of the track (its aria-label and screen-reader summary). */
export function describeStageTrack(t: StageTrack): string {
  const n = formatValue(t.stages.length, { quantity: "count" }).text;
  const parts = [`${n} ${t.stages.length === 1 ? "stage" : "stages"}, each closed by a go/no-go gate your team records.`];
  parts.push(t.currentStage ? `Current stage ${t.currentStage}, recorded by a person.` : "No current stage recorded.");
  for (const s of t.stages) {
    const pos = positionWord(s);
    const g = s.gate.current;
    const gate = g ? `gate ${decisionWord(g.decision)}, recorded by ${g.decided_by} on ${recordedAt(g.decided_at)}` : "gate open, no decision recorded";
    parts.push(`${s.key} ${s.label}${s.volume ? ` (${s.volume})` : ""}${pos ? `, ${pos}` : ""}: ${gate}.`);
  }
  if (t.noGoGate) parts.push(`A no-go at gate ${t.noGoGate} pauses every later stage. Nothing advances on its own.`);
  return parts.join(" ");
}

/* ---------------------------------------------------------------------------
 * Recording a decision: the client check mirrors the engine's 400 codes, and
 * every error code reads as a plain sentence.
 * ------------------------------------------------------------------------ */

/** The engine's note limit (ENGINE_API_V2.md section 2, PUT /gates/{gate}). */
export const MAX_NOTE_CHARS = 2000;
/** The engine's evidence limit per decision. */
export const MAX_EVIDENCE = 20;

// Control characters other than newline and tab, and format characters (Cf: bidi overrides, zero-width), are refused.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u;
const FORMAT = /\p{Cf}/u;

/** null when the engine would accept the note, else a plain sentence saying what to change. */
export function noteProblem(note: string): string | null {
  if (note.trim().length === 0) return "A note is required: say why your team made this call.";
  if (note.length > MAX_NOTE_CHARS) return `The note is ${formatValue(note.length, { quantity: "count" }).text} characters; the limit is ${formatValue(MAX_NOTE_CHARS, { quantity: "count" }).text}.`;
  if (CONTROL.test(note) || FORMAT.test(note)) return "The note contains hidden control or formatting characters (often from a paste). Retype it as plain text.";
  return null;
}

const GATE_ERROR: Record<string, string> = {
  note_required: "A note is required: say why your team made this call.",
  invalid_note: "The note contains hidden control or formatting characters (often from a paste). Retype it as plain text.",
  gate_decision_limit: "This campaign has reached the limit of 1,000 recorded gate decisions, so no more can be added.",
  campaign_archived: "This campaign is archived, so it is read-only: decisions and the current stage cannot be changed.",
  gate_not_found: "This gate is no longer one of the campaign's stages, so it is read-only.",
  invalid_body: "The engine did not accept this decision as sent. Check the note and the linked evidence, then try again.",
  not_found: "This campaign does not exist, or you do not have access to it.",
  invalid_current_stage: "That stage is not one of this campaign's stages.",
  invalid_stages: "The stage list was not accepted.",
  insufficient_scope: "Your account can read this campaign but not change it. Ask an organization admin for write access.",
};

/** A plain sentence for a failed gate or stage write (EngineError.code), or null to fall back to the shared copy. */
export const gateErrorText = (code: string | null | undefined): string | null => (code ? (GATE_ERROR[code] ?? null) : null);

/* ---------------------------------------------------------------------------
 * Evidence a person may link to a decision. These are references the person
 * chose; the engine does not check them against real runs or readouts.
 * ------------------------------------------------------------------------ */

const KIND_WORD: Record<GateEvidenceRef["kind"], string> = { analysis: "Analysis", scale_readout: "Scale-up readout", job: "Job", run: "Run" };
export const evidenceKindWord = (k: GateEvidenceRef["kind"]): string => KIND_WORD[k] ?? k;

/** The current analysis as a reference: its provenance hash, else its input hash. Null when neither exists. */
export function analysisEvidence(a: {
  proposal_provenance?: { provenance_sha256?: string } | null;
  run?: { input_sha256?: string } | null;
  timestamp?: number;
  updated?: number;
}): GateEvidenceRef | null {
  const id = a.proposal_provenance?.provenance_sha256 ?? a.run?.input_sha256;
  if (!id) return null;
  const t = a.timestamp ?? a.updated;
  return { kind: "analysis", id, label: `Analysis of ${t != null ? recordedAt(t) : "the current data"}` };
}

/**
 * Changes whenever the campaign's analysis is replaced: null while it is still
 * loading, "none" when the campaign has no analysis yet, else its timestamp and
 * reference (hashless analyses still get a key).
 */
export function analysisRefreshKey(latest: Parameters<typeof analysisEvidence>[0] & { has_data: boolean } | null): string | null {
  if (!latest) return null;
  if (!latest.has_data) return "none";
  return JSON.stringify([latest.updated ?? null, analysisEvidence(latest)?.id ?? null]);
}

/** A scale readout as a reference (its stable readout id). */
export function readoutEvidence(r: { readout_id: string; decision: string; target_inputs: { scale_L: number } }): GateEvidenceRef {
  const word = r.decision === "REFUSAL" ? "refused" : r.decision === "NUMBER_WITH_WARNING" ? "prediction with warning" : "prediction";
  return { kind: "scale_readout", id: r.readout_id, label: `${vol(r.target_inputs.scale_L)} readout (${word})` };
}

/** A campaign run as a reference. */
export function runEvidence(run: { id: string; round?: number; awaiting: boolean }): GateEvidenceRef {
  return { kind: "run", id: run.id, label: `Run ${run.id.slice(0, 7)}${run.awaiting ? " (awaiting result)" : ""}` };
}
