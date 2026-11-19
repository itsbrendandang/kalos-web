"use client";

import { useState } from "react";
import { MeasuredValue, PredictedValue } from "@/components/campaign/plan/marks";
import { correctionProblem, MAX_REASON } from "@/components/campaign/learn";
import { parseEntry, sanityReason } from "@/components/campaign/stage-logic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CampaignRun } from "@/lib/api";
import { errorMessage } from "@/lib/engine-error";
import { formatNumber } from "@/lib/format";
import { shortId } from "@/lib/workbench";

/**
 * Correct a recorded result. Results are append-only on the engine: the
 * correction becomes a new version, and the engine refuses it without a
 * reason (400 reason_required), so the reason is asked for up front.
 */
export function CorrectResultDialog({
  run,
  unit,
  best,
  onClose,
  onSave,
}: {
  /** The run being corrected; null closes the dialog. */
  run: CampaignRun | null;
  unit: string;
  best: number | null;
  onClose: () => void;
  onSave: (run: CampaignRun, value: number, reason: string) => Promise<void>;
}) {
  return (
    <Dialog open={run != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{run ? <CorrectionForm key={run.id} run={run} unit={unit} best={best} onClose={onClose} onSave={onSave} /> : null}</DialogContent>
    </Dialog>
  );
}

function CorrectionForm({
  run,
  unit,
  best,
  onClose,
  onSave,
}: {
  run: CampaignRun;
  unit: string;
  best: number | null;
  onClose: () => void;
  onSave: (run: CampaignRun, value: number, reason: string) => Promise<void>;
}) {
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
        <dt className="text-fg-muted">Recorded{version != null ? ` (version ${formatNumber(version, "count")})` : ""}</dt>
        <dd>
          <MeasuredValue value={formatNumber(run.result)} unit={unit || undefined} />
        </dd>
        <dt className="text-fg-muted">Prediction</dt>
        <dd>
          <PredictedValue value={formatNumber(run.pred)} unit={unit || undefined} />
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
          Required. Stored with this version. {formatNumber(reason.trim().length, "count")}/{MAX_REASON}
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
