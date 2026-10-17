"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { preflightFile } from "@/lib/upload-preflight";

/**
 * Shared drag-and-drop run-sheet picker: click-to-browse or drag-and-drop,
 * accepting CSV/TSV/XLSX/XLS. Extracted from app/analyze/page.tsx so the
 * upload affordance looks and behaves identically everywhere a scientist
 * hands the app a run sheet (analyze, validate) - a single control, not a
 * copy per page.
 */
export function UploadDropzone({
  onFile,
  disabled = false,
  className,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const accept = (f: File) => {
    const problem = preflightFile(f);
    setRejection(problem);
    if (!problem) onFile(f);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) accept(f);
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a run sheet (CSV, TSV, or Excel)"
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
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
          if (f) accept(f);
        }}
        className={cn(
          "flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          drag ? "border-accent bg-accent-soft" : "border-border bg-card hover:bg-blue-soft",
          disabled && "pointer-events-none opacity-60",
          className,
        )}
      >
        <Upload className="size-7 text-accent" />
        <div className="text-sm font-semibold">
          Drop a run sheet here <span className="font-normal text-muted">or click to choose</span>
        </div>
        <div className="font-mono text-[11px] text-muted">CSV / TSV / XLSX / parsed for this analysis</div>
      </div>
      {rejection ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {rejection}
        </p>
      ) : null}
    </>
  );
}
