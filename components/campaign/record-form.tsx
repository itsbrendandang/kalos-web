"use client";

import { useState } from "react";
import Link from "next/link";
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
import { shortId } from "@/lib/workbench";
import { changedRows, inlineRecipeKeys, parseEntry, sanityReason } from "@/components/campaign/stage-logic";

type Row = { id: string; value: number };

/**
 * One input per run, awaiting ones first. A logged value stays editable (the
 * engine overwrites on re-log until the next re-analysis). Saving writes only
 * changed rows, one at a time, so a failure leaves the earlier rows saved.
 */
export function RecordForm({
  runs,
  round,
  best,
  unit,
  drivers,
}: {
  runs: CampaignRun[];
  round: number;
  best: number | null;
  unit: string;
  drivers: readonly string[];
}) {
  const { logResult } = useEngineWrites();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Row[] | null>(null);

  const ordered = [...runs].sort((a, b) => Number(b.awaiting) - Number(a.awaiting));
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
        setError(`Run ${shortId(id)} could not be saved: ${e instanceof Error ? e.message : "the engine did not respond"}. Earlier rows were saved.`);
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
        description="Enter each measured value as it comes back. You can correct a saved value until the model is updated."
        action={
          <>
            {logged > 0 ? (
              <Link href="/campaign/learn" className={buttonVariants({ variant: "outline" })}>
                Learn from round {displayRound(round)}
              </Link>
            ) : null}
            <Button type="submit" form="record-form" disabled={changed.length === 0 || saving}>
              {saving ? "Saving..." : changed.length > 0 ? `Save ${formatNumber(changed.length, "count")} ${changed.length === 1 ? "result" : "results"}` : "Save results"}
            </Button>
          </>
        }
      />
      {error ? <Callout tone="bad" title="Not everything was saved">{error}</Callout> : null}
      <form
        id="record-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed.length > 0 && !saving) submit();
        }}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Run</TableHead>
              <TableHead>Recipe</TableHead>
              <TableHead numeric>Measured result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((r) => {
              const text = shownValue(r);
              const invalid = text.trim() !== "" && parseEntry(text) == null;
              return (
                <TableRow key={r.id} id={`record-${r.id}`} className="scroll-mt-12">
                  <TableCell className="font-mono text-code">{shortId(r.id)}</TableCell>
                  <TableCell>
                    {inlineRecipeKeys(r.recipe, drivers).map((k) => (
                      <span key={k} className="mr-3 text-fg-muted">
                        {k} <span className="text-fg tabular-nums">{formatNumber(r.recipe[k])}</span>
                      </span>
                    ))}
                  </TableCell>
                  <TableCell numeric>
                    <span className="inline-flex items-center justify-end gap-2">
                      {r.awaiting ? null : <span className="text-caption text-fg-muted">Saved</span>}
                      <Input
                        inputMode="decimal"
                        aria-label={`Measured result for run ${shortId(r.id)}`}
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
      </form>

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
