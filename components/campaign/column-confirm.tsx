"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/kit/disclosure";
import type { ColumnRolesInput } from "@/lib/api";
import type { SheetColumn } from "@/lib/sheet-roles";

/**
 * "Did Kalos read your columns right?" Optional, so it lives behind a
 * Disclosure: the summary says whether it is confirmed. Lists every column of
 * the sheet with the inputs Kalos used ticked and the target named, so a
 * mislabelled ID column or a measured-output column can be fixed before the
 * fit is trusted. Re-fitting sends the chosen columns as explicit roles;
 * "Looks right" confirms the current ones. Confirmation is advisory: the fit
 * is already saved, and no route is blocked on it.
 */
export function ColumnConfirm({
  columns,
  target,
  targets,
  busy,
  confirmed,
  onConfirm,
  onRefit,
}: {
  columns: SheetColumn[];
  target: string;
  targets: string[];
  busy: boolean;
  confirmed: boolean;
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
    <Disclosure summary="Check the columns" meta={confirmed ? "Confirmed" : "Optional"} defaultOpen={false}>
      <div className="flex flex-col gap-4">
        <p className="text-body text-fg">
          Kalos read these columns from your sheet. Keep them, or build the model with your own choices. Untick IDs, dates, and anything measured after the run.
        </p>
        <label className="flex flex-col gap-1 text-label text-fg sm:max-w-sm">
          Target to raise
          <select
            className="rounded-md border border-border-input bg-surface px-2 py-1.5 text-body"
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
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="text-label text-fg">
            Inputs Kalos may vary (<span className="tabular-nums">{picked.size}</span> of <span className="tabular-nums">{candidates.length}</span> columns)
          </legend>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => (
              <li key={c.name}>
                <label className="flex items-center gap-2 text-body text-fg">
                  <input type="checkbox" checked={picked.has(c.name)} onChange={() => toggle(c.name)} />
                  <span className="truncate">{c.name}</span>
                  {c.note ? <span className="shrink-0 text-caption text-fg-muted">({c.note})</span> : null}
                  {c.warning ? <span className="shrink-0 text-caption text-warn">Note: {c.warning}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          {changed ? (
            <Button size="sm" disabled={busy || picked.size === 0} onClick={() => onRefit({ target: tgt, features: candidates.map((c) => c.name).filter((c) => picked.has(c)) })}>
              Build the model with these columns
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy || confirmed} onClick={onConfirm}>
              {confirmed ? "Columns confirmed" : "Keep these columns"}
            </Button>
          )}
        </div>
        <p className="text-caption text-fg-muted">
          {changed
            ? "With your own choices Kalos reads the columns as plain settings, so it may skip the bioprocess name checks and unit conversions."
            : "Optional. Kalos has already saved this model, so the next step stays available without confirming. Reloading the page skips this."}
        </p>
      </div>
    </Disclosure>
  );
}
