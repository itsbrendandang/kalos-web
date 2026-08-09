"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { isReliable, runFile, type AnalyzeResult } from "@/lib/api";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/page-header";
import { UploadDropzone } from "@/components/upload-dropzone";
import { cn } from "@/lib/utils";

export default function AnalyzePage() {
  const [res, setRes] = useState<AnalyzeResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Bumped on reset() to remount <UploadDropzone> (see below) - that clears
  // its internal file input, so re-selecting the same-named file after
  // "Analyze another file" fires onChange again instead of being deduped.
  const [resetCount, setResetCount] = useState(0);

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
      setErr("Analysis service unavailable. Try again in a moment or contact Kalos support.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRes(null);
    setFile(null);
    setErr("");
    setResetCount((c) => c + 1);
  }

  // Reuses the same isReliable() predicate as the Dashboard (lib/api.ts) so a dataset
  // never reads "reliable" here and "needs review" there - see app/page.tsx KpiStrip.
  const reliability = res?.cv_spearman == null ? "n/a" : isReliable(res) ? "Reliable" : "Needs review";

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Run sheet upload"
        title="Run analysis"
        desc="Upload bioprocessing experiment data to fit the model, check reliability, and generate the next recommended recipes."
      />

      {!res && !busy ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <UploadDropzone key={resetCount} onFile={(f) => analyze(f)} />
          <Card className="bg-blue-soft">
            <SectionLabel>Run sheet checklist</SectionLabel>
            <div className="space-y-3 text-[12.5px] text-muted">
              {[
                "One experiment per row",
                "Recipe inputs in separate columns",
                "Measured output column included",
                "Replicate or batch column when available",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {err ? <Card className="border-amber/30 bg-amber-soft text-sm text-amber">{err}</Card> : null}
      {busy ? (
        <Card>
          <Loading />
        </Card>
      ) : null}

      {res ? (
        <Card className="overflow-hidden p-0">
          <div className="grid md:grid-cols-[1fr_300px]">
            <div className="p-6">
              <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                <CheckCircle2 className="size-6" />
              </span>
              <h2 className="font-head text-[22px] font-semibold">Analysis complete</h2>
              <p className="mt-2 max-w-[58ch] text-[13.5px] leading-5 text-muted">
                {file?.name} parsed into {res.n} runs across {res.d} inputs
                {res.group_col ? `, grouped by ${res.group_col}` : ""}, fit against {res.target}.
              </p>
              <div className="mt-4">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    reliability === "Reliable"
                      ? "border-green/30 bg-green-soft text-green"
                      : reliability === "Needs review"
                        ? "border-amber/30 bg-amber-soft text-amber"
                        : "border-border bg-blue-soft text-muted",
                  )}
                  title="How well the model predicted runs it had never seen. Higher = more trustworthy suggestions."
                >
                  Model reliability: {reliability}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/results" className={buttonVariants()}>
                  View results
                  <ArrowRight />
                </Link>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X />
                  Analyze another file
                </Button>
              </div>
            </div>
            <div className="border-t border-border bg-blue-soft p-5 md:border-t-0 md:border-l">
              <SectionLabel>Maximize</SectionLabel>
              <select
                className="min-h-[32px] w-full rounded-lg border border-border bg-card px-2 py-1.5 font-mono text-[11px] text-fg"
                value={res.target}
                onChange={(e) => file && analyze(file, e.target.value)}
              >
                {res.targets.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <p className="mt-2 text-[11px] leading-snug text-muted">
                Re-fits the model against a different target column without re-uploading.
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
