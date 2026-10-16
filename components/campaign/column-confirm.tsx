"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/kit/callout";
import type { ColumnRolesInput } from "@/lib/api";

/**
 * "Did Kalos read your columns right?" Lists every column of the sheet with the
 * inputs Kalos used ticked and the target named, so a mislabelled ID column or a
 * measured-output column can be fixed before the fit is trusted. Re-fitting sends
 * the chosen columns as explicit roles; "Looks right" confirms the current ones.
 */
export function ColumnConfirm({
  columns,
  inputs,
  target,
  targets,
  busy,
  onConfirm,
  onRefit,
}: {
  columns: string[];
  inputs: string[];
  target: string;
  targets: string[];
  busy: boolean;
  onConfirm: () => void;
  onRefit: (roles: ColumnRolesInput) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(inputs));
  const [tgt, setTgt] = useState(target);
  const candidates = columns.filter((c) => c !== tgt);
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
    <Callout
      tone="accent"
      title="Confirm the columns before you trust this fit"
      action={
        changed ? (
          <Button size="sm" disabled={busy || picked.size === 0} onClick={() => onRefit({ target: tgt, features: candidates.filter((c) => picked.has(c)) })}>
            Re-fit with these columns
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={onConfirm}>
            Looks right
          </Button>
        )
      }
    >
      <div className="mt-2 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-label text-fg sm:max-w-sm">
          Maximize (target)
          <select
            className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-body"
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
              <li key={c}>
                <label className="flex items-center gap-2 text-body text-fg">
                  <input type="checkbox" checked={picked.has(c)} onChange={() => toggle(c)} />
                  <span className="truncate">{c}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-muted">Untick IDs, dates, and anything measured after the run (outputs), since those are not settings you can choose.</p>
        </fieldset>
      </div>
    </Callout>
  );
}
