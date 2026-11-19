"use client";

import { useState } from "react";
import { CircleDashed, Loader2 } from "lucide-react";
import { Callout } from "@/components/kit/callout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GateDiamond } from "@/components/viz/charts/stage-gate-track";
import { Num } from "@/components/viz/num";
import { getGateHistory, recordGateDecision, type ComputedEvidence, type GateDecision, type GateEvidenceRef, type GateRecord, type GateView } from "@/lib/api";
import { EngineError, engineMessage } from "@/lib/engine-error";
import { formatCorr, formatValue } from "@/lib/num";
import { cn } from "@/lib/utils";
import {
  MAX_EVIDENCE,
  MAX_NOTE_CHARS,
  decisionWord,
  evidenceKindWord,
  gateErrorText,
  noteProblem,
  recordedAt,
  type TrackStage,
} from "@/lib/viz-data/stage-gate";

/*
 * One gate: what Kalos computed (campaign-wide evidence, never a verdict) and,
 * visually apart behind a dashed border, what the team recorded. The decision
 * form is never pre-filled from the evidence: no decision is selected until a
 * person picks one, and a note is required (the engine refuses an empty one).
 * Who and when always come from the server's recorded row.
 */

export type EvidenceOption = { ref: GateEvidenceRef; detail?: string };
const optionKey = (r: GateEvidenceRef) => `${r.kind}:${r.id}`;

const DECISIONS: { value: GateDecision; word: string; hint: string }[] = [
  { value: "go", word: "Go", hint: "advance to the next stage" },
  { value: "no_go", word: "No-go", hint: "pause the later stages" },
  { value: "pending", word: "Pending", hint: "a call is needed but not made yet" },
];

export function GatePanel({
  campaignId,
  stage,
  nextStage,
  gate,
  readOnly,
  readOnlyReason,
  evidenceOptions,
  selected,
  onToggleEvidence,
  onRecorded,
}: {
  campaignId: string;
  stage: TrackStage;
  nextStage: TrackStage | null;
  /** The engine's gate view (computed evidence and up to 20 newest decisions). */
  gate: GateView | null;
  readOnly: boolean;
  readOnlyReason: string | null;
  evidenceOptions: EvidenceOption[];
  selected: ReadonlySet<string>;
  onToggleEvidence: (key: string) => void;
  onRecorded: (gate: GateView, recorded: GateRecord) => void;
}) {
  const title = nextStage ? `Gate ${stage.key}: ${stage.label} to ${nextStage.label}` : `Gate ${stage.key}: ${stage.label}`;
  return (
    <section aria-labelledby={`gate-${stage.key}-title`} className="flex flex-col gap-4">
      <h3 id={`gate-${stage.key}-title`} className="flex items-center gap-2 text-heading text-fg">
        <GateDiamond recorded={gate?.state === "recorded"} />
        {title}
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <EvidencePanel evidence={gate?.computed_evidence ?? null} />
        <DecisionPanel
          key={stage.key}
          campaignId={campaignId}
          gateKey={stage.key}
          gate={gate}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          evidenceOptions={evidenceOptions}
          selected={selected}
          onToggleEvidence={onToggleEvidence}
          onRecorded={onRecorded}
        />
      </div>
      {gate ? <GateHistory key={`${stage.key}-${gate.history_count}`} campaignId={campaignId} gate={gate} /> : null}
    </section>
  );
}

function EvidencePanel({ evidence: e }: { evidence: ComputedEvidence | null }) {
  return (
    <section aria-label="Evidence, computed by Kalos" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-panel">
      <h4 className="text-label text-fg">Evidence (computed by Kalos)</h4>
      {!e ? (
        <p className="text-body text-fg-muted">The engine sent no computed evidence for this gate.</p>
      ) : !e.available ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-start gap-2 text-body text-fg">
            <CircleDashed className="mt-1 size-3.5 shrink-0 text-fg-muted" aria-hidden />
            <span>Not available: {e.reason}</span>
          </p>
          {e.what_would_fix_it ? (
            <p className="text-body text-fg-muted">
              <span className="text-fg">What would fix it:</span> {e.what_would_fix_it}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            {e.best_measured ? (
              <>
                <dt className="text-fg-muted">Best measured{e.target ? <span className="font-mono text-code"> {e.target}</span> : null}</dt>
                <dd>
                  <Num value={e.best_measured.value} basis="measured" />
                </dd>
              </>
            ) : null}
            {e.n_measured != null ? (
              <>
                <dt className="text-fg-muted">Measured rows</dt>
                <dd className="tabular-nums text-fg">{formatValue(e.n_measured, { quantity: "count" }).text}</dd>
              </>
            ) : null}
            {e.reliability ? (
              <>
                <dt className="text-fg-muted">Held-out rank agreement</dt>
                <dd className="text-fg tabular-nums">
                  {e.reliability.spearman != null ? formatCorr(e.reliability.spearman, e.reliability.ci95).text : "n/a"}
                  <span className="block text-caption text-fg-muted">
                    {e.reliability.spearman_floor != null ? `trust floor ${formatValue(e.reliability.spearman_floor, { quantity: "corr" }).text}: ` : ""}
                    {e.reliability.clears_floor == null ? "floor n/a" : e.reliability.clears_floor ? "clears the floor" : "below the floor"}
                    {e.reliability.ci_excludes_zero == null ? "" : e.reliability.ci_excludes_zero ? ", interval excludes zero" : ", interval includes zero"}
                  </span>
                </dd>
              </>
            ) : null}
            {e.promotion ? (
              <>
                <dt className="text-fg-muted">Promotion checks</dt>
                <dd className="text-fg">
                  {e.promotion.passed ? "passed" : `not passed (${formatValue(e.promotion.failures.length, { quantity: "count" }).text} failed)`}
                  <span className="block text-caption text-fg-muted">reported, not enforced</span>
                </dd>
              </>
            ) : null}
            {e.analysis_updated_at != null ? (
              <>
                <dt className="text-fg-muted">From the analysis of</dt>
                <dd className="text-fg tabular-nums">{recordedAt(e.analysis_updated_at)}</dd>
              </>
            ) : null}
          </dl>
          <p className="text-caption text-fg-muted">The engine: {e.note}</p>
        </>
      )}
    </section>
  );
}

function DecisionPanel({
  campaignId,
  gateKey,
  gate,
  readOnly,
  readOnlyReason,
  evidenceOptions,
  selected,
  onToggleEvidence,
  onRecorded,
}: {
  campaignId: string;
  gateKey: string;
  gate: GateView | null;
  readOnly: boolean;
  readOnlyReason: string | null;
  evidenceOptions: EvidenceOption[];
  selected: ReadonlySet<string>;
  onToggleEvidence: (key: string) => void;
  onRecorded: (gate: GateView, recorded: GateRecord) => void;
}) {
  // Never pre-filled: no decision until a person picks one.
  const [decision, setDecision] = useState<GateDecision | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GateRecord | null>(null);
  const problem = noteProblem(note);
  const chosen = evidenceOptions.filter((o) => selected.has(optionKey(o.ref)));
  const tooMany = chosen.length > MAX_EVIDENCE;
  const current = gate?.current ?? null;
  const writable = !readOnly && gate?.in_stage_definitions !== false;

  async function submit() {
    setTouched(true);
    if (!decision || problem || tooMany || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await recordGateDecision(campaignId, gateKey, { decision, note, evidence: chosen.map((o) => o.ref) });
      setSaved(res.recorded);
      setDecision(null);
      setNote("");
      setTouched(false);
      onRecorded(res.gate, res.recorded);
    } catch (e) {
      const code = e instanceof EngineError ? e.code : null;
      setError(gateErrorText(code) ?? engineMessage({ code: code ?? "engine_error", error: e instanceof EngineError ? e.detail : null }).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Decision, recorded by your team" className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-panel">
      <h4 className="text-label text-fg">Decision (recorded by your team)</h4>
      {current ? <RecordedRow r={current} headline /> : (
        <p className="flex items-center gap-2 text-body text-fg">
          <GateDiamond recorded={false} />
          No decision recorded
        </p>
      )}
      {saved ? (
        <p role="status" className="text-caption text-fg-muted">
          Recorded by {saved.decided_by} at {recordedAt(saved.decided_at)} (time and name from the server).
        </p>
      ) : null}

      {!writable ? (
        <p className="text-body text-fg-muted">{readOnlyReason ?? (gate?.in_stage_definitions === false ? "This gate is no longer one of the campaign's stages, so it is read-only." : "Read-only.")}</p>
      ) : (
        <form
          className="flex flex-col gap-3 border-t border-border pt-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            void submit();
          }}
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-label text-fg">Record a decision</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
              {DECISIONS.map((d) => (
                <label
                  key={d.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-body",
                    decision === d.value ? "border-accent bg-accent-soft text-fg" : "border-border-strong text-fg hover:bg-subtle",
                  )}
                >
                  <input type="radio" name={`decision-${gateKey}`} value={d.value} checked={decision === d.value} onChange={() => setDecision(d.value)} className="accent-[var(--accent)]" />
                  <span>{d.word}</span>
                  <span className="sr-only">: {d.hint}</span>
                </label>
              ))}
            </div>
            {touched && !decision ? <p className="text-caption text-bad">Choose go, no-go or pending.</p> : null}
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-label text-fg">Note (required)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => setTouched(true)}
              rows={3}
              maxLength={MAX_NOTE_CHARS + 200}
              aria-invalid={touched && problem ? true : undefined}
              placeholder="Why your team made this call"
              className="w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 py-2 text-body text-fg placeholder:text-fg-muted hover:border-fg-muted focus-visible:border-accent aria-invalid:border-bad"
            />
            <span className="flex justify-between gap-2 text-caption">
              <span className={touched && problem ? "text-bad" : "text-fg-muted"}>{touched && problem ? problem : "Stored with the decision. Who and when are added by the server."}</span>
              <span className="shrink-0 text-fg-muted tabular-nums">
                {formatValue(note.length, { quantity: "count" }).text} / {formatValue(MAX_NOTE_CHARS, { quantity: "count" }).text}
              </span>
            </span>
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-label text-fg">Link evidence (optional, your choice)</legend>
            {evidenceOptions.length === 0 ? (
              <p className="text-caption text-fg-muted">Nothing to link yet. Run a scale-up readout below, or analyze the campaign, to link it here.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {evidenceOptions.map((o) => {
                  const k = optionKey(o.ref);
                  return (
                    <li key={k}>
                      <label className="flex cursor-pointer items-start gap-2 text-body text-fg">
                        <Checkbox checked={selected.has(k)} onChange={() => onToggleEvidence(k)} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="text-fg-muted">{evidenceKindWord(o.ref.kind)}:</span> {o.ref.label ?? o.ref.id}{" "}
                          <span className="font-mono text-code text-fg-muted">{o.ref.id.slice(0, 10)}</span>
                          {o.detail ? <span className="block text-caption text-fg-muted">{o.detail}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {tooMany ? <p className="text-caption text-bad">At most {formatValue(MAX_EVIDENCE, { quantity: "count" }).text} items can be linked to one decision.</p> : null}
            <p className="text-caption text-fg-muted">Linked items are references you choose; the engine does not check them against real runs or readouts.</p>
          </fieldset>

          {error ? (
            <Callout tone="bad" title="The decision was not recorded">
              {error}
            </Callout>
          ) : null}
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              Record decision
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function RecordedRow({ r, headline = false }: { r: GateRecord; headline?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", headline ? "text-body" : "text-caption")}>
        <GateDiamond recorded size={headline ? 14 : 11} />
        <span className="font-medium text-fg">{decisionWord(r.decision)}</span>
        <span className="text-fg-muted">
          by {r.decided_by} · {recordedAt(r.decided_at)}
        </span>
      </p>
      <p className={cn("whitespace-pre-wrap text-fg", headline ? "text-body" : "text-caption")}>{r.note}</p>
      {r.evidence_linked?.length ? (
        <ul className="flex flex-col gap-0.5 text-caption text-fg-muted">
          {r.evidence_linked.map((e) => (
            <li key={`${e.kind}:${e.id}`}>
              Linked {evidenceKindWord(e.kind).toLowerCase()}: {e.label ?? ""} <span className="font-mono text-code">{e.id.slice(0, 12)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const PAGE = 20;

function GateHistory({ campaignId, gate }: { campaignId: string; gate: GateView }) {
  const [more, setMore] = useState<GateRecord[]>([]);
  const [hasMore, setHasMore] = useState(gate.history_truncated || gate.history_count > gate.history.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = [...gate.history, ...more];
  if (gate.history_count === 0) return null;

  async function loadMore() {
    const oldest = rows[rows.length - 1];
    if (!oldest) return;
    setBusy(true);
    setError(null);
    try {
      const page = await getGateHistory(campaignId, gate.key, { limit: PAGE, beforeId: oldest.id });
      setMore((m) => [...m, ...page.items]);
      setHasMore(page.has_more);
    } catch (e) {
      setError(engineMessage({ code: e instanceof EngineError ? e.code : "engine_error" }).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`Decision history for gate ${gate.key}`} className="flex flex-col gap-2">
      <h4 className="text-label text-fg">
        History <span className="font-normal text-fg-muted">({formatValue(gate.history_count, { quantity: "count" }).text} recorded, newest first; append-only)</span>
      </h4>
      <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2">
            <RecordedRow r={r} />
          </li>
        ))}
      </ol>
      {error ? <p className="text-caption text-bad">{error}</p> : null}
      {hasMore ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            Show more
          </Button>
        </div>
      ) : null}
    </section>
  );
}
