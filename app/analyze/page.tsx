"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { runFile, type AnalyzeResult } from "@/lib/api";
import { Card, SectionLabel, Kpi } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/page-header";
import { DriversBar, PredScatter } from "@/components/charts";
import { Proposals } from "@/components/proposals";
import { cn, fmt } from "@/lib/utils";

export default function AnalyzePage() {
  const [res, setRes] = useState<AnalyzeResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function analyze(f: File, target?: string) {
    setFile(f);
    setBusy(true);
    setErr("");
    try {
      const d = await runFile(f, target);
      if (d.error) {
        setErr(d.error);
        setRes(null);
      } else {
        setRes(d);
      }
    } catch {
      setErr("Could not reach the engine. Start it with `python -m kalos.portal`.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRes(null);
    setFile(null);
    setErr("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const reliability =
    res?.cv_spearman == null ? "n/a" : res.cv_spearman < 0.2 ? "Low" : res.cv_spearman < 0.5 ? "Moderate" : "Good";

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Analyze your data"
        desc="Drop a run sheet (one experiment per row, with a measured output). Kalos learns what drives your result, cross-validates honestly, and recommends the next experiments to run."
      />

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) analyze(f);
        }}
      />

      {!res && !busy ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a run sheet (CSV, TSV, or Excel)"
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
            if (f) analyze(f);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors",
            drag ? "border-accent bg-accent-soft" : "border-border bg-card",
          )}
        >
          <Upload className="size-6 text-accent" />
          <div className="text-sm font-semibold">
            Drop a run sheet here <span className="font-normal text-muted">or click to choose</span>
          </div>
          <div className="font-mono text-[11px] text-muted">CSV · TSV · XLSX · parsed by the engine, not stored</div>
        </div>
      ) : null}

      {err ? <Card className="text-sm text-explore-deep">{err}</Card> : null}
      {busy ? (
        <Card>
          <Loading />
        </Card>
      ) : null}

      {res ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="font-mono text-xs text-muted">
              {file?.name} · {res.n} rows · {res.d} inputs{res.group_col ? ` · grouped by ${res.group_col}` : ""}
            </div>
            <label className="ml-auto flex items-center gap-2 text-[11px] text-muted">
              maximize
              <select
                className="min-h-[28px] rounded-lg border border-border bg-card px-2 py-1.5 font-mono text-[11px] text-fg"
                value={res.target}
                onChange={(e) => file && analyze(file, e.target.value)}
              >
                {res.targets.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X />
              Clear
            </Button>
          </div>

          <div className="mb-5 grid grid-cols-3 gap-3">
            <Kpi hero label={`Best ${res.target}`} value={fmt(res.best, 3)} />
            <Kpi
              label={<span title="How well the model predicted runs it had never seen. Higher = more trustworthy suggestions.">Model reliability</span>}
              value={reliability}
              hint={res.cv_spearman != null ? `held-out corr ${res.cv_spearman.toFixed(2)}` : "too few runs"}
            />
            <Kpi label="Runs / inputs" value={`${res.n}/${res.d}`} />
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <div>
              <SectionLabel>Drivers — raises (emerald) or lowers (clay) {res.target}</SectionLabel>
              <DriversBar drivers={res.drivers} />
            </div>
            <div>
              <SectionLabel>Predicted vs measured (out-of-fold)</SectionLabel>
              <PredScatter oof={res.oof} />
            </div>
          </div>

          <SectionLabel>Recommended next experiments</SectionLabel>
          <Proposals
            cols={res.proposal_features}
            rows={res.proposals}
            predHead={`pred. ${res.target}`}
            predFn={(p) => `${p.pred} ± ${p.std}`}
          />
        </Card>
      ) : null}
    </div>
  );
}
