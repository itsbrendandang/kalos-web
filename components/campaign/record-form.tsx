"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { BAND_MISSING, resultHistory, type SessionCorrection } from "@/components/campaign/learn";
import { changedRows, parseEntry, sanityReason } from "@/components/campaign/stage-logic";
import { formatTimestamp } from "@/components/kit/source-line";
import { CorrectResultDialog } from "@/components/validate/correct-result-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Num, NumState, SourceButton } from "@/components/viz/num";
import { useEngineWrites } from "@/hooks/use-engine";
import type { CampaignRun } from "@/lib/api";
import { errorMessage } from "@/lib/engine-error";
import { coverageText, formatValue } from "@/lib/num";
import { sourceFromRun } from "@/lib/source";
import { fmtInterval, fmtResidual, toDumbbellData, type DumbbellAnalysis, type DumbbellRun } from "@/lib/viz-data/validation-dumbbells";
import { shortId } from "@/lib/workbench";

type Row = { id: string; value: number };

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

/**
 * Enter measured results, one input per awaiting run; recorded runs show the
 * measured value (filled ink, first) beside the prediction (hollow ring) and
 * its band, the signed residual (measured − predicted), whether it landed
 * inside the band, and its version history. Saving writes
 * the entered rows one at a time, so a failure leaves the earlier rows saved.
 * A recorded value is corrected through a dialog that asks for the reason the
 * engine requires (results are append-only and versioned).
 */
export function RecordForm({
  runs,
  analysis,
  best,
  target,
  unit,
  readOnly = false,
  onSavingChange,
}: {
  runs: CampaignRun[];
  analysis: DumbbellAnalysis | null;
  best: number | null;
  target: string;
  unit: string | null;
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
  // The same per-run band, residual and shared column decimals as the chart (one source of arithmetic).
  const d = toDumbbellData(runs, analysis);
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  const cov = coverageText(d.coverage);
  const measuredText = (v: number | null) => formatValue(v, { basis: "measured", unit, uncertainty: d.measuredU }).text;

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
    if (done === rows.length) setSaved(`Saved ${count(done)} ${done === 1 ? "result" : "results"}.`);
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
              <TableHead numeric>Measured{unit ? ` (${unit})` : ""}</TableHead>
              <TableHead numeric>Predicted{unit ? ` (${unit})` : ""}</TableHead>
              {d.bandAvailable ? <TableHead numeric>{cov ? `${cov} band` : "Band"}</TableHead> : null}
              <TableHead numeric>Measured − predicted</TableHead>
              <TableHead>Against the band</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((r) => {
              const row = byId.get(r.id);
              const text = drafts[r.id] ?? "";
              const invalid = text.trim() !== "" && parseEntry(text) == null;
              return (
                <TableRow key={r.id} id={`record-${r.id}`} className="scroll-mt-12">
                  <TableCell className="align-top font-mono text-code" title={r.id}>
                    {shortId(r.id)}
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
                          onChange={(e) => setDrafts((dr) => ({ ...dr, [r.id]: e.target.value }))}
                          className="ml-auto h-8 w-28 text-right tabular-nums"
                        />
                        {invalid ? <span className="block text-caption text-bad">Enter a number</span> : null}
                      </>
                    ) : (
                      <RecordedValue
                        run={r}
                        target={target}
                        decimals={d.decimals.measured}
                        format={measuredText}
                        session={corrections[r.id]}
                        onCorrect={readOnly ? undefined : () => setCorrecting(r)}
                        disabled={saving}
                      />
                    )}
                  </TableCell>
                  <TableCell numeric className="align-top">
                    <Num value={r.pred} basis="predicted" options={{ decimals: d.decimals.pred }} />
                  </TableCell>
                  {d.bandAvailable ? (
                    <TableCell numeric className="align-top text-caption text-fg-muted" title={row?.bandWhy ? BAND_MISSING[row.bandWhy] : undefined}>
                      {row && row.interval ? fmtInterval(d, row) : "band n/a"}
                    </TableCell>
                  ) : null}
                  {row && !row.awaiting ? (
                    <>
                      <TableCell numeric className="align-top">
                        <span className="text-fg">{fmtResidual(d, row, null).text}</span>
                      </TableCell>
                      <TableCell className="align-top text-body">
                        <BandCheck row={row} />
                      </TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={2} className="align-top text-body">
                      <NumState state={{ kind: "pending" }} />
                    </TableCell>
                  )}
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
            {saving ? "Saving..." : changed.length > 0 ? `Save ${count(changed.length)} ${changed.length === 1 ? "result" : "results"}` : "Save results"}
          </Button>
        ) : null}
      </div>

      <CorrectResultDialog
        run={correcting}
        unit={unit}
        best={best}
        interval={correcting ? (byId.get(correcting.id)?.interval ?? null) : null}
        decimals={d.decimals}
        measuredU={d.measuredU}
        onClose={() => setCorrecting(null)}
        onSave={correct}
      />

      <Dialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check these values before saving</DialogTitle>
            <DialogDescription>These look unusual. Save them as entered, or go back and correct them.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-body text-fg">
            {flagged(confirm ?? []).map((r) => (
              <li key={r.id}>
                Run <span className="font-mono text-code">{shortId(r.id)}</span>: <span className="tabular-nums">{measuredText(r.value)}</span> {sanityReason(r.value, best)}.
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

/** Inside / outside / no band, as a word with an icon (never color alone). */
function BandCheck({ row }: { row: DumbbellRun }) {
  if (row.inside == null) return <span className="text-fg-muted" title={row.bandWhy ? BAND_MISSING[row.bandWhy] : undefined}>band n/a</span>;
  if (row.inside) return <span className="text-fg">Inside the band</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-fg">
      <CircleAlert className="size-4 shrink-0 text-warn" aria-hidden />
      Outside the band
    </span>
  );
}

/** A recorded result: the measured value (with its source), its version history as the engine reports it, and Correct. */
function RecordedValue({
  run,
  target,
  decimals,
  format,
  session,
  onCorrect,
  disabled,
}: {
  run: CampaignRun;
  target: string;
  decimals: number;
  format: (v: number | null) => string;
  session?: SessionCorrection;
  onCorrect?: () => void;
  disabled: boolean;
}) {
  const h = resultHistory(run, session);
  const corrected = h.version != null && h.version > 1;
  const when = run.result_recorded_at ?? run.measured_at;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-1">
        <Num value={run.result} basis="measured" options={{ decimals }} />
        <SourceButton source={sourceFromRun({ target }, run, "measured")} full={String(run.result)} />
        {onCorrect ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCorrect} disabled={disabled} aria-label={`Correct the result for run ${shortId(run.id)}`}>
            Correct
          </Button>
        ) : null}
      </span>
      <span className="max-w-72 text-right text-caption whitespace-normal text-fg-muted tabular-nums">
        {h.version != null ? `Version ${count(h.version)}` : "Recorded"}
        {h.source && h.previous != null ? `, was ${format(h.previous)}` : ""}
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
