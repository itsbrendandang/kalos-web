"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { describeEngineError, EngineError } from "@/lib/engine-error";
import { cn } from "@/lib/utils";

/** Click-or-drop picker for a run sheet (CSV, TSV or Excel). `compact` once a sheet is already loaded. */
export function UploadZone({ onFile, disabled = false, compact = false }: { onFile: (file: File) => void; disabled?: boolean; compact?: boolean }) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const open = () => {
    if (!disabled) input.current?.click();
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Clear so choosing the same file again still fires onChange.
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload a run sheet (CSV, TSV, or Excel)"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !disabled) onFile(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center transition-colors",
          compact ? "py-6" : "py-16",
          drag ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-subtle",
          disabled && "pointer-events-none bg-subtle",
        )}
      >
        <Upload className="size-5 text-fg-muted" aria-hidden />
        <p className="text-label text-fg">{compact ? "Upload a different run sheet" : "Drop a run sheet here, or click to choose"}</p>
        {compact ? null : <p className="text-caption text-fg-muted">CSV, TSV or Excel, one run per row</p>}
      </div>
    </>
  );
}

// --- Upload decisions (pure; unit tested in __tests__/setup-upload.test.ts) --

/** What started a fit that would replace the campaign: a new sheet, a new target, or new column roles. */
export type RefitTrigger = "upload" | "target" | "roles";

/**
 * Whether a fit must be confirmed before it is sent: the campaign holds runs
 * (awaiting or recorded but not yet folded) that a new fit would drop. Asked
 * up front because older engines never refuse with 409 `campaign_has_runs`.
 */
export function needsReplaceConfirm(campaign: { has_campaign: boolean; pending?: readonly unknown[] } | null | undefined): boolean {
  return !!campaign?.has_campaign && (campaign.pending?.length ?? 0) > 0;
}

function countPhrase(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The replace-confirmation sentence, from the campaign's counts (missing or zero counts fall back to a general sentence). */
export function replaceConfirmText(trigger: RefitTrigger, nAwaiting: number | null | undefined, nMeasured: number | null | undefined): string {
  const lead =
    trigger === "upload"
      ? "Fitting a different run sheet starts a new campaign."
      : trigger === "target"
        ? "Changing what to maximize re-fits the model and starts a new campaign."
        : "Re-fitting with these columns starts a new campaign.";
  const parts: string[] = [];
  if (nAwaiting) parts.push(`the ${countPhrase(nAwaiting, "run", "runs")} awaiting results`);
  if (nMeasured) parts.push(`the ${countPhrase(nMeasured, "recorded result", "recorded results")} not yet in the model`);
  const dropped = parts.length ? `It drops ${parts.join(" and ")}.` : "It drops the runs in the current campaign.";
  return `${lead} ${dropped} This cannot be undone.`;
}

/** At or past this many seconds an unanswered fit is treated as possibly still finishing on the engine. */
export const LONG_FIT_SECONDS = 30;

export type UploadFailure =
  /** The engine refused because the campaign has runs: ask, then re-send with replace=true. */
  | { kind: "confirm" }
  /** No answer: the fit may still land, so offer to check /api/latest again. */
  | { kind: "unreachable"; title: string; message: string }
  | { kind: "other"; title: string; message: string };

/** How the Setup page shows a thrown upload error (a bad sheet is not thrown; see lib/api runFile). */
export function uploadFailure(e: unknown, seconds: number): UploadFailure {
  const engine = e instanceof EngineError;
  if (engine && e.kind === "conflict" && e.code === "campaign_has_runs") return { kind: "confirm" };
  // A fetch that never got a response (TypeError) is as unanswered as the proxy's 502/504.
  if (!engine || e.kind === "unreachable") {
    const message =
      seconds >= LONG_FIT_SECONDS
        ? "The analysis service stopped answering during a long fit. The fit may still be finishing; check again in a minute to load it."
        : describeEngineError(e);
    return { kind: "unreachable", title: "No answer from the analysis service", message };
  }
  return { kind: "other", title: "The upload did not go through", message: describeEngineError(e) };
}
