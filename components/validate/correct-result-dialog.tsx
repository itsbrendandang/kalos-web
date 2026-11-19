"use client";

import { useState } from "react";
import { correctionProblem, MAX_REASON } from "@/components/campaign/learn";
import { parseEntry, sanityReason } from "@/components/campaign/stage-logic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Num } from "@/components/viz/num";
import type { CampaignRun } from "@/lib/api";
import { errorMessage } from "@/lib/engine-error";
import { formatValue, type IntervalSpec } from "@/lib/num";
import { shortId } from "@/lib/workbench";

/**
 * Correct a recorded result. Results are append-only on the engine: the
 * correction becomes a new version, and the engine refuses it without a
 * reason (400 reason_required), so the reason is asked for up front.
 */
type Props = {
  unit: string | null;
  best: number | null;
  /** The run's band when the current analysis proposed it, else null (shown as "band n/a"). */
  interval?: IntervalSpec | null;
  /** Shared column decimals from the Record table, so the dialog prints the same digits. */
  decimals?: { pred: number; measured: number };
  /** Measured precision (replicate noise SD) when the engine reported one. */
  measuredU?: number | null;
  onClose: () => void;
  onSave: (run: CampaignRun, value: number, reason: string) => Promise<void>;
};

export function CorrectResultDialog({
  run,
  ...props
}: Props & {
  /** The run being corrected; null closes the dialog. */
  run: CampaignRun | null;
}) {
  return (
    <Dialog open={run != null} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>{run ? <CorrectionForm key={run.id} run={run} {...props} /> : null}</DialogContent>
    </Dialog>
  );
}

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

function CorrectionForm({ run, unit, best, interval = null, decimals, measuredU = null, onClose, onSave }: Props & { run: CampaignRun }) {
  const [valueText, setValueText] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const value = parseEntry(valueText);
  const problem = correctionProblem(run.result, value, reason);
  const unusual = value != null ? sanityReason(value, best) : null;
  const version = run.result_version;

  async function submit() {
    setTried(true);
    if (problem || value == null) return;
    setSaving(true);
    setFailure(null);
    try {
      await onSave(run, value, reason.trim());
      onClose();
    } catch (e) {
      setFailure(errorMessage(e).message);
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Correct the result for run {shortId(run.id)}</DialogTitle>
        <DialogDescription>
          The engine keeps every version: the recorded value stays in the history and the correction is saved as a new version with your reason.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="text-fg-muted">Recorded{version != null ? ` (version ${count(version)})` : ""}</dt>
        <dd>
          <Num value={run.result} basis="measured" unit={unit} options={decimals ? { decimals: decimals.measured } : { uncertainty: measuredU }} />
        </dd>
        <dt className="text-fg-muted">Predicted</dt>
        <dd className="flex flex-wrap items-baseline gap-x-2">
          <Num value={run.pred} basis="predicted" unit={unit} interval={interval} options={decimals ? { decimals: decimals.pred } : undefined} />
          {interval ? null : <span className="text-caption text-fg-muted">band n/a</span>}
        </dd>
      </dl>
      <label className="flex flex-col gap-1.5">
        <span className="text-label text-fg">Corrected value{unit ? ` (${unit})` : ""}</span>
        <Input
          inputMode="decimal"
          autoFocus
          value={valueText}
          disabled={saving}
          aria-invalid={tried && value == null}
          onChange={(e) => setValueText(e.target.value)}
          className="w-40 tabular-nums"
        />
        {unusual ? <span className="text-caption text-warn">This value {unusual}. Check it before saving.</span> : null}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-label text-fg">Reason for the correction</span>
        <Input
          value={reason}
          maxLength={MAX_REASON}
          disabled={saving}
          placeholder="e.g. re-read the plate after a dilution error"
          aria-invalid={tried && reason.trim() === ""}
          onChange={(e) => setReason(e.target.value)}
        />
        <span className="text-caption text-fg-muted tabular-nums">
          Required. Stored with this version. {count(reason.trim().length)}/{count(MAX_REASON)}
        </span>
      </label>
      {tried && problem ? (
        <p role="alert" className="text-caption text-bad">
          {problem}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-caption text-bad">
          Not saved: {failure}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save correction"}
        </Button>
      </DialogFooter>
    </form>
  );
}
