"use client";

import { currentSheetOnly, leftOutNote, roundRows, scoringRules, trackPoints, trackVerdict, judgeReason } from "@/components/campaign/track-record-data";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTrackRecord, useTrackRuns } from "@/hooks/use-assist";
import { errorMessage } from "@/lib/engine-error";
import { coverageText, formatValue } from "@/lib/num";

const count = (n: number) => formatValue(n, { quantity: "count" }).text;
const TITLE = "Track record";
const DESCRIPTION = "Every round so far: how the predictions the engine recorded when each run started held up once the run was measured.";

/**
 * The engine's prospective track record (GET /track-record, /track-record/runs):
 * the pooled verdict (never "calibrated" unless the engine judged it), one row
 * per round, and the engine's scoring rules. The runs of the round in the lab
 * are drawn against their recorded bands under Learn and re-propose; this is
 * the record across rounds. Hidden on engines without the route.
 */
export function TrackRecordSection({ campaignId, unit }: { campaignId: string; unit: string | null }) {
  const record = useTrackRecord(campaignId);
  const runs = useTrackRuns(campaignId);

  if (record.unsupported) return null;
  if (record.status === "loading") {
    return (
      <Section id="track-record" title={TITLE} description={DESCRIPTION} className="scroll-mt-6">
        <LoadingSkeleton variant="table" rows={3} label="Loading the track record" />
      </Section>
    );
  }
  if (record.status === "error" || !record.data) {
    return (
      <Section id="track-record" title={TITLE} description={DESCRIPTION} className="scroll-mt-6">
        <ErrorState
          title="Could not load the track record"
          description={`${errorMessage(record.failure).message} This is a problem with the request, not a finding about your results.`}
          onRetry={() => void record.refresh()}
          busy={record.refreshing}
        />
      </Section>
    );
  }

  const tr = record.data;
  // The runs only add the note on what is left out; without them the verdict and table still stand.
  const runItems = runs.status === "data" && runs.data ? runs.data.items : [];
  const sheet = currentSheetOnly(tr, runItems);
  const rows = roundRows(sheet);
  const rules = scoringRules(tr);
  const note = runs.status === "data" && runs.data ? leftOutNote(trackPoints(sheet.items), runs.data.has_more, sheet.leftOut) : sheet.leftOut ? "Rounds from earlier run sheets are left out." : null;
  const level = coverageText(tr.coverage);
  const scoredRounds = rows.filter((r) => r.scored > 0);
  // With one scored round and no engine judgement, the k-of-n sentence would repeat what Learn and re-propose says about the round.
  const single = scoredRounds.length === 1 && sheet.coverage.judged !== true;
  const verdict = single
    ? [`Only round ${count(scoredRounds[0].round)} has results scored against a prediction recorded at start so far.`, judgeReason(sheet.coverage.reason)].filter(Boolean).join(" ")
    : trackVerdict(sheet.coverage);
  const unrecorded = tr.rounds_without_record?.count ?? 0;

  return (
    <Section id="track-record" title={TITLE} description={DESCRIPTION} className="scroll-mt-6">
      {!tr.has_campaign || rows.length === 0 ? (
        <p className="text-body text-fg-muted">No run has a prediction recorded at start yet, so there is nothing to score.</p>
      ) : (
        <>
          <p className="max-w-[68ch] text-body text-fg">{verdict}</p>
          {record.error ? (
            <p className="flex flex-wrap items-center gap-2 text-caption text-fg-muted">
              Could not refresh the track record; this is the last one loaded.
              <Button variant="link" size="sm" onClick={() => void record.refresh()} disabled={record.refreshing}>
                {record.refreshing ? "Trying again..." : "Try again"}
              </Button>
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Table aria-label="Track record by round" containerClassName="rounded-xl border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead numeric>Started</TableHead>
                  <TableHead numeric>Measured</TableHead>
                  <TableHead numeric>{level ? `Inside ${level} range` : "Inside range"}</TableHead>
                  <TableHead numeric>Mean error{unit ? ` (${unit})` : ""}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.round}-${i}`}>
                    <TableCell className="tabular-nums">Round {count(r.round)}</TableCell>
                    <TableCell numeric>{count(r.started)}</TableCell>
                    <TableCell numeric>
                      {count(r.measured)}
                      {r.corrected ? <span className="text-fg-muted"> ({count(r.corrected)} corrected)</span> : null}
                    </TableCell>
                    <TableCell numeric>{r.scored ? `${count(r.inside)} of ${count(r.scored)}` : <span className="text-fg-muted">None scored</span>}</TableCell>
                    <TableCell numeric>{r.meanError == null ? <span className="text-fg-muted">n/a</span> : formatValue(r.meanError, { sign: true }).text}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-caption text-fg-muted">
              Mean error is measured minus the prediction recorded at start{unit ? `, in ${unit}` : ""}: above zero means results came in higher than predicted. It is a
              direction, not a verdict on its own.
            </p>
            {note ? <p className="text-caption text-fg-muted">{note}</p> : null}
            {unrecorded > 0 ? (
              <p className="text-caption text-fg-muted">
                {count(unrecorded)} earlier {unrecorded === 1 ? "round of this sheet was" : "rounds of this sheet were"} folded before the engine kept predictions at start, so{" "}
                {unrecorded === 1 ? "it is" : "they are"} not in this record.
              </p>
            ) : null}
          </div>
        </>
      )}
      <Disclosure summary="How this is scored">
        <div className="flex max-w-[68ch] flex-col gap-3 text-body text-fg-muted">
          <p>
            When a run is started, the engine records its prediction and the {level ? `${level} ` : ""}range around it. Once a result is recorded, it is compared with that recorded
            prediction, never with a later analysis. A run counts only when its prediction was recorded before its first result.
          </p>
          {rules.length ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
              {rules.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-label text-fg">{r.label}</dt>
                  <dd className="mb-1 sm:mb-0">{r.text}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </Disclosure>
    </Section>
  );
}
