"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
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
          if (f) onFile(f);
        }}
        className={cn(
          "flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          drag ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-subtle",
          disabled && "pointer-events-none cursor-default bg-subtle",
          className,
        )}
      >
        <Upload className="size-7 text-accent" />
        <div className="text-heading text-fg">
          Drop a run sheet here <span className="font-normal">or click to choose</span>
        </div>
        <div className="text-caption text-fg">CSV, TSV or Excel (.xlsx, .xls)</div>
      </div>
    </>
  );
}
