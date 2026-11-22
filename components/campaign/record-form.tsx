"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEngineWrites } from "@/hooks/use-engine";
import { MAX_RESULT_REASON, type CampaignRun } from "@/lib/api";
import { describeEngineError, EngineError } from "@/lib/engine-error";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber, formatSetpoint } from "@/lib/format";
import { shortId } from "@/lib/workbench";
import { changedRows, inlineRecipeKeys, parseEntry, sanityReason } from "@/components/campaign/stage-logic";

type Row = { id: string; value: number };

/** A run that already has a recorded value: a new value is a correction and needs a reason. */
export function isCorrection(run: Pick<CampaignRun, "awaiting" | "result">): boolean {
  return !run.awaiting && run.result != null;
}

/** Why a correction reason cannot be sent yet, or null when it can. */
export function reasonProblem(reason: string | undefined): string | null {
  const text = (reason ?? "").trim();
  if (text === "") return "Say briefly why this saved value is being changed.";
  if (text.length > MAX_RESULT_REASON) return `Keep the reason to ${MAX_RESULT_REASON} characters.`;
  return null;
}

/** The changed rows that need a reason before saving: corrections, plus runs the engine said need one. */
export function rowsNeedingReason(rows: readonly Row[], runs: readonly CampaignRun[], engineAsked: ReadonlySet<string>): string[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  return rows.filter((r) => engineAsked.has(r.id) || (byId.has(r.id) && isCorrection(byId.get(r.id)!))).map((r) => r.id);
}

/**
 * One input per run, awaiting ones first. A logged value stays editable until
 * the next re-analysis; changing it is a correction, which the engine keeps as a
 * new version and which needs a short reason. Saving writes only changed rows,
 * one at a time, so a failure leaves the earlier rows saved.
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
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // Runs the engine refused with `reason_required` (recorded elsewhere since this page loaded).
  const [engineAsked, setEngineAsked] = useState<ReadonlySet<string>>(() => new Set());
  // Show the "say why" messages only after a save was attempted.
  const [checkReasons, setCheckReasons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Row[] | null>(null);

  const ordered = [...runs].sort((a, b) => Number(b.awaiting) - Number(a.awaiting));
  const changed = changedRows(runs, drafts);
  const logged = runs.filter((r) => !r.awaiting).length;
  const shownValue = (r: CampaignRun) => drafts[r.id] ?? (r.result == null ? "" : String(r.result));
  const flagged = (rows: Row[]) => rows.filter((r) => sanityReason(r.value, best) != null);

  const needReason = new Set(rowsNeedingReason(changed, runs, engineAsked));
  const drop = <T,>(m: Record<string, T>, id: string) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id));

  async function save(rows: Row[]) {
    setConfirm(null);
    setSaving(true);
    setError(null);
    for (const [i, { id, value }] of rows.entries()) {
      const earlier = i > 0 ? " Earlier rows were saved." : "";
      const reason = needReason.has(id) ? reasons[id]?.trim() : undefined;
      try {
        await logResult(id, value, reason);
        setDrafts((d) => drop(d, id));
        setReasons((m) => drop(m, id));
        setEngineAsked((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      } catch (e) {
        if (e instanceof EngineError && e.code === "reason_required") {
          setEngineAsked((s) => new Set(s).add(id));
          setCheckReasons(true);
          setError(`Run ${shortId(id)} already has a recorded result, so changing it needs a reason. Add one below and save again.${earlier}`);
        } else {
          setError(`Run ${shortId(id)} could not be saved: ${describeEngineError(e).replace(/\.?$/, ".")}${earlier}`);
        }
        break;
      }
    }
    setSaving(false);
  }

  const submit = () => {
    if (changed.some((r) => needReason.has(r.id) && reasonProblem(reasons[r.id]) != null)) {
      setCheckReasons(true);
      document.getElementById(`reason-${changed.find((r) => needReason.has(r.id) && reasonProblem(reasons[r.id]) != null)!.id}`)?.focus();
      return;
    }
    if (flagged(changed).length > 0) setConfirm(changed);
    else void save(changed);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Round ${displayRound(round)}`}
        title="Record results"
        description="Enter each measured value as it comes back. You can correct a saved value until the model is updated."
      action={
          <Button type="submit" form="record-form" disabled={changed.length === 0 || saving}>
            {saving ? "Saving..." : changed.length > 0 ? `Save ${formatNumber(changed.length, "count")} ${changed.length === 1 ? "result" : "results"}` : "Save results"}
          </Button>
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
              <TableHead className="hidden sm:table-cell">Recipe</TableHead>
              <TableHead numeric>Measured result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((r) => {
              const text = shownValue(r);
              const invalid = text.trim() !== "" && parseEntry(text) == null;
              const asking = needReason.has(r.id);
              return (
                <Fragment key={r.id}>
                  <TableRow id={`record-${r.id}`} className={asking ? "scroll-mt-12 border-b-0" : "scroll-mt-12"}>
                    <TableCell className="font-mono text-code">{shortId(r.id)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {inlineRecipeKeys(r.recipe, drivers).map((k) => (
                        <span key={k} className="mr-3 text-fg-muted">
                          {k} <span className="text-fg tabular-nums">{formatSetpoint(r.recipe[k])}</span>
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
                  {asking ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={3} className="whitespace-normal pt-0">
                        <ReasonField
                          id={r.id}
                          previous={r.result}
                          value={reasons[r.id] ?? ""}
                          disabled={saving}
                          problem={checkReasons ? reasonProblem(reasons[r.id]) : null}
                          onChange={(v) => setReasons((m) => ({ ...m, [r.id]: v }))}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </form>
      {logged > 0 ? (
        <Link href="/campaign/learn" className={buttonVariants({ variant: "outline", className: "self-start" })}>
          Learn from round {displayRound(round)}
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

/** The correction reason for one run, under its value. Sent with the new value and kept in the engine's audit trail. */
function ReasonField({
  id,
  previous,
  value,
  disabled,
  problem,
  onChange,
}: {
  id: string;
  previous: number | null;
  value: string;
  disabled: boolean;
  problem: string | null;
  onChange: (value: string) => void;
}) {
  const hint = `reason-hint-${id}`;
  return (
    <span className="flex flex-col gap-1 sm:ml-auto sm:max-w-md">
      <label htmlFor={`reason-${id}`} className="text-caption text-fg-muted">
        {previous != null ? `Changing the saved ${formatNumber(previous)}: why?` : "This run already has a recorded result: why change it?"}
      </label>
      <Input
        id={`reason-${id}`}
        value={value}
        maxLength={MAX_RESULT_REASON}
        placeholder="e.g. transcription error, re-measured"
        aria-invalid={problem != null}
        aria-describedby={problem ? hint : undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full"
      />
      {problem ? (
        <span id={hint} className="text-caption text-bad">
          {problem}
        </span>
      ) : null}
    </span>
  );
}
