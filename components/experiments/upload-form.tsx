"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createExperiment, ExperimentApiError, type Experiment } from "@/lib/experiments";
import { cn } from "@/lib/utils";

/** Upload card that creates a new DRAFT experiment via POST /api/experiments.
 *  Mirrors the analyze page's dropzone, plus the name/target/outcomes fields
 *  the experiments endpoint requires. */
export function UploadExperimentForm({ onCreated }: { onCreated: (exp: Experiment) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [anonymize, setAnonymize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    setFile(f);
    if (!name) setName(f.name.replace(/\.(csv|tsv|xlsx|xls)$/i, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim() || !target.trim()) {
      setErr("A file, name, and target column are all required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const exp = await createExperiment(file, {
        name: name.trim(),
        target: target.trim(),
        outcomes: outcomes.trim() || undefined,
        anonymize,
      });
      onCreated(exp);
      setFile(null);
      setName("");
      setTarget("");
      setOutcomes("");
      setAnonymize(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setErr(e instanceof ExperimentApiError ? e.message : "Experiments service unavailable. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionLabel>New experiment</SectionLabel>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
          }}
        />
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a run sheet (CSV, TSV, or Excel)"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pickFile(f);
          }}
          className={cn(
            "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-[12.5px] transition-colors",
            drag ? "border-accent bg-accent-soft" : "border-border bg-blue-soft hover:bg-accent-soft",
          )}
        >
          <Upload className="size-4 shrink-0 text-accent" />
          <span className="min-w-0 truncate">
            {file ? <span className="font-mono font-semibold text-fg">{file.name}</span> : "Drop a run sheet here or click to choose"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Experiment name"
              className="min-h-[36px] rounded-lg border border-border bg-card px-2.5 text-[13px] text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Target column
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. titer"
              className="min-h-[36px] rounded-lg border border-border bg-card px-2.5 font-mono text-[13px] text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Extra outcomes (optional)
            <input
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
              placeholder="comma separated"
              className="min-h-[36px] rounded-lg border border-border bg-card px-2.5 font-mono text-[13px] text-fg"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12px] text-muted">
            <input type="checkbox" checked={anonymize} onChange={(e) => setAnonymize(e.target.checked)} className="size-3.5" />
            Anonymize on upload
          </label>
          <Button type="submit" disabled={busy}>
            <Upload />
            {busy ? "Creating..." : "Create draft"}
          </Button>
        </div>
      </form>
      {err ? <p className="mt-3 text-[12.5px] text-red">{err}</p> : null}
    </Card>
  );
}
