"use client";

import { useState } from "react";
import { MeasuredValue, PredictedValue } from "@/components/campaign/plan/marks";
import { BAND_MISSING, bandOutcome, resultHistory, runBand, type BandAnalysis, type SessionCorrection } from "@/components/campaign/learn";
import { changedRows, parseEntry, sanityReason } from "@/components/campaign/stage-logic";
import { formatTimestamp } from "@/components/kit/source-line";
import { CorrectResultDialog } from "@/components/validate/correct-result-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEngineWrites } from "@/hooks/use-engine";
import type { CampaignRun } from "@/lib/api";
import { errorMessage } from "@/lib/engine-error";
import { formatBand, formatNumber } from "@/lib/format";
import { shortId } from "@/lib/workbench";

type Row = { id: string; value: number };

/**
 * Enter measured results, one input per awaiting run; recorded runs show the
 * measured value (filled ink) beside the prediction (hollow ring), whether it
 * landed inside the prediction band, and its version history. Saving writes
 * the entered rows one at a time, so a failure leaves the earlier rows saved.
 * A recorded value is corrected through a dialog that asks for the reason the
 * engine requires (results are append-only and versioned).
 */
export function RecordForm({
  runs,
  analysis,
  best,
  unit,
  readOnly = false,
  onSavingChange,
}: {
  runs: CampaignRun[];
  analysis: BandAnalysis | null;
  best: number | null;
  unit: string;
  /** Archived campaigns are read-only. */
  readOnly?: boolean;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { logResult } = useEngineWrites();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSavingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Row[] | null>(null);
  const [correcting, setCorrecting] = useState<CampaignRun | null>(null);
  const [corrections, setCorrections] = useState<Record<string, SessionCorrection>>({});

  const setSaving = (v: boolean) => {
    setSavingState(v);
    onSavingChange?.(v);
  };
  const awaiting = runs.filter((r) => r.awaiting);
  const ordered = [...awaiting, ...runs.filter((r) => !r.awaiting)];
  const changed = changedRows(awaiting, drafts);
  const flagged = (rows: Row[]) => rows.filter((r) => sanityReason(r.value, best) != null);

  async function save(rows: Row[]) {
    setConfirm(null);
    setSaving(true);
    setError(null);
    setSaved(null);
    let done = 0;
    for (const { id, value } of rows) {
      try {
        await logResult(id, value);
        done += 1;
        setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
      } catch (e) {
        setError(
          `Run ${shortId(id)} was not saved: ${errorMessage(e).message}${done > 0 ? ` The ${done === 1 ? "result" : `${done} results`} before it ${done === 1 ? "was" : "were"} saved.` : ""}`,
        );
        break;
      }
    }
    if (done === rows.length) setSaved(`Saved ${formatNumber(done, "count")} ${done === 1 ? "result" : "results"}.`);
    setSaving(false);
  }

  async function correct(run: CampaignRun, value: number, reason: string) {
    setSaved(null);
    await logResult(run.id, value, reason);
    setCorrections((m) => ({ ...m, [run.id]: { previous: run.result, value, reason } }));
    setSaved(`Saved the correction for run ${shortId(run.id)}.`);
  }

  const submit = () => (flagged(changed).length > 0 ? setConfirm(changed) : void save(changed));

  return (
    <div className="flex flex-col gap-3">
      <form
        id="record-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed.length > 0 && !saving && !readOnly) submit();
        }}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Run</TableHead>
              <TableHead numeric>Predicted</TableHead>
              <TableHead numeric>Measured{unit ? ` (${unit})` : ""}</TableHead>
              <TableHead>Against the band</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((r) => {
              const band = runBand(r, analysis);
              const outcome = bandOutcome(r, band);
              const text = drafts[r.id] ?? "";
              const invalid = text.trim() !== "" && parseEntry(text) == null;
              return (
                <TableRow key={r.id} id={`record-${r.id}`} className="scroll-mt-12">
                  <TableCell className="align-top font-mono text-code" title={r.id}>
                    {shortId(r.id)}
                  </TableCell>
                  <TableCell numeric className="align-top">
                    <PredictedValue value={formatNumber(r.pred)} hideLabel />
                    <span className="block text-caption text-fg-muted" title={band.why ? BAND_MISSING[band.why] : undefined}>
                      {band.halfWidth != null ? formatBand(band.halfWidth, band.coverage) : "band n/a"}
                    </span>
                  </TableCell>
                  <TableCell numeric className="h-auto align-top">
                    {r.awaiting ? (
                      <>
                        <Input
                          inputMode="decimal"
                          aria-label={`Measured result for run ${shortId(r.id)}`}
                          aria-invalid={invalid}
                          value={text}
                          placeholder="Awaiting"
                          disabled={saving || readOnly}
                          onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                          className="ml-auto h-8 w-28 text-right tabular-nums"
                        />
                        {invalid ? <span className="block text-caption text-bad">Enter a number</span> : null}
                      </>
                    ) : (
                      <RecordedValue run={r} session={corrections[r.id]} onCorrect={readOnly ? undefined : () => setCorrecting(r)} disabled={saving} />
                    )}
                  </TableCell>
                  <TableCell className="align-top text-body">
                    {outcome === "inside" ? (
                      <span className="text-fg">Inside the band</span>
                    ) : outcome === "outside" ? (
                      <span className="text-fg">
                        Outside the band{" "}
                        <span className="text-caption text-fg-muted tabular-nums">
                          ({formatNumber((r.result as number) - r.pred, "value", { sign: true })} from the prediction)
                        </span>
                      </span>
                    ) : (
                      <span className="text-fg-muted">{r.awaiting ? "Awaiting a result" : "n/a, no band"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-fg-muted" aria-live="polite">
          {error ? (
            <span role="alert" className="text-bad">
              {error}
            </span>
          ) : (
            (saved ?? (awaiting.length > 0 ? "Enter each value as it comes back from the lab; blank rows stay awaiting." : "Every run in this round has a result."))
          )}
        </p>
        {awaiting.length > 0 && !readOnly ? (
          <Button type="submit" form="record-form" disabled={changed.length === 0 || saving}>
            {saving ? "Saving..." : changed.length > 0 ? `Save ${formatNumber(changed.length, "count")} ${changed.length === 1 ? "result" : "results"}` : "Save results"}
          </Button>
        ) : null}
      </div>

      <CorrectResultDialog run={correcting} unit={unit} best={best} onClose={() => setCorrecting(null)} onSave={correct} />

      <Dialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check these values before saving</DialogTitle>
            <DialogDescription>These look unusual. Save them as entered, or go back and correct them.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-body text-fg">
            {flagged(confirm ?? []).map((r) => (
              <li key={r.id}>
                Run <span className="font-mono text-code">{shortId(r.id)}</span>: {formatNumber(r.value)} {unit} {sanityReason(r.value, best)}.
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Review values
            </Button>
            <Button onClick={() => confirm && void save(confirm)}>Save as entered</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A recorded result: the measured value, its version history as the engine reports it, and Correct. */
function RecordedValue({ run, session, onCorrect, disabled }: { run: CampaignRun; session?: SessionCorrection; onCorrect?: () => void; disabled: boolean }) {
  const h = resultHistory(run, session);
  const corrected = h.version != null && h.version > 1;
  const when = run.result_recorded_at ?? run.measured_at;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-2">
        <MeasuredValue value={formatNumber(run.result)} hideLabel className="text-heading" />
        {onCorrect ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCorrect} disabled={disabled} aria-label={`Correct the result for run ${shortId(run.id)}`}>
            Correct
          </Button>
        ) : null}
      </span>
      <span className="max-w-72 text-right text-caption whitespace-normal text-fg-muted">
        {h.version != null ? `Version ${formatNumber(h.version, "count")}` : "Recorded"}
        {h.source && h.previous != null ? `, was ${formatNumber(h.previous)}` : ""}
        {when != null ? `, ${formatTimestamp(when)}` : ""}
      </span>
      {h.reason ? (
        <span className="max-w-72 text-right text-caption whitespace-normal text-fg-muted">
          Reason: <span className="text-fg">{h.reason}</span>
        </span>
      ) : corrected && h.source == null ? (
        <span className="max-w-72 text-right text-caption whitespace-normal text-fg-muted">
          Corrected. The engine keeps the earlier value and the reason but does not return them here.
        </span>
      ) : null}
    </div>
  );
}
