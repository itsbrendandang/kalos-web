"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, WifiOff, X } from "lucide-react";
import { useEngineWrites } from "@/hooks/use-engine";
import { isReliable, type AnalyzeResult } from "@/lib/api";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Loading } from "@/components/page-header";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ValidationReportCard } from "@/components/validation/validation-report";
import { cn } from "@/lib/utils";

type EngineErrorKind = "unreachable" | "rejected";

export default function SetupPage() {
  const { runFile } = useEngineWrites();
  const [res, setRes] = useState<AnalyzeResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ kind: EngineErrorKind; message: string } | null>(null);
  // Bumped on reset() to remount <UploadDropzone> (see below) - that clears
  // its internal file input, so re-selecting the same-named file after
  // "Analyze another file" fires onChange again instead of being deduped.
  const [resetCount, setResetCount] = useState(0);

  async function analyze(f: File, target?: string) {
    setFile(f);
    setBusy(true);
    setErr(null);
    try {
      const d = await runFile(f, target);
      if (d.error) {
        // The engine's own { error } message, a data/upload problem, not a
        // transport failure - see runFile's contract in lib/api.ts.
        setErr({ kind: "rejected", message: d.error });
        setRes(null);
      } else {
        setRes(d);
      }
    } catch {
      setErr({
        kind: "unreachable",
        message: "Analysis service unavailable. Try again in a moment or contact Kalos support.",
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRes(null);
    setFile(null);
    setErr(null);
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

      {err ? (
        <Alert variant="default" className="items-start gap-2.5 border-red/30 bg-red/5 px-3.5 py-3">
          {err.kind === "unreachable" ? (
            <WifiOff className="size-4 text-red" aria-hidden />
          ) : (
            <AlertCircle className="size-4 text-red" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <AlertTitle className="text-[13px] text-fg">
              {err.kind === "unreachable" ? "Engine unreachable" : "Upload rejected"}
            </AlertTitle>
            <AlertDescription className="mt-1 text-[12.5px] leading-5 text-muted">{err.message}</AlertDescription>
          </div>
        </Alert>
      ) : null}
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
                <Badge
                  variant="outline"
                  className={cn(
                    "h-auto gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    reliability === "Reliable"
                      ? "border-green/30 bg-green-soft text-green"
                      : reliability === "Needs review"
                        ? "border-amber/30 bg-amber-soft text-amber"
                        : "border-border bg-blue-soft text-muted",
                  )}
                  title="How well the model predicted runs it had never seen. Higher = more trustworthy suggestions."
                >
                  Model reliability: {reliability}
                </Badge>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/campaign/learn" className={buttonVariants()}>
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
              <Select value={res.target} onValueChange={(value) => file && value && analyze(file, value)}>
                <SelectTrigger size="sm" className="w-full font-mono text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {res.targets.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[11px] leading-snug text-muted">
                Re-fits the model against a different target column without re-uploading.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Interim: the old /validate page's verdict, until Setup is rebuilt. Provider status lives in Settings. */}
      {res ? <ValidationReportCard report={res.validation} /> : null}
    </div>
  );
}
