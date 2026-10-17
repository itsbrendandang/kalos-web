"use client";

import { useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { PredictedMark } from "@/components/campaign/plan/marks";
import type { PlanContext, PlanRow } from "@/components/campaign/plan/recommendations";
import { formatSetpoint } from "@/components/campaign/plan-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";

const plural = (n: number, one: string) => `${formatNumber(n, "count")} ${n === 1 ? one : `${one}s`}`;

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
    setBusy(true);
    setFailed(false);
    const ok = await onStart();
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
            These are model-generated proposals, not tested recipes. Starting records them as runs in flight; you then run them in the lab and record each result.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-code text-fg">{r.id}</span>
                <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted tabular-nums">
                  <PredictedMark /> predicted {formatNumber(r.item.proposal.pred)}
                </span>
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-fg-muted">
                {ctx.features
                  .filter((f) => f in r.recipe)
                  .map((f) => (
                    <span key={f} className="whitespace-nowrap">
                      {f} <span className="text-fg tabular-nums">{formatSetpoint(r.recipe[f], ctx.ranges[f]?.decimals)}</span>
                    </span>
                  ))}
                {ctx.others.some((k) => k in r.recipe) ? <span>+ {ctx.others.filter((k) => k in r.recipe).length} more inputs</span> : null}
              </p>
            </li>
          ))}
        </ul>

        {flagged.length ? (
          <p className="flex items-start gap-2 text-body text-fg">
            <TriangleAlert className="mt-1 size-4 shrink-0 text-warn" aria-hidden />
            {flagged.map((r) => r.id).join(", ")} {flagged.length === 1 ? "has" : "have"} checks to review. Open Details on the page to see them.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2 text-body text-fg">
          <Checkbox checked={approved} onChange={(e) => setApproved(e.currentTarget.checked)} disabled={busy} />
          <span className="pt-0.5">I have reviewed these {plural(rows.length, "recipe")} and approve starting them.</span>
        </label>

        {failed ? (
          <p role="alert" className="text-body text-bad">
            The engine did not confirm the start. Check Run to see whether any runs started before you try again.
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
