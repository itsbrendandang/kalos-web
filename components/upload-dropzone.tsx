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
          // Clear so choosing the same file again still fires onChange.
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
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
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center transition-colors",
          drag ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-subtle",
          disabled && "pointer-events-none bg-subtle",
          className,
        )}
      >
        <Upload className="size-5 text-fg-muted" aria-hidden />
        <p className="text-label text-fg">Drop a run sheet here, or click to choose</p>
        <p className="text-caption text-fg-muted">CSV, TSV or Excel, one run per row</p>
      </div>
    </>
  );
}
