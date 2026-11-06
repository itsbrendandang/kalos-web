"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEngineWrites } from "@/hooks/use-engine";
import type { CampaignRun } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { WhyLine } from "@/components/kit/why-line";
import { changedRows, parseEntry, sanityReason } from "@/components/campaign/stage-logic";

type Row = { id: string; value: number };

/**
 * One input per run, in the order the runs were started (the same P1..Pn as on
 * Plan and Run, with every input as a column in the same order), so a saved row
 * never jumps. A logged value stays editable (the engine overwrites on re-log
 * until the next re-analysis). Saving writes only changed rows, one at a time,
 * so a failure leaves the earlier rows saved.
 */
export function RecordForm({
  runs,
  round,
  best,
  unit,
  columns,
  labels,
  target,
}: {
  runs: CampaignRun[];
  round: number;
  best: number | null;
  unit: string;
  /** The recipe columns, in order (recipeColumns). */
  columns: readonly string[];
  /** The P1..Pn label of each run by id (runLabels). */
  labels: ReadonlyMap<string, string>;
  /** The target's name, so the result column says what is measured. */
  target: string;
}) {
  const { logResult } = useEngineWrites();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Row[] | null>(null);

  const label = (id: string) => labels.get(id) ?? id;
  const changed = changedRows(runs, drafts);
  const logged = runs.filter((r) => !r.awaiting).length;
  const shownValue = (r: CampaignRun) => drafts[r.id] ?? (r.result == null ? "" : String(r.result));
  const flagged = (rows: Row[]) => rows.filter((r) => sanityReason(r.value, best) != null);

  async function save(rows: Row[]) {
    setConfirm(null);
    setSaving(true);
    setError(null);
    for (const { id, value } of rows) {
      try {
        await logResult(id, value);
        setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
      } catch (e) {
        setError(`${label(id)} could not be saved: ${e instanceof Error ? e.message : "Kalos did not answer"}. Earlier runs were saved.`);
        break;
      }
    }
    setSaving(false);
  }

  const submit = () => (flagged(changed).length > 0 ? setConfirm(changed) : void save(changed));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Round ${displayRound(round)}`}
        title="Record results"
        description="Enter each measured value as it comes back. Saving again replaces the value shown; the campaign keeps only the latest one. Results go into the model when you Learn from their round, and after that they cannot be changed here."
        action={
          <Button type="submit" form="record-form" disabled={changed.length === 0 || saving}>
            {saving ? "Saving..." : changed.length > 0 ? `Save ${formatNumber(changed.length, "count")} ${changed.length === 1 ? "result" : "results"}` : "Save results"}
          </Button>
        }
      />
      {error ? (
        <Callout tone="bad" title="Not everything was saved">
          <p>{error}</p>
          <WhyLine code="record_partial_save" />
        </Callout>
      ) : null}
      <form
        id="record-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed.length > 0 && !saving) submit();
        }}
      >
        <div data-scroll-x className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Recipe</TableHead>
              {columns.map((c) => (
                <TableHead key={c} numeric className="hidden font-mono text-code whitespace-nowrap sm:table-cell">
                  {c}
                </TableHead>
              ))}
              <TableHead numeric>Measured {target}{unit ? ` (${unit})` : ""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => {
              const text = shownValue(r);
              const invalid = text.trim() !== "" && parseEntry(text) == null;
              return (
                <TableRow key={r.id} id={`record-${r.id}`} className="scroll-mt-12">
                  <TableCell className="font-mono text-code text-fg">{label(r.id)}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c} numeric className="hidden tabular-nums whitespace-nowrap sm:table-cell">
                      {c in r.recipe ? formatNumber(r.recipe[c]) : <span className="text-fg-muted">n/a</span>}
                    </TableCell>
                  ))}
                  <TableCell numeric>
                    <span className="inline-flex items-center justify-end gap-2">
                      {r.awaiting ? null : (
                        <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
                          <Check className="size-3.5 text-good" aria-hidden />
                          Saved
                        </span>
                      )}
                      <Input
                        inputMode="decimal"
                        aria-label={`Measured ${target} for ${label(r.id)}`}
                        aria-invalid={invalid}
                        value={text}
                        disabled={saving}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                        className="h-8 w-28 text-right tabular-nums"
                      />
                      {unit ? <span className="w-12 text-left text-body text-fg-muted">{unit}</span> : null}
                    </span>
                    {invalid ? <span className="block text-caption text-bad">Enter a number</span> : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </form>
      {logged > 0 ? (
        <Link href="/campaign/learn" className={buttonVariants({ variant: "outline", className: "self-start" })}>
          See what round {displayRound(round)} taught the model
        </Link>
      ) : null}

      <Dialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check these values before saving</DialogTitle>
            <DialogDescription>These look unusual. Save them as entered, or go back and correct them.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-body text-fg">
            {flagged(confirm ?? []).map((r) => (
              <li key={r.id}>
                <span className="font-mono text-code">{label(r.id)}</span>: {formatNumber(r.value)} {unit} {sanityReason(r.value, best)}.
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Go back and check
            </Button>
            <Button onClick={() => confirm && void save(confirm)}>Save these results</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
