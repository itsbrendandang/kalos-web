"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
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
