"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadWorkspaceDataset } from "@/lib/workspace/adapter";

/**
 * The rail's "New campaign" affordance. A run table goes in, the engine
 * analyses it (`POST /api/run`) and seeds a campaign from it.
 *
 * The engine authors its own refusals here - an unreadable file, a target
 * column that is not in the sheet, a refusal to touch data it will not
 * overwrite - and every one of them is shown exactly as written. There is no
 * generic "upload failed": the reason IS the useful part, because it is the
 * only thing that tells the reader what to change about the file.
 */
export function NewCampaignDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const result = await uploadWorkspaceDataset(file, target);
    if (result.status === "error") {
      setError(result.reason);
      setBusy(false);
      return;
    }
    // Only close once the workspace has actually re-read the engine, so the
    // rail never blinks shut on a campaign that is not there yet.
    await onUploaded();
    setBusy(false);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start a new campaign"
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-[440px] rounded-[16px] bg-card p-7 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[22px] font-semibold tracking-[-0.01em] text-fg">Start a new campaign</h2>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">
              The engine reads the run table, fits it, and opens a campaign around it. Nothing is written to any
              existing campaign.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="grid size-7 shrink-0 place-items-center rounded-[9px] border border-border text-muted transition-colors hover:bg-blue-soft hover:text-fg disabled:cursor-not-allowed disabled:opacity-55"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-campaign-file" className="text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">
              Run table
            </label>
            <input
              id="new-campaign-file"
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.xlsx"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
              className="rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] text-fg file:mr-3 file:rounded-[8px] file:border-0 file:bg-blue-tint file:px-2.5 file:py-1 file:font-sans file:text-[12px] file:font-semibold file:text-fg disabled:cursor-not-allowed disabled:opacity-55"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-campaign-target"
              className="text-[10px] font-semibold tracking-[0.09em] text-muted uppercase"
            >
              Target column <span className="font-sans normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="new-campaign-target"
              type="text"
              value={target}
              disabled={busy}
              onChange={(e) => {
                setTarget(e.target.value);
                setError(null);
              }}
              placeholder="left blank, the engine picks it"
              className="rounded-[10px] border border-border bg-card px-3 py-2 text-[12.5px] text-fg placeholder:text-muted focus:border-action focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-[10px] bg-amber-soft px-3.5 py-2.5 text-[12px] leading-[1.5] text-amber">
            <span className="font-semibold">The engine refused this file.</span> {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[10px] border border-border bg-card px-[13px] py-[7px] text-[12px] font-semibold text-fg transition-colors hover:bg-blue-tint disabled:cursor-not-allowed disabled:opacity-55"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={upload}
            disabled={!file || busy}
            className={cn(
              "rounded-[10px] bg-action px-[15px] py-[7px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90",
              "disabled:cursor-not-allowed disabled:opacity-55",
            )}
          >
            {busy ? "Analysing..." : "Analyse and open"}
          </button>
        </div>
      </div>
    </div>
  );
}
