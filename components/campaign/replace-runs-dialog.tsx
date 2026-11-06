"use client";

import { useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WhyLine } from "@/components/kit/why-line";
import type { CampaignHasRunsError, CampaignRun } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { recipeColumns, recipesAsText, runLabels } from "@/lib/recipe-identity";

/**
 * Asks before an upload replaces a campaign that still has runs waiting for a result or measured runs,
 * and says what really happens: Kalos drops those runs; the sheet uploaded earlier stays in this
 * browser's Data list. The runs can be copied or downloaded from here first (first-time study, F14). Open
 * while `refusal` is set. Cancel (button, Escape, or the close X) calls `onCancel` and changes nothing;
 * only `onConfirm` resends the file with replace=true. Focus starts on Cancel, the safe choice.
 */
export function ReplaceRunsDialog({
  refusal,
  runs = [],
  inputs = [],
  target = "",
  onConfirm,
  onCancel,
}: {
  refusal: CampaignHasRunsError | null;
  /** The campaign's runs (waiting and measured), so they can be copied or downloaded before they are dropped. */
  runs?: readonly CampaignRun[];
  /** The campaign's inputs, for the column order. */
  inputs?: readonly string[];
  target?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const awaiting = refusal?.awaiting ?? runs.filter((r) => r.awaiting).length;
  const measured = refusal?.measured ?? runs.filter((r) => !r.awaiting).length;
  const n = (k: number, what: string) => `${formatNumber(k, "count")} ${what}${k === 1 ? "" : "s"}`;
  const description = `Kalos drops this campaign's ${n(awaiting, "run")} waiting for a result and ${n(measured, "measured run")} and starts again from the new sheet. The sheet you uploaded earlier stays in this browser's Data list, but the recorded runs are not kept anywhere.`;
  const text = runs.length
    ? recipesAsText(
        (() => {
          const labels = runLabels(runs);
          return runs.map((r) => ({ label: labels.get(r.id) ?? r.id, recipe: r.recipe, predicted: r.pred, measured: r.result }));
        })(),
        recipeColumns(
          runs.map((r) => r.recipe),
          inputs,
        ),
        target,
        { measured: true },
      )
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  function download() {
    const csv = text
      .split("\n")
      .map((line) => line.split("\t").map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kalos-runs-${target || "campaign"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={refusal !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle>Replace this campaign&apos;s runs?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <WhyLine code="campaign_has_runs" />
        {runs.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-fg">Keep a copy of the {n(runs.length, "run")} first:</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                {copied === "done" ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied === "done" ? "Copied" : "Copy as a table"}
              </Button>
              <Button variant="outline" size="sm" onClick={download}>
                <Download aria-hidden />
                Download as CSV
              </Button>
              <span role="status" className="text-caption text-fg-muted">
                {copied === "done" ? "On the clipboard; paste it into a spreadsheet." : copied === "failed" ? "The browser did not allow copying; use Download instead." : null}
              </span>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            Keep the runs (cancel)
          </Button>
          <Button onClick={onConfirm}>Drop the runs and upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
