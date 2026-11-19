"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/kit/section";
import type { ColumnRolesInput } from "@/lib/api";
import type { SheetColumn } from "@/lib/sheet-roles";

/**
 * "Did Kalos read your columns right?" Lists every column of the sheet with the
 * inputs Kalos used ticked and the target named, so a mislabelled ID column or a
 * measured-output column can be fixed before the fit is trusted. Re-fitting sends
 * the chosen columns as explicit roles; "Looks right" confirms the current ones.
 * Confirmation is advisory by design (the fit is already saved; no route is blocked on it).
 */
export function ColumnConfirm({
  columns,
  target,
  targets,
  busy,
  onConfirm,
  onRefit,
}: {
  columns: SheetColumn[];
  target: string;
  targets: string[];
  busy: boolean;
  onConfirm: () => void;
  onRefit: (roles: ColumnRolesInput) => void;
}) {
  const inputs = columns.filter((c) => c.usedAsInput).map((c) => c.name);
  const [picked, setPicked] = useState<Set<string>>(new Set(inputs));
  const [tgt, setTgt] = useState(target);
  const candidates = columns.filter((c) => c.name !== tgt);
  const changed = tgt !== target || picked.size !== inputs.length || inputs.some((i) => !picked.has(i));

  function toggle(c: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  return (
    <Panel aria-labelledby="column-confirm-title" className="flex flex-col gap-4">
      <div>
        <h3 id="column-confirm-title" className="text-heading text-fg">
          Did Kalos read your columns right?
        </h3>
        <p className="mt-0.5 text-body text-fg-muted">Check the target and the inputs before you trust this fit. Changing them re-fits the model from the same file.</p>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-label text-fg sm:max-w-sm">
          Maximize (target)
          <select
            className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-body"
            value={tgt}
            onChange={(e) => setTgt(e.target.value)}
            disabled={busy}
          >
            {(targets.length ? targets : [target]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1.5" disabled={busy}>
          <legend className="text-label text-fg">Inputs Kalos may vary ({picked.size} of {candidates.length} columns)</legend>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => (
              <li key={c.name}>
                <label className="flex items-center gap-2 text-body text-fg">
                  <input type="checkbox" className="accent-accent" checked={picked.has(c.name)} onChange={() => toggle(c.name)} />
                  <span className="truncate font-mono text-code">{c.name}</span>
                  {c.note ? <span className="shrink-0 text-caption text-fg-muted">({c.note})</span> : null}
                  {c.warning ? <span className="shrink-0 text-caption text-warn">Note: {c.warning}</span> : null}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-muted">Untick IDs, dates, and anything measured after the run (outputs), since those are not settings you can choose.</p>
          <p className="text-caption text-fg-muted">
            Re-fitting with your own choices uses the engine&apos;s generic column profile, which may skip bioprocess-specific name-based checks and unit conversions.
            Roles you declare apply to this upload only: when you later record results and re-analyze, the engine infers roles from the column names again.
          </p>
          <p className="text-caption text-fg-muted">
            Confirming is advisory: the fit is already saved. It records that you checked the columns; Predict stays open without it, and reloading the page skips it.
          </p>
        </fieldset>
      </div>
      <div>
        {changed ? (
          <Button size="sm" disabled={busy || picked.size === 0} onClick={() => onRefit({ target: tgt, features: candidates.map((c) => c.name).filter((c) => picked.has(c)) })}>
            Re-fit with these columns
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={onConfirm}>
            Looks right
          </Button>
        )}
      </div>
    </Panel>
  );
}
