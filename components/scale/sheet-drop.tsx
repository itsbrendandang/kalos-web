"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pick the multi-scale run sheet: click to browse or drop a file. Once a file
 * is chosen it collapses to one line with its name and a Replace button. The
 * file stays in the browser until the readout is run.
 */
export function SheetDrop({
  file,
  onFile,
  disabled = false,
}: {
  file: File | null;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const browse = () => {
    if (!disabled) inputRef.current?.click();
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,.tsv,.xlsx,.xls"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onFile(f);
      }}
    />
  );

  if (file) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {input}
        <FileSpreadsheet className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-code text-fg">{file.name}</span>
        <Button variant="outline" size="sm" onClick={browse} disabled={disabled}>
          Replace
        </Button>
      </div>
    );
  }

  return (
    <>
      {input}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label="Choose a multi-scale run sheet (CSV, TSV or Excel)"
        onClick={browse}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            browse();
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
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
          drag ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-subtle",
          disabled && "pointer-events-none bg-subtle text-fg-muted",
        )}
      >
        <Upload className="size-5 text-accent" aria-hidden />
        <p className="text-label text-fg">
          Drop a run sheet here <span className="font-normal text-fg-muted">or click to choose</span>
        </p>
        <p className="text-caption text-fg-muted">CSV, TSV or Excel. One row per run, with scale_L, the measured response and the process settings.</p>
      </div>
    </>
  );
}
