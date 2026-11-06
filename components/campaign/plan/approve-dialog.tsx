"use client";

import { useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useViewer } from "@/components/auth/viewer";
import { PredictedMark } from "@/components/campaign/plan/marks";
import type { PlanContext, PlanRow } from "@/components/campaign/plan/types";
import { exactSetpoint, type PlanAnalysis } from "@/components/campaign/plan-view";
import { NOT_AVAILABLE, provenanceRows } from "@/components/campaign/plan/provenance";
import { Disclosure } from "@/components/kit/disclosure";
import { WhyLine } from "@/components/kit/why-line";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";
import { approverSentence } from "@/lib/viewer";

const plural = (n: number, one: string) => `${formatNumber(n, "count")} ${n === 1 ? one : `${one}s`}`;

export { NOT_AVAILABLE, provenanceRows, type ProvenanceRow } from "@/components/campaign/plan/provenance";

/**
 * The explicit confirmation step. It lists the recipes and, one click down, what the engine built them
 * from; names who is confirming; and asks for one tick before the one primary action, Start. Nothing
 * starts until that tick and the press; closing the dialog changes nothing. The start itself is the
 * page's existing `startRuns` write.
 */
export function ApproveDialog({
  open,
  onOpenChange,
  rows,
  ctx,
  d,
  round,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: PlanRow[];
  ctx: PlanContext;
  d: PlanAnalysis;
  round: number;
  /** Resolves true when the engine confirmed the start. */
  onStart: () => Promise<boolean>;
}) {
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A ref, not state: a second click in the same frame must not send the batch twice.
  const inFlight = useRef(false);
  const viewer = useViewer();
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
            Start {plural(rows.length, "run")} for round {round}
          </DialogTitle>
          <DialogDescription>
            These recipes were proposed by the model; none has been tested. Starting adds them to the campaign as runs in the lab; it does not run anything. You run them in the lab, then record each result.
          </DialogDescription>
        </DialogHeader>

        <section aria-label="Runs to start" className="flex flex-col gap-2">
          <h3 className="text-label text-fg">Recipes that will start</h3>
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
          <p className="text-caption text-fg-muted">Values are exactly what will be sent, unrounded. The table on the page rounds them to the sheet&apos;s precision.</p>
        </section>

        <Disclosure summary="What these runs were built from">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-caption">
            {provenanceRows(d).map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-fg-muted">{r.label}</dt>
                <dd className={`min-w-0 break-all ${r.value === NOT_AVAILABLE ? "text-fg-muted" : "text-fg"} ${r.mono ? "font-mono text-code" : "tabular-nums"}`}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>

        {flagged.length ? (
          <p className="flex items-start gap-2 text-body text-fg">
            <TriangleAlert className="mt-1 size-4 shrink-0 text-warn" aria-hidden />
            {flagged.map((r) => r.id).join(", ")} {flagged.length === 1 ? "has" : "have"} something to check first. Each is explained under Details on the page.
          </p>
        ) : null}

        <p className="text-body text-fg">{approverSentence(viewer)}</p>

        <label className="flex cursor-pointer items-start gap-2 text-body text-fg">
          <Checkbox checked={approved} onChange={(e) => setApproved(e.currentTarget.checked)} disabled={busy} />
          <span className="pt-0.5">I have looked at these {plural(rows.length, "recipe")} and want to start them.</span>
        </label>

        {failed ? (
          <div role="alert" className="flex flex-col gap-1">
            <p className="text-body text-bad">Kalos did not confirm the start. Check Run to see whether any runs started before you try again.</p>
            <WhyLine code="start_unconfirmed" />
          </div>
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
