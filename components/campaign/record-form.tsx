"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { BAND_SOURCE_LABEL, latestHistoryRows, resultHistory, type HistoryRow, type SessionCorrection } from "@/components/campaign/learn";
import { changedRows, parseEntry, sanityReason } from "@/components/campaign/stage-logic";
import { formatTimestamp } from "@/components/kit/source-line";
import { CorrectResultDialog } from "@/components/validate/correct-result-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/honest-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Num, NumState, SourceButton } from "@/components/viz/num";
import { useCampaign, useEngineWrites } from "@/hooks/use-engine";
import { getResultHistory, type CampaignRun } from "@/lib/api";
import { EngineError, errorMessage } from "@/lib/engine-error";
import { coverageText, formatValue } from "@/lib/num";
import { campaignHref } from "@/lib/routes";
import { sourceFromRun } from "@/lib/source";
import { fmtInterval, fmtResidual, toDumbbellData, type DumbbellAnalysis, type DumbbellRun } from "@/lib/viz-data/validation-dumbbells";
import { shortId } from "@/lib/workbench";
import { RunClone } from "@/components/campaign/run-clone";
import type { CloneKey } from "@/lib/viz-data/clones";

type Row = { id: string; value: number };

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

/** Where the full result history (every version, with reasons and who recorded it) lives. */
export const historyHref = (campaignId: string) => `${campaignHref(campaignId, "report")}#history`;

/**
 * The engine's result history rows for corrected runs (GET /results/history, newest first). The campaign summary
 * carries `result_version` but not the earlier value or the reason, so a corrected run's previous value and reason
 * come from here, paged until each corrected run is reached. Fetched only while some run is corrected, again whenever a
 * version changes.
 */
function useCorrectionRows(campaignId: string | undefined, runs: readonly CampaignRun[]): { rows: Map<string, HistoryRow> | null; failed: boolean } {
  const key = runs
    .filter((r) => (r.result_version ?? 0) > 1 && r.previous_result === undefined && !r.result_reason)
    .map((r) => `${r.id}:${r.result_version}`)
    .join(",");
  const [state, setState] = useState<{ key: string; rows: Map<string, HistoryRow> | null; failed: boolean }>({ key: "", rows: null, failed: false });
  useEffect(() => {
    if (!campaignId || !key) return;
    let cancelled = false;
    readCorrectionRows(campaignId, key).then(
      (rows) => {
        if (!cancelled) setState({ key, rows, failed: false });
      },
      () => {
        if (!cancelled) setState((s) => ({ ...s, key, failed: true }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [campaignId, key]);
  return { rows: state.rows, failed: state.key === key && state.failed };
}

/** History pages read at most for the corrections (500 rows each, newest first). */
const HISTORY_MAX_PAGES = 20;

/**
 * Pages GET /results/history (newest first, `next_before_id`) until every corrected run in `key` ("id:version,...")
 * has its row at that version, the engine has no older page, or HISTORY_MAX_PAGES. A run not reached keeps no
 * history row (its previous value then reads as not reported), never a guessed one.
 */
export async function readCorrectionRows(campaignId: string, key: string): Promise<Map<string, HistoryRow>> {
  const wanted = key
    .split(",")
    .filter(Boolean)
    .map((k) => ({ id: k.slice(0, k.lastIndexOf(":")), version: Number(k.slice(k.lastIndexOf(":") + 1)) }));
  const items: HistoryRow[] = [];
  let before: number | undefined;
  for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
    const h = await getResultHistory(campaignId, { section: "results", limit: 500, ...(before != null ? { resultsBeforeId: before } : {}) });
    items.push(...(h.results?.items ?? []));
    const rows = latestHistoryRows(items);
    if (wanted.every((w) => (rows.get(w.id)?.version ?? -1) >= w.version)) return rows;
    if (!h.results?.has_more || h.results.next_before_id == null) return rows;
    before = h.results.next_before_id;
  }
  return latestHistoryRows(items);
}

/**
 * Enter measured results, one input per awaiting run; recorded runs show the
 * measured value (filled ink, first) beside the prediction (hollow ring) and
 * its band, the signed residual (measured − predicted), whether it landed
 * inside the band the engine recorded when the run started (the engine's own
 * residual and inside/outside), and its version history (a correction's earlier
 * value and reason from the engine's result history). Saving writes
 * the entered rows one at a time, so a failure leaves the earlier rows saved
 * and every unsaved entry in place. An acknowledged result stays shown even
 * when the read after it fails; saving then waits for a successful refresh, so
 * nothing is written against a stale list (or twice). A recorded value is
 * corrected through a dialog that asks for the reason the engine requires
 * (results are append-only and versioned).
 */
export function RecordForm({
  campaignId,
  runs,
  analysis,
  best,
  target,
  unit,
  readOnly = false,
  onSavingChange,
  clone = null,
}: {
  /** For the engine's result history (corrections) and the link to the Report's history. */
  campaignId?: string;
  runs: CampaignRun[];
  analysis: DumbbellAnalysis | null;
  best: number | null;
  target: string;
  unit: string | null;
  /** Archived campaigns are read-only. */
  readOnly?: boolean;
  onSavingChange?: (saving: boolean) => void;
  /** The clone column and its chips (SV-G5), or null without one. */
  clone?: CloneKey | null;
}) {
  const { logResult } = useEngineWrites();
  const campaign = useCampaign();
  const savingRef = useRef(false);
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
  // The campaign list is stale (a read after a write failed) or being re-read: no writes until it is current.
  const blocked = saving || campaign.error || campaign.refreshing;
  const awaiting = runs.filter((r) => r.awaiting);
  const ordered = [...awaiting, ...runs.filter((r) => !r.awaiting)];
  const changed = changedRows(awaiting, drafts);
  const flagged = (rows: Row[]) => rows.filter((r) => sanityReason(r.value, best) != null);
  // The same per-run band, residual and shared column decimals as the chart (one source of arithmetic).
  const d = toDumbbellData(runs, analysis);
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  const cov = coverageText(d.coverage);
  const measuredText = (v: number | null) => formatValue(v, { basis: "measured", unit, uncertainty: d.measuredU }).text;
  const history = useCorrectionRows(campaignId, runs);
  const anyCorrected = runs.some((r) => (r.result_version ?? 0) > 1);

  async function save(rows: Row[]) {
    // A second submit before React re-renders (double click, Enter twice) must not write the rows again.
    if (savingRef.current || campaign.error || campaign.refreshing) return;
    savingRef.current = true;
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
        // reason_required here means the run was recorded elsewhere (another tab or user) since this list was read;
        // the hook has re-read the campaign, so the run now shows its recorded value and Correct opens with this entry.
        const why =
          e instanceof EngineError && e.code === "reason_required"
            ? "it already has a recorded result (saved elsewhere since this page loaded). That value is shown now; to replace it, use Correct and give a reason."
            : errorMessage(e).message;
        const before = done > 0 ? ` The ${done === 1 ? "result" : `${count(done)} results`} before it ${done === 1 ? "was" : "were"} saved.` : "";
        setError(`Run ${shortId(id)} was not saved: ${why}${before} Your unsaved entries are kept.`);
        break;
      }
    }
    if (done === rows.length) setSaved(`Saved ${count(done)} ${done === 1 ? "result" : "results"}.`);
    savingRef.current = false;
    setSaving(false);
  }

  async function correct(run: CampaignRun, value: number, reason: string) {
    setSaved(null);
    await logResult(run.id, value, reason);
    setCorrections((m) => ({ ...m, [run.id]: { previous: run.result, value, reason } }));
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== run.id)));
    setError(null);
    setSaved(`Saved the correction for run ${shortId(run.id)}.`);
  }

  const submit = () => (flagged(changed).length > 0 ? setConfirm(changed) : void save(changed));

  return (
    <div className="flex flex-col gap-3">
      {campaign.error && campaign.data ? (
        <ErrorState
          title="Results need a refresh"
          description="The latest results could not be read after the last change. Saved results are shown below and your unsaved entries are kept. Refresh before saving more."
          onRetry={() => void campaign.refresh()}
          retryLabel="Refresh results"
          busy={campaign.refreshing || saving}
        />
      ) : null}
      <form
        id="record-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed.length > 0 && !blocked && !readOnly) submit();
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
                    <RunClone run={r} clone={clone} />
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
                        historyRow={history.rows?.get(r.id) ?? null}
                        onCorrect={readOnly ? undefined : () => setCorrecting(r)}
                        disabled={blocked}
                      />
                    )}
                  </TableCell>
                  <TableCell numeric className="align-top">
                    {row && row.pred != null ? (
                      <Num value={row.pred} basis="predicted" options={{ decimals: d.decimals.pred }} />
                    ) : (
                      <span className="text-caption text-fg-muted" title={row?.bandReason ?? undefined}>
                        No engine prediction
                      </span>
                    )}
                  </TableCell>
                  {d.bandAvailable ? (
                    <TableCell numeric className="align-top text-caption text-fg-muted" title={row?.bandReason ?? (row?.bandSource ? BAND_SOURCE_LABEL[row.bandSource] : undefined)}>
                      {row && row.interval ? fmtInterval(d, row) : row?.pred == null ? "n/a" : "band n/a"}
                      {row?.bandSource === "current-analysis" ? <span className="block">current analysis</span> : null}
                    </TableCell>
                  ) : null}
                  {row && !row.awaiting ? (
                    <>
                      <TableCell numeric className="align-top">
                        {row.residual != null ? <span className="text-fg">{fmtResidual(d, row, null).text}</span> : <span className="text-fg-muted">n/a</span>}
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
          {anyCorrected && campaignId ? (
            <span className="mr-2">
              Corrections keep every version.{" "}
              <Link href={historyHref(campaignId)} className="text-accent hover:underline">
                Full result history in the Report
              </Link>
              {history.failed ? " (the history could not be loaded here)" : ""}.
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="text-bad">
              {error}
            </span>
          ) : (
            (saved ?? (awaiting.length > 0 ? "Enter each value as it comes back from the lab; blank rows stay awaiting." : "Every run in this round has a result."))
          )}
        </p>
        {awaiting.length > 0 && !readOnly ? (
          <Button type="submit" form="record-form" disabled={changed.length === 0 || blocked}>
            {saving ? "Saving..." : changed.length > 0 ? `Save ${count(changed.length)} ${changed.length === 1 ? "result" : "results"}` : "Save results"}
          </Button>
        ) : null}
      </div>

      <CorrectResultDialog
        run={correcting}
        unit={unit}
        best={best}
        interval={correcting ? (byId.get(correcting.id)?.interval ?? null) : null}
        pred={correcting ? (byId.get(correcting.id)?.pred ?? null) : null}
        decimals={d.decimals}
        measuredU={d.measuredU}
        initialValue={correcting ? drafts[correcting.id] : undefined}
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
            <Button disabled={blocked} onClick={() => confirm && void save(confirm)}>
              Save as entered
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Inside / outside / no band, as a word with an icon (never color alone); a legacy run says whose band it was. */
function BandCheck({ row }: { row: DumbbellRun }) {
  if (row.pred == null)
    return (
      <span className="text-fg-muted" title={row.bandReason ?? undefined}>
        No engine prediction
      </span>
    );
  if (row.inside == null)
    return (
      <span className="text-fg-muted" title={row.bandReason ?? undefined}>
        band n/a
      </span>
    );
  const legacy = row.bandSource === "current-analysis" ? <span className="block text-caption text-fg-muted">current analysis&apos; band</span> : null;
  if (row.inside)
    return (
      <span className="text-fg">
        Inside the band
        {legacy}
      </span>
    );
  return (
    <span className="text-fg">
      <span className="inline-flex items-center gap-1.5">
        <CircleAlert className="size-4 shrink-0 text-warn" aria-hidden />
        Outside the band
      </span>
      {legacy}
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
  historyRow,
  onCorrect,
  disabled,
}: {
  run: CampaignRun;
  target: string;
  decimals: number;
  format: (v: number | null) => string;
  session?: SessionCorrection;
  historyRow?: HistoryRow | null;
  onCorrect?: () => void;
  disabled: boolean;
}) {
  const h = resultHistory(run, session, historyRow);
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
        {h.version != null ? `Version ${count(h.version)}${corrected ? " (corrected)" : ""}` : "Recorded"}
        {h.source && h.previous != null ? `, was ${format(h.previous)}` : ""}
        {when != null ? `, ${formatTimestamp(when)}` : ""}
      </span>
      {h.reason ? (
        <span className="max-w-72 text-right text-caption whitespace-normal text-fg-muted">
          Reason: <span className="text-fg">{h.reason}</span>
        </span>
      ) : corrected && h.source == null ? (
        <span className="max-w-72 text-right text-caption whitespace-normal text-fg-muted">
          Corrected. The earlier value and the reason are in the Report&apos;s result history.
        </span>
      ) : null}
    </div>
  );
}
