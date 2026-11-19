"use client";

import { useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { predOf, type PlanContext, type PlanRow } from "@/components/campaign/plan/recommendations";
import { exactSetpoint } from "@/components/campaign/plan-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BasisGlyph } from "@/components/viz/num";
import { coverageText, formatValue } from "@/lib/num";
import { bandLegend } from "@/lib/viz-data/batch-interval-strip";

const plural = (n: number, one: string) => `${formatValue(n, { quantity: "count" }).text} ${n === 1 ? one : `${one}s`}`;

/**
 * The explicit approval step. Nothing starts until the user ticks the
 * approval box and presses Start; closing the dialog changes nothing. The
 * start itself is the page's existing `startRuns` write.
 */
export function ApproveDialog({
  open,
  onOpenChange,
  rows,
  ctx,
  round,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: PlanRow[];
  ctx: PlanContext;
  round: number;
  /** Resolves true when the engine confirmed the start. */
  onStart: () => Promise<boolean>;
}) {
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A ref, not state: a second click in the same frame must not send the batch twice.
  const inFlight = useRef(false);
  const flagged = rows.filter((r) => r.flags.length > 0);
  // Focus lands on the title, not the approval box, so approving is a deliberate second step.
  const titleRef = useRef<HTMLHeadingElement>(null);

  function change(next: boolean) {
    if (busy) return;
    if (!next) {
      setApproved(false);
      setFailed(false);
    }
    onOpenChange(next);
  }

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    const ok = await onStart();
    inFlight.current = false;
    setBusy(false);
    if (ok) {
      setApproved(false);
      onOpenChange(false);
    } else setFailed(true);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent initialFocus={titleRef} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            Approve {plural(rows.length, "run")} for round {round}
          </DialogTitle>
          <DialogDescription>
            These are model-generated proposals, not tested recipes. Starting adds them to the campaign as runs in flight; it does not run anything. You run them in the lab, then record each result.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-code text-fg">{r.id}</span>
                <PredictedLine row={r} ctx={ctx} />
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-fg-muted">
                {[...ctx.features, ...ctx.others]
                  .filter((k) => k in r.recipe)
                  .map((k) => (
                    <span key={k} className="min-w-0 break-all">
                      {k} <span className="text-fg tabular-nums">{exactSetpoint(r.recipe[k])}</span>
                    </span>
                  ))}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-caption text-fg-muted">
          Values are exactly what will be sent, unrounded. The table on the page rounds them to each input&apos;s range precision.{" "}
          {ctx.model.intervals.kind === "none" ? "The engine reported no prediction band." : `Predicted with the ${bandLegend(ctx.model)}.`}
        </p>

        {flagged.length ? (
          <p className="flex items-start gap-2 text-body text-fg">
            <TriangleAlert className="mt-1 size-4 shrink-0 text-warn" aria-hidden />
            {flagged.map((r) => r.id).join(", ")} {flagged.length === 1 ? "has" : "have"} checks. Each is explained under Details on the page.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2 text-body text-fg">
          <Checkbox checked={approved} onChange={(e) => setApproved(e.currentTarget.checked)} disabled={busy} />
          <span className="pt-0.5">I have reviewed these {plural(rows.length, "recipe")} and approve starting them.</span>
        </label>

        {failed ? (
          <p role="alert" className="text-body text-bad">
            The engine did not confirm the start. Check Validate to see whether any runs started before you try again.
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!approved || busy || rows.length === 0}>
            {busy ? "Starting..." : `Start ${plural(rows.length, "run")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "○ predicted 1.61 g/L [1.39, 1.84] 90%": the prediction with the engine's band and coverage. */
function PredictedLine({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const f = predOf(row, ctx);
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted tabular-nums">
      <BasisGlyph basis="predicted" />
      <span className="sr-only">{f.aria}</span>
      <span aria-hidden>
        predicted <span className="text-fg">{f.value}</span>
        {f.unit ? `\u00A0${f.unit}` : ""}
        {f.interval ? ` ${f.interval}` : ""}
        {f.coverage ? ` ${f.coverage}` : ""}
        {!f.interval && row.strip.interval.kind === "refused" ? `, ${coverageText(row.strip.interval.coverage)} band refused` : ""}
      </span>
    </span>
  );
}
