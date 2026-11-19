"use client";

import { Loader2, PencilLine } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { formatTimestamp } from "@/components/kit/source-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BasisGlyph } from "@/components/viz/num";
import type { AuditItem, ResultHistoryItem } from "@/lib/api";
import { columnDecimals, formatValue } from "@/lib/num";
import { auditActionWords, auditOutcomeWords } from "@/components/report/report-copy";
import type { HistorySection, HistoryState } from "@/components/report/report-data";

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

/**
 * The append-only record of this campaign, from GET /results/history: every
 * recorded result version (corrections marked, with the previous value and
 * the reason given) and the audit log (who did what, and whether it went
 * through). Both newest first, each with its own "Load older". Anchor
 * `#history`, so other pages can link here.
 */
export function HistorySectionView({
  state,
  unit,
  onRetry,
  onLoadOlder,
}: {
  state: HistoryState;
  unit: string | null;
  onRetry: () => void;
  onLoadOlder: (which: "results" | "audit") => void;
}) {
  return (
    <Section
      id="history"
      className="min-w-0 scroll-mt-8"
      title="Result history and audit log"
      description="Every recorded result version and every change to this campaign, newest first, as the engine stores them. Nothing here can be edited or deleted."
    >
      {state.status === "loading" ? (
        <LoadingSkeleton rows={4} label="Loading the result history" />
      ) : state.status === "unavailable" ? (
        <ErrorState title="Could not load the result history" description={`${state.reason} The history is unaffected; only this view could not load it.`} onRetry={onRetry} />
      ) : (
        <div className="flex min-w-0 flex-col gap-8">
          <ResultsBlock s={state.results} unit={unit} note={state.notes.results} onLoadOlder={() => onLoadOlder("results")} />
          <AuditBlock s={state.audit} note={state.notes.audit} onLoadOlder={() => onLoadOlder("audit")} />
        </div>
      )}
    </Section>
  );
}

function EngineNote({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="text-caption text-fg-muted">
      Engine note: <span className="text-fg">{text}</span>
    </p>
  );
}

function LoadOlder({ s, label, onClick }: { s: HistorySection<unknown>; label: string; onClick: () => void }) {
  if (!s.hasMore && !s.moreError) return <p className="text-caption text-fg-muted">Start of the {label} reached.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {s.hasMore ? (
        <Button variant="outline" size="sm" onClick={onClick} disabled={s.loadingMore}>
          {s.loadingMore ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Load older
        </Button>
      ) : null}
      {s.moreError ? (
        <p role="alert" className="text-caption text-fg">
          {s.moreError}
        </p>
      ) : null}
    </div>
  );
}

function ResultsBlock({ s, unit, note, onLoadOlder }: { s: HistorySection<ResultHistoryItem>; unit: string | null; note?: string; onLoadOlder: () => void }) {
  const corrections = s.items.filter((r) => r.is_correction).length;
  const dec = columnDecimals(s.items.flatMap((r) => [r.value, r.previous_value]).filter((v): v is number => v != null && Number.isFinite(v)).map((value) => ({ value, u: null })));
  const u = unit ? ` (${unit})` : "";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-label text-fg">Recorded results</h3>
        <p className="text-caption text-fg-muted">
          {s.items.length
            ? `${count(s.items.length)} ${s.items.length === 1 ? "version" : "versions"} shown, ${count(corrections)} ${corrections === 1 ? "correction" : "corrections"}.`
            : "No result has been recorded for this campaign yet."}
        </p>
      </div>
      {s.items.length ? (
        <Table containerClassName="max-h-[480px] rounded-xl border border-border print:max-h-none print:overflow-visible">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface">Recorded</TableHead>
              <TableHead className="bg-surface">Run</TableHead>
              <TableHead className="bg-surface" numeric>
                Version
              </TableHead>
              <TableHead className="bg-surface" numeric>
                <span className="inline-flex items-center gap-1.5">
                  <BasisGlyph basis="measured" /> Measured{u}
                </span>
              </TableHead>
              <TableHead className="bg-surface" numeric>
                Previous value{u}
              </TableHead>
              <TableHead className="bg-surface">Reason</TableHead>
              <TableHead className="bg-surface">Recorded by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-fg-muted tabular-nums">{formatTimestamp(r.recorded_at)}</TableCell>
                <TableCell className="font-mono text-code text-fg-muted" title={r.run_id}>
                  {r.run_id.slice(0, 8)}
                </TableCell>
                <TableCell numeric>
                  <span className="inline-flex items-center justify-end gap-2">
                    {r.is_correction ? (
                      <Badge tone="neutral" variant="outline">
                        <PencilLine aria-hidden />
                        Correction
                      </Badge>
                    ) : null}
                    v{count(r.version)}
                  </span>
                </TableCell>
                <TableCell numeric className="font-semibold text-fg">
                  {formatValue(r.value, { decimals: dec, basis: "measured", unit }).value}
                </TableCell>
                <TableCell numeric className="text-fg-muted">
                  {r.previous_value != null ? formatValue(r.previous_value, { decimals: dec, basis: "measured", unit }).value : <span title="first recorded value">n/a</span>}
                </TableCell>
                <TableCell className="max-w-[28ch] whitespace-normal">{r.reason ?? <span className="text-fg-muted">{r.is_correction ? "n/a" : "first value"}</span>}</TableCell>
                <TableCell className="text-fg-muted">{r.actor ?? "n/a"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <LoadOlder s={s} label="recorded results" onClick={onLoadOlder} />
      <EngineNote text={note} />
    </div>
  );
}

function AuditBlock({ s, note, onLoadOlder }: { s: HistorySection<AuditItem>; note?: string; onLoadOlder: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-label text-fg">Audit log</h3>
        <p className="text-caption text-fg-muted">
          {s.items.length ? `${count(s.items.length)} ${s.items.length === 1 ? "entry" : "entries"} shown.` : "The engine has no audit entries for this campaign."}
        </p>
      </div>
      {s.items.length ? (
        <Table containerClassName="max-h-[480px] rounded-xl border border-border print:max-h-none print:overflow-visible">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface">Time</TableHead>
              <TableHead className="bg-surface">Who</TableHead>
              <TableHead className="bg-surface">Action</TableHead>
              <TableHead className="bg-surface">Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap text-fg-muted tabular-nums">{formatTimestamp(a.ts)}</TableCell>
                <TableCell className="text-fg-muted">{a.subject ?? "n/a"}</TableCell>
                <TableCell className="whitespace-normal">
                  {auditActionWords(a.action)} <code className="font-mono text-code text-fg-muted">{a.action}</code>
                </TableCell>
                <TableCell className="whitespace-normal">{auditOutcomeWords(a.outcome)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <LoadOlder s={s} label="audit log" onClick={onLoadOlder} />
      <EngineNote text={note} />
      {s.items.length ? (
        <Disclosure summary="Raw audit rows, as the engine stores them">
          <pre className="max-h-80 overflow-auto rounded-lg bg-subtle p-3 font-mono text-caption break-all whitespace-pre-wrap text-fg">{JSON.stringify(s.items, null, 2)}</pre>
        </Disclosure>
      ) : null}
    </div>
  );
}
