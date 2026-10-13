"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { UploadZone } from "@/components/campaign/upload-zone";
import { ValidationSummary } from "@/components/campaign/validation-summary";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import { campaignStage } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";

/**
 * Setup: upload a run sheet, choose the target, read the data check. The
 * analysis shown is the shared /api/latest, so it survives navigation and the
 * shell updates the moment an upload lands. Changing the target re-fits from
 * the file still held here, so after a reload the picker asks for the file again.
 */
export default function SetupPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { runFile } = useEngineWrites();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(f: File, target?: string) {
    setFile(f);
    setBusy(true);
    setError(null);
    try {
      const d = await runFile(f, target);
      // The engine's own { error } is a problem with the sheet, not the connection.
      if (d.error) setError(d.error);
    } catch {
      setError("The analysis service did not respond. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (latest.status === "error" && !latest.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Set up the campaign" />
        <ErrorState onRetry={() => void latest.refresh()} busy={latest.refreshing} />
      </div>
    );
  }

  const analysis = latest.data?.has_data ? latest.data : null;
  const report = analysis?.validation;
  const next = campaignStage(latest.data ?? { has_data: false }, campaign.data ?? { has_campaign: false }).next;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Set up the campaign"
        description="Upload the runs you already have and choose what to maximize. Kalos checks the sheet, then fits the model."
        action={
          analysis && report?.status !== "fail" ? (
            <Link href={next.href} className={buttonVariants()}>
              {next.action}
              <ArrowRight />
            </Link>
          ) : null
        }
      />

      <UploadZone onFile={(f) => void analyze(f)} disabled={busy} compact={!!analysis} />

      {error ? <Callout tone="bad" title="This run sheet could not be analyzed">{error}</Callout> : null}
      {busy ? <LoadingSkeleton variant="rows" rows={4} label="Analyzing the run sheet" /> : null}
      {latest.status === "loading" ? <LoadingSkeleton variant="rows" rows={3} /> : null}

      {analysis && !busy ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-body text-fg-muted">
              {analysis.dataset}: {formatNumber(analysis.n, "count")} runs, {formatNumber(analysis.d, "count")} inputs.
            </p>
            <label className="flex flex-col gap-1.5 text-label text-fg sm:max-w-sm">
              Maximize
              <Select value={analysis.target} onValueChange={(t) => file && t && void analyze(file, t)} disabled={!file}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {analysis.targets.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-caption font-normal text-fg-muted">
                {file ? "Choosing another column re-fits the model without a new upload." : "Upload the sheet again to change the target."}
              </span>
            </label>
          </div>
          {report ? (
            <ValidationSummary report={report} />
          ) : (
            <p className="text-body text-fg-muted">This analysis came without a data check, so nothing here should be read as a pass.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
