"use client";

import type { SheetSelector } from "@/lib/sheet-choice";

/** "Which sheet?" for a multi-sheet workbook; choosing re-submits the held file with that sheet. */
export function SheetPicker({ selector, busy, onPick }: { selector: SheetSelector; busy: boolean; onPick: (file: File, sheet: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-label text-fg sm:max-w-sm">
      Worksheet in {selector.target.name}
      <select
        className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-body"
        value={selector.current ?? ""}
        disabled={busy}
        onChange={(e) => e.target.value && onPick(selector.target, e.target.value)}
      >
        {selector.current === null ? <option value="">Choose a sheet…</option> : null}
        {selector.sheets.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span className="text-caption font-normal text-fg-muted">This workbook has {selector.sheets.length} sheets. Choosing one re-fits the model from that sheet.</span>
    </label>
  );
}
