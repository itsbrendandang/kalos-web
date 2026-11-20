"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { putStages, type StagesView } from "@/lib/api";
import { EngineError, engineMessage } from "@/lib/engine-error";
import { gateErrorText, recordedAt } from "@/lib/viz-data/stage-gate";

/**
 * The current stage, set by a person. It PUTs /stages with the SAME stage list
 * and the chosen `current_stage`; nothing in the app ever computes or
 * advances it (a go decision does not move it either).
 */
export function stagesBody(view: Pick<StagesView, "stages">, current: string | null) {
  return {
    stages: view.stages.map((s) => ({
      key: s.key,
      label: s.label,
      ...(s.min_L != null && s.max_L != null ? { min_L: s.min_L, max_L: s.max_L } : {}),
      ...(s.nominal_L?.length ? { nominal_L: s.nominal_L } : {}),
    })),
    current_stage: current,
  };
}

export function CurrentStageControl({
  campaignId,
  view,
  readOnly,
  onSaved,
}: {
  campaignId: string;
  view: StagesView;
  readOnly: boolean;
  onSaved: (next: StagesView) => void;
}) {
  const [choice, setChoice] = useState<string>(view.current_stage ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = (choice || null) !== view.current_stage;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await putStages(campaignId, stagesBody(view, choice || null)));
    } catch (e) {
      const code = e instanceof EngineError ? e.code : null;
      setError(gateErrorText(code) ?? engineMessage({ code: code ?? "engine_error", error: e instanceof EngineError ? e.detail : null }).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-label text-fg">Current stage (set by your team)</span>
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={readOnly || busy}
            className="h-9 min-w-56 rounded-lg border border-border-strong bg-surface px-3 text-body text-fg hover:border-fg-muted focus-visible:border-accent disabled:bg-subtle disabled:text-fg-muted"
          >
            <option value="">Not set</option>
            {view.stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key} {s.label}
              </option>
            ))}
          </select>
        </label>
        {!readOnly ? (
          <Button variant="outline" onClick={() => void save()} disabled={!changed || busy}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            Save current stage
          </Button>
        ) : null}
      </div>
      <p className="text-caption text-fg-muted">
        {view.updated_at != null
          ? `Stages last saved by ${view.updated_by ?? "n/a"} at ${recordedAt(view.updated_at)}.`
          : "Using the engine's default stage definitions; nobody has saved a current stage yet."}{" "}
        Recording a go does not move the current stage; only this control does.
      </p>
      {error ? (
        <p role="alert" className="text-caption text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
