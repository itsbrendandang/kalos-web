"use client";

import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { API, runFile, type AnalyzeResult } from "@/lib/api";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader, Loading } from "@/components/page-header";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ValidationReportCard } from "@/components/validation/validation-report";
import { ProviderStatus } from "@/components/validation/provider-status";

type EngineErrorKind = "unreachable" | "rejected";

export default function ValidatePage() {
  const [res, setRes] = useState<AnalyzeResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ kind: EngineErrorKind; message: string } | null>(null);
  const [resetCount, setResetCount] = useState(0);

  async function validate(f: File) {
    setFile(f);
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const d = await runFile(f);
      if (d.error) {
        // The engine's own { error } message, shown verbatim - never
        // paraphrased, so a scientist sees exactly what the engine rejected.
        setErr({ kind: "rejected", message: d.error });
      } else {
        setRes(d);
      }
    } catch {
      setErr({
        kind: "unreachable",
        message: `The Kalos engine is not reachable at ${API}. Start it, or check NEXT_PUBLIC_API_URL, then try again.`,
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

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Pre-flight"
        title="Validate"
        desc="Upload a run sheet and see only the data-validation verdict - units, bounds, duplicates, missingness, and more - before committing to a full optimization run."
      />

      {!res && !busy ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <UploadDropzone key={resetCount} onFile={(f) => validate(f)} />
          <Card className="bg-blue-soft">
            <SectionLabel>What gets checked</SectionLabel>
            <div className="space-y-2 text-[12px] leading-5 text-muted">
              <p>Units, physical bounds, duplicate rows, missing data, outliers, provenance metadata, replicate adequacy, controls, and constant columns.</p>
              <p>Nothing here re-runs the model - this is only the pre-flight check on the data itself.</p>
            </div>
          </Card>
        </div>
      ) : null}

      {busy ? (
        <Card>
          <Loading label="Validating run sheet" />
        </Card>
      ) : null}

      {err ? (
        <Alert
          variant="default"
          className="flex flex-col gap-3 border-red/30 bg-red/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-red">
              <AlertCircle className="size-5" />
            </span>
            <div>
              <AlertTitle className="font-head text-[16px] font-semibold text-fg">
                {err.kind === "unreachable" ? "Engine unreachable" : "Upload rejected"}
              </AlertTitle>
              <AlertDescription className="mt-1 max-w-[62ch] text-[13px] leading-5 text-fg">{err.message}</AlertDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <X />
            Try another file
          </Button>
        </Alert>
      ) : null}

      {res ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted">
              {file?.name} parsed into {res.n} rows across {res.d} inputs.
            </p>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X />
              Validate another file
            </Button>
          </div>
          <ValidationReportCard report={res.validation} />
        </>
      ) : null}

      <ProviderStatus />
    </div>
  );
}
